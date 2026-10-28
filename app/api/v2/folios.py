from typing import Literal

from fastapi import APIRouter, Body, Depends, Query

from app import models
from app.api.v2.dependencias import servicio_folios
from app.modulos.folios.esquemas import FoliosNuevos, FoliosRevisados, GrupoFolios, PaginaFolios, RevisarFolios
from app.modulos.folios.servicio import ServicioFolios
from app.nucleo.paginacion import ParametrosPagina, parametros_pagina
from app.nucleo.sesion import usuario_actual

router = APIRouter(tags=["Folios"])


@router.get("/procesos/{proceso_id}/folios", response_model=PaginaFolios, summary="Listar los folios de un expediente")
def listar_folios(
    proceso_id: int,
    grupo: GrupoFolios | None = Query(None, description="Solo actuaciones, documentos, mensajes o tareas."),
    orden: Literal["recientes", "antiguos"] = Query("recientes"),
    desde: int | None = Query(None, ge=1, description="Empieza en este folio (para «Ir al folio»)."),
    pagina: ParametrosPagina = Depends(parametros_pagina),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFolios = Depends(servicio_folios),
):
    """Cada registro del expediente con su número de folio. Folia lo que aún no tenga número."""
    return servicio.listar(
        usuario, proceso_id, grupo=grupo, descendente=orden == "recientes", desde=desde, pagina=pagina,
    )


@router.post("/procesos/{proceso_id}/folios/revisar", response_model=FoliosRevisados, summary="Marcar folios revisados")
def revisar_folios(
    proceso_id: int,
    datos: RevisarFolios = Body(default_factory=RevisarFolios),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFolios = Depends(servicio_folios),
):
    return servicio.revisar(usuario, proceso_id, datos.numeros)


@router.get("/folios/nuevos", response_model=FoliosNuevos, summary="Folios nuevos de todos los procesos")
def folios_nuevos(
    limite: int = Query(20, ge=1, le=100),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFolios = Depends(servicio_folios),
):
    """Lo que llegó sin revisar a los procesos activos que el usuario puede ver, del más reciente al más antiguo."""
    return servicio.nuevos(usuario, limite)
