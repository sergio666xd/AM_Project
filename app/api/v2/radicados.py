from fastapi import APIRouter, Depends, Response, status

from app import models
from app.api.v2.dependencias import servicio_radicados
from app.modulos.radicados.esquemas import ListaRadicados, RadicadoDetalle
from app.modulos.radicados.servicio import ServicioRadicados
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/radicados", tags=["Radicados"])


@router.get("", response_model=ListaRadicados, summary="Radicados de la firma")
def listar_radicados(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioRadicados = Depends(servicio_radicados),
):
    """Los radicados de los procesos que usted ve, con su última actuación, sus novedades sin revisar y
    cómo terminó la última consulta a la Rama Judicial. Del más reciente movimiento al más antiguo."""
    return servicio.listar(usuario)


@router.get("/{radicado_id}", response_model=RadicadoDetalle, summary="Un radicado con sus actuaciones")
def obtener_radicado_detalle(
    radicado_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioRadicados = Depends(servicio_radicados),
):
    """Todas las actuaciones del radicado; las que usted aún no revisa vienen con `nueva`."""
    return servicio.detalle(usuario, radicado_id)


@router.post("/{radicado_id}/revisado", status_code=status.HTTP_204_NO_CONTENT, summary="Marcar las novedades como revisadas")
def marcar_radicado_revisado(
    radicado_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioRadicados = Depends(servicio_radicados),
):
    """Quita el aviso de actuaciones nuevas de este radicado para usted."""
    servicio.marcar_revisado(usuario, radicado_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
