from fastapi import APIRouter, Depends, Query

from app import models
from app.api.v2.dependencias import servicio_busqueda
from app.modulos.busqueda.esquemas import Resultados
from app.modulos.busqueda.servicio import ServicioBusqueda
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/busqueda", tags=["Búsqueda"])


@router.get("", response_model=Resultados, summary="Búsqueda global")
def buscar(
    q: str = Query(min_length=2, max_length=100, description="Nombre de proceso, radicado (con o sin guiones), cliente, documento o tarea."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioBusqueda = Depends(servicio_busqueda),
):
    """Hasta seis resultados por grupo, solo dentro de lo que el usuario puede ver."""
    return servicio.buscar(usuario, q.strip())
