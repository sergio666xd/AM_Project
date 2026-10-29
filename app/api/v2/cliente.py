from fastapi import APIRouter, Depends, File, UploadFile, status

from app import models
from app.api.v2.dependencias import servicio_portal_cliente
from app.document_validation import MAX_DOCUMENT_BYTES
from app.modulos.portal_cliente.esquemas import (
    InicioCliente,
    PaginaHistoria,
    PedidoDocumento,
    PendientesCliente,
    ProcesoCliente,
)
from app.modulos.portal_cliente.servicio import ServicioPortalCliente
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/cliente", tags=["Portal del cliente"])


@router.get("/inicio", response_model=InicioCliente, summary="Inicio del cliente")
def inicio_cliente(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Lo que la firma necesita del cliente, en qué va cada uno de sus procesos y lo último que pasó."""
    return servicio.inicio(usuario)


@router.get("/procesos/{proceso_id}", response_model=ProcesoCliente, summary="Un proceso del cliente")
def proceso_cliente(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Etapa, próxima fecha, pendientes y documentos de un proceso del cliente."""
    return servicio.proceso(usuario, proceso_id)


@router.get("/procesos/{proceso_id}/historia", response_model=PaginaHistoria, summary="Historia del proceso")
def historia_proceso_cliente(
    proceso_id: int,
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Los folios del expediente que le corresponden al cliente, del más reciente al más antiguo y en lenguaje claro."""
    return servicio.historia(usuario, proceso_id, pagina)


@router.post("/procesos/{proceso_id}/visto", status_code=status.HTTP_204_NO_CONTENT, summary="Marcar el proceso como visto")
def marcar_proceso_visto(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Lo que hay hasta ahora deja de aparecerle como nuevo."""
    servicio.marcar_visto(usuario, proceso_id)


@router.get("/pendientes", response_model=PendientesCliente, summary="Lo que la firma necesita del cliente")
def pendientes_cliente(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Documentos por enviar y tareas por hacer en todos sus procesos, y lo que ya entregó en los últimos 30 días."""
    return servicio.pendientes(usuario)


@router.post(
    "/solicitudes/{solicitud_id}/pedidos/{pedido_id}/archivo",
    response_model=PedidoDocumento,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar un documento pedido",
)
def enviar_documento_cliente(
    solicitud_id: int,
    pedido_id: str,
    archivo: UploadFile = File(..., description="PDF, JPG, PNG o Word (.docx), de máximo 15 MB."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """Sube el archivo de uno de los documentos de la solicitud. Si la firma lo devolvió, queda como nueva versión."""
    return servicio.enviar_documento(
        usuario, solicitud_id, pedido_id, nombre=archivo.filename or "documento", tipo=archivo.content_type,
        contenido=archivo.file.read(MAX_DOCUMENT_BYTES + 1),
    )


@router.post("/tareas/{tarea_id}/hecha", status_code=status.HTTP_204_NO_CONTENT, summary="Marcar una tarea como hecha")
def marcar_tarea_hecha(
    tarea_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """La tarea que la firma le asignó al cliente queda hecha y se le avisa a quien la lleva."""
    servicio.marcar_tarea_hecha(usuario, tarea_id)


@router.post("/subtareas/{subtarea_id}/hecha", status_code=status.HTTP_204_NO_CONTENT, summary="Marcar una parte de una tarea como hecha")
def marcar_subtarea_hecha(
    subtarea_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioPortalCliente = Depends(servicio_portal_cliente),
):
    """La subtarea que le tocaba al cliente queda hecha y se le avisa a quien lleva la tarea."""
    servicio.marcar_subtarea_hecha(usuario, subtarea_id)
