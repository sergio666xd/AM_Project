from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import obtener_usuario_actual


router = APIRouter(
    prefix="/api/tareas",
    tags=["Tareas"],
)


def obtener_tarea_usuario(
    tarea_id: int,
    usuario_actual: models.Usuario,
    db: Session,
):
    tarea = (
        db.query(models.Tarea)
        .filter(
            models.Tarea.id == tarea_id,
            models.Tarea.usuario_id == usuario_actual.id,
        )
        .first()
    )

    if not tarea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarea no encontrada.",
        )

    return tarea


def validar_relaciones_tarea(
    datos,
    usuario_actual: models.Usuario,
    db: Session,
):
    radicado = None
    actuacion = None

    if datos.radicado_id is not None:
        radicado = (
            db.query(models.Radicado)
            .filter(
                models.Radicado.id == datos.radicado_id,
                models.Radicado.usuario_id == usuario_actual.id,
            )
            .first()
        )

        if not radicado:
            raise HTTPException(
                status_code=404,
                detail="El proceso indicado no existe en tu cuenta.",
            )

    if datos.actuacion_id is not None:
        actuacion = (
            db.query(models.Actuacion)
            .join(
                models.Radicado,
                models.Actuacion.radicado_id == models.Radicado.id,
            )
            .filter(
                models.Actuacion.id == datos.actuacion_id,
                models.Radicado.usuario_id == usuario_actual.id,
            )
            .first()
        )

        if not actuacion:
            raise HTTPException(
                status_code=404,
                detail="La actuación indicada no existe en tu cuenta.",
            )

        if (
            datos.radicado_id is not None
            and actuacion.radicado_id != datos.radicado_id
        ):
            raise HTTPException(
                status_code=400,
                detail="La actuación no pertenece al proceso indicado.",
            )

        if datos.radicado_id is None:
            radicado = (
                db.query(models.Radicado)
                .filter(
                    models.Radicado.id == actuacion.radicado_id,
                    models.Radicado.usuario_id == usuario_actual.id,
                )
                .first()
            )

    return radicado, actuacion


@router.get(
    "",
    response_model=list[schemas.TareaOut],
)
def listar_tareas(
    estado: models.EstadoTarea | None = None,
    radicado_id: int | None = None,
    actuacion_id: int | None = None,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    query = (
        db.query(models.Tarea)
        .filter(
            models.Tarea.usuario_id == usuario_actual.id
        )
    )

    if estado is not None:
        query = query.filter(
            models.Tarea.estado == estado
        )

    if radicado_id is not None:
        query = query.filter(
            models.Tarea.radicado_id == radicado_id
        )

    if actuacion_id is not None:
        query = query.filter(
            models.Tarea.actuacion_id == actuacion_id
        )

    return (
        query
        .order_by(
            models.Tarea.fecha_limite.asc().nullslast(),
            models.Tarea.created_at.desc(),
        )
        .all()
    )


@router.get(
    "/{tarea_id}",
    response_model=schemas.TareaOut,
)
def obtener_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    return obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )


