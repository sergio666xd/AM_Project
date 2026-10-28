from fastapi import APIRouter, Depends, Request, Response, status

from app import models
from app.api.v2.dependencias import servicio_sesion
from app.modulos.identidad.esquemas import IniciarSesion, UsuarioSesion
from app.modulos.identidad.servicio import ServicioSesion
from app.nucleo.sesion import borrar_cookie_sesion, fijar_cookie_sesion, usuario_en_sesion
from app.rate_limit import ip_cliente

router = APIRouter(prefix="/sesion", tags=["Sesión"])


@router.post("", response_model=UsuarioSesion, summary="Iniciar sesión")
def iniciar_sesion(
    datos: IniciarSesion,
    request: Request,
    response: Response,
    servicio: ServicioSesion = Depends(servicio_sesion),
):
    """Valida el correo y la contraseña y deja la sesión en una cookie httpOnly.

    Si `debe_cambiar_password` es verdadero, el resto de la API responde 403
    con el código `cambio_password_requerido` hasta que la cambie.
    """
    usuario = servicio.iniciar(datos.email, datos.password, ip=ip_cliente(request))
    fijar_cookie_sesion(response, servicio.emitir_token(usuario, persistente=datos.recordarme), persistente=datos.recordarme)
    return usuario


@router.get("", response_model=UsuarioSesion, summary="Usuario de la sesión")
def obtener_sesion(usuario: models.Usuario = Depends(usuario_en_sesion)):
    return usuario


@router.post("/renovar", response_model=UsuarioSesion, summary="Renovar la sesión")
def renovar_sesion(
    request: Request,
    response: Response,
    usuario: models.Usuario = Depends(usuario_en_sesion),
    servicio: ServicioSesion = Depends(servicio_sesion),
):
    """Emite un token nuevo con la duración completa, conservando "recordarme"."""
    persistente = bool(request.state.sesion.get("persistent"))
    fijar_cookie_sesion(response, servicio.emitir_token(usuario, persistente=persistente), persistente=persistente)
    return usuario


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Cerrar sesión en este dispositivo")
def cerrar_sesion(response: Response):
    borrar_cookie_sesion(response)


@router.delete("/todas", status_code=status.HTTP_204_NO_CONTENT, summary="Cerrar sesión en todos los dispositivos")
def cerrar_todas_las_sesiones(
    response: Response,
    usuario: models.Usuario = Depends(usuario_en_sesion),
    servicio: ServicioSesion = Depends(servicio_sesion),
):
    servicio.cerrar_todas(usuario)
    borrar_cookie_sesion(response)
