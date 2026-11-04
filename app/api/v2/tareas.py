from fastapi import APIRouter, Depends, Query, status

from app import models
from app.api.v2.dependencias import servicio_tareas
from app.modulos.tareas.esquemas import (
    AplicarPlantilla,
    CambioEnLote,
    CambiosRecordatorio,
    CambiosSubtarea,
    CambiosTarea,
    DatosRecordatorio,
    DatosSubtarea,
    DatosTarea,
    DatosPlantilla,
    Grupo,
    ListaPlantillas,
    ListaTareas,
    Plantilla,
    ResultadoLote,
    TareaDetalle,
    TareasCreadas,
)
from app.modulos.tareas.servicio import ServicioTareas
from app.nucleo.sesion import usuario_actual

router = APIRouter(prefix="/tareas", tags=["Tareas"])


@router.get("", response_model=ListaTareas, summary="Tareas del equipo")
def listar_tareas(
    grupo: Grupo = Query("abiertas", description="abiertas, vencidas, semana (vencen en 7 días), completadas o todas."),
    proceso_id: int | None = Query(None),
    solo_mias: bool = Query(False, description="Solo las tareas de las que el usuario es responsable."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """Tareas de los procesos activos que el usuario ve y sus tareas generales, con el resumen
    de abiertas, vencidas, de la semana y completadas (con los mismos filtros de proceso y responsable)."""
    return servicio.listar(usuario, grupo, proceso_id, solo_mias)


@router.patch("/lote", response_model=ResultadoLote, summary="Cambiar varias tareas a la vez")
def cambiar_tareas_en_lote(
    datos: CambioEnLote,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """Cambia estado, prioridad o fecha límite de todas las tareas elegidas, o las elimina.
    Si alguna no existe o el usuario no la ve, no se cambia ninguna."""
    return servicio.cambiar_en_lote(usuario, datos)


@router.get("/plantillas", response_model=ListaPlantillas, summary="Plantillas de tareas")
def listar_plantillas(
    para: str | None = Query(None, max_length=2000, description="Texto de una actuación: las plantillas que coinciden van primero."),
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.plantillas(usuario, para)


@router.post("/plantillas", response_model=Plantilla, status_code=status.HTTP_201_CREATED, summary="Crear una plantilla")
def crear_plantilla(
    datos: DatosPlantilla,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.crear_plantilla(usuario, datos)


@router.put("/plantillas/{plantilla_id}", response_model=Plantilla, summary="Editar una plantilla")
def editar_plantilla(
    plantilla_id: int,
    datos: DatosPlantilla,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.editar_plantilla(usuario, plantilla_id, datos)


@router.delete("/plantillas/{plantilla_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar una plantilla")
def eliminar_plantilla(
    plantilla_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    servicio.eliminar_plantilla(usuario, plantilla_id)


@router.post("/plantillas/{plantilla_id}/aplicar", response_model=TareasCreadas, status_code=status.HTTP_201_CREATED,
             summary="Crear las tareas de una plantilla")
def aplicar_plantilla(
    plantilla_id: int,
    datos: AplicarPlantilla,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """Crea una tarea por paso en el proceso. Cada fecha límite se cuenta en días hábiles
    desde la notificación, con la misma calculadora de términos."""
    return servicio.aplicar_plantilla(usuario, plantilla_id, datos)


# Las rutas con id van después de /lote y /plantillas para que no las tapen.


@router.post("", response_model=TareaDetalle, status_code=status.HTTP_201_CREATED, summary="Crear una tarea")
def crear_tarea_nueva(
    datos: DatosTarea,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """General o de un proceso. Si se asigna a un cliente, le llega a su portal y la plataforma
    le recuerda 24 y 12 horas antes del vencimiento; si no, se le recuerda al responsable."""
    return servicio.crear(usuario, datos)


@router.get("/{tarea_id}", response_model=TareaDetalle, summary="Ver una tarea")
def obtener_tarea(
    tarea_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.obtener(usuario, tarea_id)


@router.patch("/{tarea_id}", response_model=TareaDetalle, summary="Cambiar una tarea")
def editar_tarea(
    tarea_id: int,
    datos: CambiosTarea,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """Cambia solo lo enviado. Cerrarla descarta sus recordatorios; reabrirla o moverle la fecha
    los vuelve a programar. A la otra parte (cliente asignado o responsable) se le avisa el cambio."""
    return servicio.editar(usuario, tarea_id, datos)


@router.delete("/{tarea_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar una tarea")
def eliminar_tarea(
    tarea_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    servicio.eliminar(usuario, tarea_id)


@router.post("/{tarea_id}/subtareas", response_model=TareaDetalle, status_code=status.HTTP_201_CREATED,
             summary="Agregar una subtarea")
def crear_subtarea(
    tarea_id: int,
    datos: DatosSubtarea,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """Con `cliente_id`, se le pide a un cliente del proceso: la ve en su portal y se le avisa."""
    return servicio.crear_subtarea(usuario, tarea_id, datos)


@router.patch("/{tarea_id}/subtareas/{subtarea_id}", response_model=TareaDetalle, summary="Cambiar una subtarea")
def editar_subtarea(
    tarea_id: int,
    subtarea_id: int,
    datos: CambiosSubtarea,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.editar_subtarea(usuario, tarea_id, subtarea_id, datos)


@router.delete("/{tarea_id}/subtareas/{subtarea_id}", response_model=TareaDetalle, summary="Quitar una subtarea")
def eliminar_subtarea(
    tarea_id: int,
    subtarea_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.eliminar_subtarea(usuario, tarea_id, subtarea_id)


@router.post("/{tarea_id}/recordatorios", response_model=TareaDetalle, status_code=status.HTTP_201_CREATED,
             summary="Programar un recordatorio")
def crear_recordatorio(
    tarea_id: int,
    datos: DatosRecordatorio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    """Le llega al responsable de la tarea, en un momento exacto o con anticipación al vencimiento."""
    return servicio.crear_recordatorio(usuario, tarea_id, datos)


@router.patch("/{tarea_id}/recordatorios/{recordatorio_id}", response_model=TareaDetalle,
              summary="Cambiar o pausar un recordatorio")
def editar_recordatorio(
    tarea_id: int,
    recordatorio_id: int,
    datos: CambiosRecordatorio,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.editar_recordatorio(usuario, tarea_id, recordatorio_id, datos)


@router.delete("/{tarea_id}/recordatorios/{recordatorio_id}", response_model=TareaDetalle,
               summary="Quitar un recordatorio")
def eliminar_recordatorio(
    tarea_id: int,
    recordatorio_id: int,
    usuario: models.Usuario = Depends(usuario_actual),
    servicio: ServicioTareas = Depends(servicio_tareas),
):
    return servicio.eliminar_recordatorio(usuario, tarea_id, recordatorio_id)
