"""Sesión de la API v2: cookie httpOnly, usuario actual y protección CSRF.

El token sigue siendo el JWT de `app.security`, pero viaja en una cookie
`httpOnly` que el JavaScript del navegador no puede leer. El frontend y la
API comparten dominio en Vercel (`/api` se reescribe al backend), así que la
cookie va sola en cada petición sin CORS con credenciales.

También se acepta `Authorization: Bearer <token>` para clientes que no son
navegador.

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

# Un `Authorization: Bearer` vacío o con estos valores se trata como "sin
# token" y manda la cookie.
MARCADORES_SIN_TOKEN = {"", "cookie", "null", "undefined"}


def token_de_solicitud(request: Request) -> tuple[str | None, str]:
    """Devuelve el token y de dónde vino: `"encabezado"` o `"cookie"`."""
    autorizacion = request.headers.get("authorization", "")
    if autorizacion.lower().startswith("bearer "):
        valor = autorizacion[7:].strip()
        if valor not in MARCADORES_SIN_TOKEN:
            return valor, "encabezado"
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
        raise NoAutenticado("Hace falta iniciar sesión para continuar.")
    payload = security.decode_token_payload(token)
    # Los tokens con `purpose` (recuperación de contraseña) no son sesiones.
    if not payload or payload.get("purpose"):
        raise NoAutenticado("La sesión expiró. Hace falta ingresar de nuevo.", codigo="sesion_expirada")
    try:
        usuario_id = int(payload.get("sub"))
    except (TypeError, ValueError) as exc:
        raise NoAutenticado("La sesión expiró. Hace falta ingresar de nuevo.", codigo="sesion_expirada") from exc
    usuario = db.get(models.Usuario, usuario_id)
    if usuario is None or not security.token_vigente(payload, usuario):
        raise NoAutenticado("La sesión expiró. Hace falta ingresar de nuevo.", codigo="sesion_expirada")
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
            "Antes de continuar hay que cambiar la contraseña temporal.",
            codigo="cambio_password_requerido",
        )
    return usuario


def _sin_encabezado_csrf(request: Request) -> bool:
    """Si es un cambio autenticado con la cookie que no trae un encabezado propio."""
    if request.method in METODOS_SEGUROS:
        return False
    _token, origen = token_de_solicitud(request)
    if origen != "cookie" or not request.cookies.get(ajustes().cookie_sesion):
        return False
    return request.headers.get(ENCABEZADO_CSRF) != "1"


MENSAJE_CSRF = "La solicitud se rechazó por seguridad. Recargue la página y vuelva a intentarlo."


def proteger_csrf(request: Request) -> None:
    if _sin_encabezado_csrf(request):
        raise SinPermiso(MENSAJE_CSRF, codigo="csrf")