@router.post(
    "",
    response_model=schemas.TareaOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_tarea(
    datos: schemas.TareaCreate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    titulo = datos.titulo.strip()

    if not titulo:
        raise HTTPException(
            status_code=400,
            detail="El título de la tarea es obligatorio.",
        )

    radicado, actuacion = validar_relaciones_tarea(
        datos,
        usuario_actual,
        db,
    )

    if datos.actuacion_id is not None and datos.radicado_id is None:
        radicado_id = actuacion.radicado_id
    else:
        radicado_id = datos.radicado_id

    tarea = models.Tarea(
        usuario_id=usuario_actual.id,
        radicado_id=radicado_id,
        actuacion_id=datos.actuacion_id,
        titulo=titulo,
        descripcion=datos.descripcion,
        estado=datos.estado,
        prioridad=datos.prioridad,
        fecha_limite=datos.fecha_limite,
    )

    if datos.estado == models.EstadoTarea.COMPLETADA:
        tarea.completada_en = datetime.utcnow()

    db.add(tarea)
    db.commit()
    db.refresh(tarea)

    return tarea


@router.put(
    "/{tarea_id}",
    response_model=schemas.TareaOut,
)
def actualizar_tarea(
    tarea_id: int,
    datos: schemas.TareaUpdate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    if datos.titulo is not None:
        titulo = datos.titulo.strip()

        if not titulo:
            raise HTTPException(
                status_code=400,
                detail="El título de la tarea no puede estar vacío.",
            )

        tarea.titulo = titulo

    if datos.descripcion is not None:
        tarea.descripcion = datos.descripcion

    if datos.estado is not None:
        tarea.estado = datos.estado

        if datos.estado == models.EstadoTarea.COMPLETADA:
            if tarea.completada_en is None:
                tarea.completada_en = datetime.utcnow()
        else:
            tarea.completada_en = None

    if datos.prioridad is not None:
        tarea.prioridad = datos.prioridad

    if datos.fecha_limite is not None:
        tarea.fecha_limite = datos.fecha_limite

    if (
        datos.radicado_id is not None
        or datos.actuacion_id is not None
    ):
        radicado, actuacion = validar_relaciones_tarea(
            datos,
            usuario_actual,
            db,
        )

        if datos.actuacion_id is not None:
            tarea.actuacion_id = datos.actuacion_id
            tarea.radicado_id = actuacion.radicado_id

        elif datos.radicado_id is not None:
            tarea.radicado_id = datos.radicado_id
            tarea.actuacion_id = None

    db.commit()
    db.refresh(tarea)

    return tarea


@router.patch("/{tarea_id}/completar", response_model=schemas.TareaOut)
def completar_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(tarea_id, usuario_actual, db)

    if tarea.estado == models.EstadoTarea.COMPLETADA:
        tarea.estado = models.EstadoTarea.PENDIENTE
        tarea.completada_en = None
    else:
        tarea.estado = models.EstadoTarea.COMPLETADA
        tarea.completada_en = datetime.utcnow()

    db.commit()
    db.refresh(tarea)

    return tarea

@router.delete(
    "/{tarea_id}",
)
def eliminar_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    db.delete(tarea)
    db.commit()

    return {
        "mensaje": "Tarea eliminada correctamente."
    }


# ============================================================
# SUBTAREAS
# ============================================================

@router.post(
    "/{tarea_id}/subtareas",
    response_model=schemas.SubtareaOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_subtarea(
    tarea_id: int,
    datos: schemas.SubtareaCreate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    titulo = datos.titulo.strip()

    if not titulo:
        raise HTTPException(
            status_code=400,
            detail="El título de la subtarea es obligatorio.",
        )

    subtarea = models.Subtarea(
        tarea_id=tarea.id,
        titulo=titulo,
        orden=datos.orden,
    )

    db.add(subtarea)
    db.commit()
    db.refresh(subtarea)

    return subtarea


@router.patch(
    "/{tarea_id}/subtareas/{subtarea_id}",
    response_model=schemas.SubtareaOut,
)
def actualizar_subtarea(
    tarea_id: int,
    subtarea_id: int,
    datos: schemas.SubtareaUpdate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    subtarea = (
        db.query(models.Subtarea)
        .filter(
            models.Subtarea.id == subtarea_id,
            models.Subtarea.tarea_id == tarea.id,
        )
        .first()
    )

    if not subtarea:
        raise HTTPException(
            status_code=404,
            detail="Subtarea no encontrada.",
        )

    if datos.titulo is not None:
        titulo = datos.titulo.strip()

        if not titulo:
            raise HTTPException(
                status_code=400,
                detail="El título no puede estar vacío.",
            )

        subtarea.titulo = titulo

    if datos.completada is not None:
        subtarea.completada = datos.completada

        if datos.completada:
            subtarea.completada_en = datetime.utcnow()
        else:
            subtarea.completada_en = None

    if datos.orden is not None:
        subtarea.orden = datos.orden

    db.commit()
    db.refresh(subtarea)

    return subtarea


@router.delete(
    "/{tarea_id}/subtareas/{subtarea_id}",
)
def eliminar_subtarea(
    tarea_id: int,
    subtarea_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    subtarea = (
        db.query(models.Subtarea)
        .filter(
            models.Subtarea.id == subtarea_id,
            models.Subtarea.tarea_id == tarea.id,
        )
        .first()
    )

    if not subtarea:
        raise HTTPException(
            status_code=404,
            detail="Subtarea no encontrada.",
        )

    db.delete(subtarea)
    db.commit()

    return {
        "mensaje": "Subtarea eliminada correctamente."
    }


# ============================================================
# RECORDATORIOS
# ============================================================

@router.post(
    "/{tarea_id}/recordatorios",
    response_model=schemas.RecordatorioTareaOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_recordatorio(
    tarea_id: int,
    datos: schemas.RecordatorioTareaCreate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    if (
        datos.fecha_hora is None
        and datos.anticipacion_minutos is None
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Debes indicar una fecha y hora concreta "
                "o una anticipación respecto al vencimiento."
            ),
        )

    if (
        datos.anticipacion_minutos is not None
        and datos.anticipacion_minutos < 0
    ):
        raise HTTPException(
            status_code=400,
            detail="La anticipación no puede ser negativa.",
        )

    if (
        datos.anticipacion_minutos is not None
        and tarea.fecha_limite is None
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "La tarea debe tener fecha límite "
                "para utilizar una anticipación."
            ),
        )

    recordatorio = models.RecordatorioTarea(
        tarea_id=tarea.id,
        canal=datos.canal,
        activo=datos.activo,
        fecha_hora=datos.fecha_hora,
        anticipacion_minutos=datos.anticipacion_minutos,
    )

    db.add(recordatorio)
    db.commit()
    db.refresh(recordatorio)

    return recordatorio


@router.patch(
    "/{tarea_id}/recordatorios/{recordatorio_id}",
    response_model=schemas.RecordatorioTareaOut,
)
def actualizar_recordatorio(
    tarea_id: int,
    recordatorio_id: int,
    datos: schemas.RecordatorioTareaUpdate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    recordatorio = (
        db.query(models.RecordatorioTarea)
        .filter(
            models.RecordatorioTarea.id == recordatorio_id,
            models.RecordatorioTarea.tarea_id == tarea.id,
        )
        .first()
    )

    if not recordatorio:
        raise HTTPException(
            status_code=404,
            detail="Recordatorio no encontrado.",
        )

    if datos.activo is not None:
        recordatorio.activo = datos.activo

    if datos.fecha_hora is not None:
        recordatorio.fecha_hora = datos.fecha_hora

    if datos.anticipacion_minutos is not None:
        if datos.anticipacion_minutos < 0:
            raise HTTPException(
                status_code=400,
                detail="La anticipación no puede ser negativa.",
            )

        if tarea.fecha_limite is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "La tarea debe tener fecha límite "
                    "para utilizar una anticipación."
                ),
            )

        recordatorio.anticipacion_minutos = (
            datos.anticipacion_minutos
        )

    db.commit()
    db.refresh(recordatorio)

    return recordatorio


@router.delete(
    "/{tarea_id}/recordatorios/{recordatorio_id}",
)
def eliminar_recordatorio(
    tarea_id: int,
    recordatorio_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(
        tarea_id,
        usuario_actual,
        db,
    )

    recordatorio = (
        db.query(models.RecordatorioTarea)
        .filter(
            models.RecordatorioTarea.id == recordatorio_id,
            models.RecordatorioTarea.tarea_id == tarea.id,
        )
        .first()
    )

    if not recordatorio:
        raise HTTPException(
            status_code=404,
            detail="Recordatorio no encontrado.",
        )

    db.delete(recordatorio)
    db.commit()

    return {
        "mensaje": "Recordatorio eliminado correctamente."
    }