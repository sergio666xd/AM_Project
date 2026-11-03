from fastapi import APIRouter, Depends, Response, status

from app import models
from app.api.v2.dependencias import servicio_push
from app.modulos.push.esquemas import (
    BajaSuscripcion,
    ClavePublica,
    ConfirmacionEntrega,
    Diagnostico,
    Dispositivo,
    Dispositivos,
    EstadoPresencia,
    NuevaSuscripcion,
    Presencia,
)
from app.modulos.push.servicio import ServicioPush
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/push", tags=["Notificaciones del navegador"])


@router.get("/clave-publica", response_model=ClavePublica, summary="Clave para suscribir el navegador")
def clave_publica_push(
    _usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    return servicio.clave_publica()


@router.post("/suscripciones", response_model=Dispositivo, status_code=status.HTTP_201_CREATED, summary="Activar en este navegador")
def suscribir_push(
    datos: NuevaSuscripcion,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    """Guarda la suscripción del navegador; si ya existía, pasa a la cuenta actual."""
    return servicio.suscribir(usuario, datos)


@router.post("/suscripciones/baja", status_code=status.HTTP_204_NO_CONTENT, summary="Desactivar en este navegador")
def dar_de_baja_push(
    datos: BajaSuscripcion,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    servicio.dar_de_baja(usuario, datos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/dispositivos", response_model=Dispositivos, summary="Dispositivos con notificaciones")
def dispositivos_push(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    return servicio.dispositivos(usuario)


@router.delete("/dispositivos/{dispositivo_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Quitar un dispositivo")
def quitar_dispositivo_push(
    dispositivo_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    servicio.quitar_dispositivo(usuario, dispositivo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/prueba", status_code=status.HTTP_204_NO_CONTENT, summary="Enviar una notificación de prueba")
def probar_push(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    servicio.probar(usuario)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/diagnosticos", status_code=status.HTTP_204_NO_CONTENT, summary="Informar un fallo al activar")
def diagnostico_push(
    datos: Diagnostico,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    """El navegador avisa en qué paso falló la activación, para revisarlo en los registros."""
    servicio.diagnostico(usuario, datos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/entregado", status_code=status.HTTP_204_NO_CONTENT, summary="El dispositivo recibió el aviso")
def confirmar_entrega_push(datos: ConfirmacionEntrega, servicio: ServicioPush = Depends(servicio_push)):
    """Lo llama el service worker al mostrar la notificación; la firma del aviso reemplaza la sesión."""
    servicio.confirmar_entrega(datos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/presencia", response_model=EstadoPresencia, summary="El panel sigue abierto")
def marcar_presencia(
    datos: Presencia,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    """Mientras haya una pestaña abierta, los mensajes nuevos no se avisan por correo."""
    return servicio.marcar_presencia(usuario, datos)


@router.post("/presencia/cierre", status_code=status.HTTP_204_NO_CONTENT, summary="El panel se cerró")
def cerrar_presencia(
    datos: Presencia,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPush = Depends(servicio_push),
):
    servicio.cerrar_presencia(usuario, datos)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
