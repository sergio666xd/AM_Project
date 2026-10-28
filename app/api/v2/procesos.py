from fastapi import APIRouter, Depends, Query

from app import models
from app.api.v2.dependencias import servicio_procesos
from app.modulos.expedientes.esquemas import CambiarEtapa, PaginaProcesos, ProcesoDetalle
from app.modulos.expedientes.repositorio import FiltroProcesos
from app.modulos.expedientes.servicio import ServicioProcesos
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/procesos", tags=["Procesos"])


@router.get("", response_model=PaginaProcesos, summary="Listar procesos")
def listar_procesos(
    q: str | None = Query(
        None,
        min_length=2,
        max_length=100,
        description="Busca en el nombre del proceso, el radicado (con o sin guiones) y el nombre del cliente.",
    ),
    archivados: bool = Query(False, description="Lista los archivados en lugar de los activos."),
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """Procesos que el usuario puede ver, del más reciente al más antiguo."""
    filtro = FiltroProcesos(texto=q.strip() if q else None, archivados=archivados)
    return servicio.listar(usuario, filtro, pagina)


@router.get("/{proceso_id}", response_model=ProcesoDetalle, summary="Ver un proceso")
def obtener_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.obtener(usuario, proceso_id)


@router.post("/{proceso_id}/archivar", response_model=ProcesoDetalle, summary="Archivar un proceso")
def archivar_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """Saca el proceso de las listas activas sin borrar nada. Se puede reabrir."""
    return servicio.archivar(usuario, proceso_id)


@router.post("/{proceso_id}/reabrir", response_model=ProcesoDetalle, summary="Reabrir un proceso archivado")
def reabrir_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.reabrir(usuario, proceso_id)


@router.patch("/{proceso_id}/etapa", response_model=ProcesoDetalle, summary="Cambiar la etapa del proceso")
def cambiar_etapa(
    proceso_id: int,
    datos: CambiarEtapa,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """Fija la etapa actual y la anota en el historial (y en los folios del expediente)."""
    return servicio.cambiar_etapa(usuario, proceso_id, datos)
