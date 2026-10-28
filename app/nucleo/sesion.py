"""Sesión de la API v2: cookie httpOnly, usuario actual y protección CSRF.

El token sigue siendo el JWT de `app.security`, pero viaja en una cookie
`httpOnly` que el JavaScript del navegador no puede leer. El frontend y la
API comparten dominio en Vercel (`/api` se reescribe al backend), así que la
cookie va sola en cada petición sin CORS con credenciales.

También se acepta `Authorization: Bearer <token>` para clientes que no son
navegador y para la convivencia con la API v1.

CSRF: la cookie es `SameSite=Lax` y, además, toda petición que cambia datos y
se autentica con la cookie debe traer el encabezado `X-AM-Solicitud: 1`. Un
sitio ajeno no puede añadir encabezados propios sin una verificación CORS que
la API no autoriza.
"""

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app import models, security
from app.nucleo.bd import obtener_bd
from app.nucleo.config import ajustes
from app.nucleo.errores import NoAutenticado, SinPermiso

ENCABEZADO_CSRF = "X-AM-Solicitud"
METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


def token_de_solicitud(request: Request) -> tuple[str | None, str]:
    """Devuelve el token y de dónde vino: `"encabezado"` o `"cookie"`."""
    autorizacion = request.headers.get("authorization", "")
    if autorizacion.lower().startswith("bearer "):
        return autorizacion[7:].strip() or None, "encabezado"
    return request.cookies.get(ajustes().cookie_sesion), "cookie"


def fijar_cookie_sesion(response: Response, token: str, *, persistente: bool) -> None:
    """Guarda el token en la cookie. Sin "recordarme" la cookie muere al cerrar el navegador."""
    minutos = security.PERSISTENT_TOKEN_EXPIRE_MINUTES if persistente else None
    response.set_cookie(
        ajustes().cookie_sesion,
        token,
        max_age=minutos * 60 if minutos else None,
        httponly=True,
        secure=ajustes().cookie_es_segura,
        samesite="lax",
        path="/",
    )


def borrar_cookie_sesion(response: Response) -> None:
    response.delete_cookie(
        ajustes().cookie_sesion,
        path="/",
        httponly=True,
        secure=ajustes().cookie_es_segura,
        samesite="lax",
    )


def _usuario_de_token(token: str | None, db: Session) -> tuple[models.Usuario, dict]:
    if not token:
        raise NoAutenticado("Inicia sesión para continuar.")
    payload = security.decode_token_payload(token)
    # Los tokens con `purpose` (recuperación de contraseña) no son sesiones.
    if not payload or payload.get("purpose"):
        raise NoAutenticado("Tu sesión expiró. Inicia sesión de nuevo.", codigo="sesion_expirada")
    try:
        usuario_id = int(payload.get("sub"))
    except (TypeError, ValueError) as exc:
        raise NoAutenticado("Tu sesión expiró. Inicia sesión de nuevo.", codigo="sesion_expirada") from exc
    usuario = db.get(models.Usuario, usuario_id)
    if usuario is None or not security.token_vigente(payload, usuario):
        raise NoAutenticado("Tu sesión expiró. Inicia sesión de nuevo.", codigo="sesion_expirada")
    if usuario.estado != models.EstadoUsuario.ACTIVO:
        raise SinPermiso("La cuenta no está activa.", codigo="cuenta_inactiva")
    return usuario, payload


def usuario_en_sesion(request: Request, db: Session = Depends(obtener_bd)) -> models.Usuario:
    """Usuario de la sesión, aunque todavía deba cambiar la contraseña temporal.

    Deja el contenido del token en `request.state.sesion` para quien lo necesite
    (por ejemplo, renovar conservando "recordarme").
    """
    token, _origen = token_de_solicitud(request)
    usuario, payload = _usuario_de_token(token, db)
    request.state.sesion = payload
    return usuario


def usuario_actual(usuario: models.Usuario = Depends(usuario_en_sesion)) -> models.Usuario:
    """Usuario de la sesión listo para trabajar."""
    if usuario.debe_cambiar_password:
        raise SinPermiso(
            "Debes cambiar la contraseña temporal antes de continuar.",
            codigo="cambio_password_requerido",
        )
    return usuario


def proteger_csrf(request: Request) -> None:
    if request.method in METODOS_SEGUROS:
        return
    _token, origen = token_de_solicitud(request)
    if origen != "cookie" or not request.cookies.get(ajustes().cookie_sesion):
        return
    if request.headers.get(ENCABEZADO_CSRF) != "1":
        raise SinPermiso(
            "La solicitud se rechazó por seguridad. Recarga la página e inténtalo de nuevo.",
            codigo="csrf",
        )
