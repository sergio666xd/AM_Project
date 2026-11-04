from fastapi import APIRouter, Depends, Query, status

from app import models
from app.api.v2.dependencias import servicio_procesos
from app.modulos.expedientes.esquemas import (
    CambiarEtapa,
    CambioMiembro,
    CambiosProceso,
    DatosProceso,
    EquipoProceso,
    NuevoMiembro,
    NuevoRadicado,
    PaginaProcesos,
    ProcesoDetalle,
    RadicadoAgregado,
    RelacionesProceso,
    VincularCliente,
    VinculosProceso,
)
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


@router.post("", response_model=ProcesoDetalle, status_code=status.HTTP_201_CREATED, summary="Crear un proceso")
def crear_proceso_nuevo(
    datos: DatosProceso,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """El usuario queda como responsable. Los clientes, radicados y la etapa se agregan después."""
    return servicio.crear(usuario, datos)


@router.get("/{proceso_id}", response_model=ProcesoDetalle, summary="Ver un proceso")
def obtener_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.obtener(usuario, proceso_id)


@router.get("/{proceso_id}/vinculos", response_model=VinculosProceso, summary="Clientes, radicados y actuaciones del proceso")
def vinculos_del_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """Para relacionar una tarea, un evento o un aviso con algo del proceso."""
    return servicio.vinculos(usuario, proceso_id)


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


@router.patch("/{proceso_id}", response_model=ProcesoDetalle, summary="Cambiar el nombre o la descripción")
def editar_proceso(
    proceso_id: int,
    datos: CambiosProceso,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """Del responsable o la administración. Si cambia el nombre, se avisa a los clientes."""
    return servicio.editar(usuario, proceso_id, datos)


@router.get("/{proceso_id}/relaciones", response_model=RelacionesProceso, summary="Clientes y radicados del proceso")
def relaciones_del_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.relaciones(usuario, proceso_id)


@router.post("/{proceso_id}/clientes", response_model=RelacionesProceso, summary="Dar acceso a un cliente")
def vincular_cliente_al_proceso(
    proceso_id: int,
    datos: VincularCliente,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """El cliente ve el proceso en su portal y recibe un aviso."""
    return servicio.vincular_cliente(usuario, proceso_id, datos)


@router.delete("/{proceso_id}/clientes/{cliente_id}", response_model=RelacionesProceso, summary="Quitar el acceso a un cliente")
def retirar_cliente_del_proceso(
    proceso_id: int,
    cliente_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.retirar_cliente(usuario, proceso_id, cliente_id)


@router.post("/{proceso_id}/radicados", response_model=RadicadoAgregado, status_code=status.HTTP_201_CREATED,
             summary="Agregar un radicado")
def agregar_radicado_al_proceso(
    proceso_id: int,
    datos: NuevoRadicado,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """Crea el radicado o reutiliza el que la firma ya sigue. Si es nuevo para la firma, deja en cola
    una consulta a la Rama Judicial (`consulta_id`), que el panel lanza con el Workflow de consultas."""
    return servicio.agregar_radicado(usuario, proceso_id, datos)


@router.delete("/{proceso_id}/radicados/{radicado_id}", response_model=RelacionesProceso, summary="Quitar un radicado")
def retirar_radicado_del_proceso(
    proceso_id: int,
    radicado_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """El radicado y sus actuaciones siguen en la firma; solo deja de estar en este proceso."""
    return servicio.retirar_radicado(usuario, proceso_id, radicado_id)


@router.get("/{proceso_id}/equipo", response_model=EquipoProceso, summary="Equipo del proceso")
def equipo_del_proceso(
    proceso_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.equipo(usuario, proceso_id)


@router.post("/{proceso_id}/equipo", response_model=EquipoProceso, status_code=status.HTTP_201_CREATED,
             summary="Agregar un abogado al equipo")
def agregar_al_equipo(
    proceso_id: int,
    datos: NuevoMiembro,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    """El abogado recibe un aviso y ve el proceso desde ese momento."""
    return servicio.agregar_miembro(usuario, proceso_id, datos)


@router.patch("/{proceso_id}/equipo/{abogado_id}", response_model=EquipoProceso, summary="Cambiar si el cliente lo ve")
def cambiar_miembro_del_equipo(
    proceso_id: int,
    abogado_id: int,
    datos: CambioMiembro,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.cambiar_miembro(usuario, proceso_id, abogado_id, datos)


@router.delete("/{proceso_id}/equipo/{abogado_id}", response_model=EquipoProceso, summary="Retirar a un abogado del equipo")
def retirar_del_equipo(
    proceso_id: int,
    abogado_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioProcesos = Depends(servicio_procesos),
):
    return servicio.retirar_miembro(usuario, proceso_id, abogado_id)
