from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app import models
from app.api.v2.dependencias import servicio_contratos
from app.modulos.contratos.esquemas import GrupoContratos, ListaContratos, ListaSinContrato
from app.modulos.contratos.servicio import ServicioContratos
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/contratos", tags=["Contratos"])


@router.get("", response_model=ListaContratos, summary="Contratos de servicios")
def listar_contratos(
    grupo: GrupoContratos = Query("en_curso", description="en_curso (borrador, listo o en firma), firmados, cerrados o todos."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Los contratos de los procesos que el usuario ve, con el escaneado firmado si ya lo hay."""
    return servicio.listar(usuario, grupo)


@router.get("/sin-contrato", response_model=ListaSinContrato, summary="Procesos sin contrato")
def procesos_sin_contrato(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    """Procesos activos con cliente que no tienen un contrato vigente."""
    return servicio.sin_contrato(usuario)


@router.get(
    "/{contrato_id}/firmado",
    response_class=StreamingResponse,
    responses={200: {"content": {"application/pdf": {}}, "description": "El escaneado firmado."}},
    summary="Ver o descargar el contrato firmado",
)
def contrato_firmado(
    contrato_id: int,
    descargar: bool = Query(True, description="false lo muestra en el navegador."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioContratos = Depends(servicio_contratos),
):
    cuerpo, documento = servicio.firmado(usuario, contrato_id)
    nombre = quote(documento.nombre_archivo, safe="")
    return StreamingResponse(
        cuerpo,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"{'attachment' if descargar else 'inline'}; filename*=UTF-8''{nombre}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
