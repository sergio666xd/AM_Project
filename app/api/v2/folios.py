from typing import Literal

from fastapi import APIRouter, Body, Depends, Query, status

from app import models
from app.api.v2.dependencias import servicio_folios
from app.modulos.folios.esquemas import (
    AvisarCliente,
    ClientesAvisados,
    FoliosNuevos,
    FoliosRevisados,
    GrupoFolios,
    PaginaFolios,
    RevisarFolios,
    TareaCreada,
    TareaDesdeFolio,
)
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


@router.post(
    "/procesos/{proceso_id}/folios/{numero}/avisar",
    response_model=ClientesAvisados,
    summary="Avisar al cliente de una actuación",
)
def avisar_cliente(
    proceso_id: int,
    numero: int,
    datos: AvisarCliente,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFolios = Depends(servicio_folios),
):
    """Envía la actuación del folio con los comentarios de la firma, por los canales que cada
    cliente tenga activos, y deja el folio revisado."""
    return servicio.avisar(usuario, proceso_id, numero, datos)


@router.post(
    "/procesos/{proceso_id}/folios/{numero}/tarea",
    response_model=TareaCreada,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una tarea desde un folio",
)
def crear_tarea(
    proceso_id: int,
    numero: int,
    datos: TareaDesdeFolio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioFolios = Depends(servicio_folios),
):
    """La tarea queda en el proceso (y en la actuación, si el folio es una) y el folio, revisado."""
    return servicio.crear_tarea(usuario, proceso_id, numero, datos)
