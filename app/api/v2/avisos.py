from fastapi import APIRouter, Depends, Query

from app import models
from app.api.v2.dependencias import servicio_avisos
from app.modulos.avisos.esquemas import Avisos, Marcados, MarcarLeidos
from app.modulos.avisos.servicio import ServicioAvisos
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/avisos", tags=["Avisos"])


@router.get("", response_model=Avisos, summary="Avisos de la campana")
def listar_avisos(
    limite: int = Query(8, ge=1, le=50, description="Cuántos avisos devolver, del más reciente al más antiguo."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAvisos = Depends(servicio_avisos),
):
    """Lo que el usuario debería mirar, según su rol, con el total sin leer."""
    return servicio.listar(usuario, limite)


@router.post("/leer", response_model=Marcados, summary="Marcar avisos como leídos")
def marcar_avisos_leidos(
    datos: MarcarLeidos,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAvisos = Depends(servicio_avisos),
):
    """Ignora los identificadores que no son avisos actuales del usuario."""
    return Marcados(marcados=servicio.marcar(usuario, datos.ids))


@router.post("/leer-todos", response_model=Marcados, summary="Marcar todos los avisos como leídos")
def marcar_todos_los_avisos_leidos(
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioAvisos = Depends(servicio_avisos),
):
    return Marcados(marcados=servicio.marcar(usuario, None))
