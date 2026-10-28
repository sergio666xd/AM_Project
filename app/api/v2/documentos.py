from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse

from app import models
from app.api.v2.dependencias import servicio_documentos
from app.modulos.documentos.esquemas import (
    Archivo,
    CambioFecha,
    GrupoArchivos,
    GrupoSolicitudes,
    ListaArchivos,
    ListaSolicitudes,
    NuevaSolicitud,
    Revision,
    Solicitud,
)
from app.modulos.documentos.servicio import VISTA_PREVIA, ServicioDocumentos
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/documentos", tags=["Documentos"])


@router.get("", response_model=ListaArchivos, summary="Documentos de los procesos")
def listar_documentos(
    grupo: GrupoArchivos = Query("por_revisar", description="por_revisar, por_corregir (devueltos al cliente), aprobados o todos."),
    proceso_id: int | None = Query(None),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    """Lo que entregan los clientes (la versión vigente de cada documento pedido, con sus
    versiones anteriores) y los demás documentos del proceso, sin los de contratos."""
    return servicio.listar_archivos(usuario, grupo, proceso_id)


@router.get("/solicitudes", response_model=ListaSolicitudes, summary="Solicitudes de documentos")
def listar_solicitudes(
    grupo: GrupoSolicitudes = Query("abiertas", description="abiertas, vencidas, completas o todas."),
    proceso_id: int | None = Query(None),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    return servicio.listar_solicitudes(usuario, grupo, proceso_id)


@router.post("/solicitudes", response_model=Solicitud, status_code=status.HTTP_201_CREATED, summary="Pedir documentos al cliente")
def crear_solicitud(
    datos: NuevaSolicitud,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    """Le pide al cliente uno o varios documentos, con fecha límite opcional, y le avisa."""
    return servicio.crear_solicitud(usuario, datos)


@router.patch("/solicitudes/{solicitud_id}", response_model=Solicitud, summary="Cambiar la fecha límite")
def cambiar_fecha_solicitud(
    solicitud_id: int,
    datos: CambioFecha,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    return servicio.cambiar_fecha(usuario, solicitud_id, datos)


@router.post("/solicitudes/{solicitud_id}/recordar", response_model=Solicitud, summary="Recordarle al cliente")
def recordar_solicitud(
    solicitud_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    """Le recuerda al cliente lo que le falta por entregar. Una vez cada 12 horas (409 si no)."""
    return servicio.recordar(usuario, solicitud_id)


@router.delete("/solicitudes/{solicitud_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar una solicitud")
def eliminar_solicitud(
    solicitud_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    """El cliente deja de verla; los archivos que ya entregó se quedan en el proceso."""
    servicio.eliminar_solicitud(usuario, solicitud_id)


@router.get("/{documento_id}", response_model=Archivo, summary="Un documento con sus versiones")
def ver_documento(
    documento_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    return servicio.archivo(usuario, documento_id)


@router.get(
    "/{documento_id}/archivo",
    response_class=StreamingResponse,
    responses={200: {"content": {"application/octet-stream": {}}, "description": "El archivo."}},
    summary="Ver o descargar el archivo",
)
def archivo_documento(
    documento_id: int,
    descargar: bool = Query(True, description="false lo muestra en el navegador si es PDF o imagen."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    cuerpo, documento = servicio.contenido(usuario, documento_id)
    en_linea = not descargar and documento.mime_type in VISTA_PREVIA
    nombre = quote(documento.nombre_archivo, safe="")
    return StreamingResponse(
        cuerpo,
        media_type=documento.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"{'inline' if en_linea else 'attachment'}; filename*=UTF-8''{nombre}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.patch("/{documento_id}/revision", response_model=Archivo, summary="Aprobar o devolver una entrega")
def revisar_documento(
    documento_id: int,
    datos: Revision,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioDocumentos = Depends(servicio_documentos),
):
    """Aprueba la versión vigente o la devuelve al cliente con lo que debe corregir, y le avisa."""
    return servicio.revisar(usuario, documento_id, datos)
