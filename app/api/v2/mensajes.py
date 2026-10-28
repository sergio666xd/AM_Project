from fastapi import APIRouter, Depends, Query, Response, status

from app import models
from app.api.v2.dependencias import servicio_mensajes
from app.modulos.mensajes.esquemas import Conversacion, Hilo, Leido, ListaConversaciones, Mensaje, NuevoMensaje, OpcionReferencia
from app.modulos.mensajes.servicio import ServicioMensajes
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/conversaciones", tags=["Mensajes"])


@router.get("", response_model=ListaConversaciones, summary="Conversaciones del usuario")
def listar_conversaciones(
    sincronizar: bool = Query(True, description="Crea antes las conversaciones que le corresponden. Los sondeos periódicos envían false."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioMensajes = Depends(servicio_mensajes),
):
    """Todas, con el último mensaje, cuántos sin leer y si un cliente espera respuesta. Las más recientes primero."""
    return servicio.listar(usuario, sincronizar=sincronizar)


@router.get("/resolver", response_model=Conversacion, summary="Abrir una conversación por su ruta")
def resolver_conversacion(
    clave: str = Query(description="process:{proceso}:{persona}, process:{proceso}:collaborators o direct:{persona}."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioMensajes = Depends(servicio_mensajes),
):
    """La crea si aún no existe y el usuario puede participar en ella."""
    return servicio.resolver(usuario, clave)


@router.get("/{conversacion_id}", response_model=Hilo, summary="Mensajes de una conversación")
def ver_hilo(
    conversacion_id: int,
    despues_de: int = Query(0, ge=0, description="Solo los mensajes posteriores a este id (para refrescar)."),
    antes_de: int = Query(0, ge=0, description="La página anterior a este id (para subir en el historial)."),
    limite: int = Query(30, ge=1, le=200),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioMensajes = Depends(servicio_mensajes),
):
    """Sin parámetros, los últimos mensajes. Marca como entregados los que recibe el usuario."""
    return servicio.hilo(usuario, conversacion_id, despues_de=despues_de, antes_de=antes_de, limite=limite)


@router.post("/{conversacion_id}/mensajes", response_model=Mensaje, status_code=status.HTTP_201_CREATED, summary="Enviar un mensaje")
def enviar_mensaje(
    conversacion_id: int,
    datos: NuevoMensaje,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioMensajes = Depends(servicio_mensajes),
):
    """Avisa a los demás (push y, si no están en el panel, correo o WhatsApp). En un proceso, queda como folio."""
    return servicio.enviar(usuario, conversacion_id, datos)


@router.post("/{conversacion_id}/leido", status_code=status.HTTP_204_NO_CONTENT, summary="Marcar como leído")
def marcar_leido(
    conversacion_id: int,
    datos: Leido,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioMensajes = Depends(servicio_mensajes),
):
    servicio.leer(usuario, conversacion_id, datos.hasta)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{conversacion_id}/referencias", response_model=list[OpcionReferencia], summary="Qué se puede adjuntar")
def listar_referencias(
    conversacion_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioMensajes = Depends(servicio_mensajes),
):
    """Radicados, actuaciones, tareas, eventos y documentos del proceso que todos los participantes pueden ver."""
    return servicio.referencias(usuario, conversacion_id)
