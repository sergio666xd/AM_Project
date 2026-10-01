from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.firm_access import (
    has_firm_wide_access,
    lawyer_process_ids,
    lawyer_scope_id,
    require_roles,
)
from app.notification_policy import plan_whatsapp_habilitado, whatsapp_habilitado
from app.security import obtener_usuario_actual
from app.tasks import tarea_enviar_email, tarea_enviar_whatsapp


router = APIRouter(
    prefix="/api/tareas",
    tags=["Tareas"],
)


def filtrar_tareas_por_firma(query, db: Session):
    procesos = db.query(models.Proceso.id).filter(models.Proceso.archivado_en.is_(None))
    radicados = db.query(models.Radicado.id)
    actuaciones = db.query(models.Actuacion.id)
    clientes = db.query(models.Usuario.id).filter(models.Usuario.rol == models.RolUsuario.CLIENTE)
    return query.filter(
        or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso_id.in_(procesos)),
        or_(models.Tarea.radicado_id.is_(None), models.Tarea.radicado_id.in_(radicados)),
        or_(models.Tarea.actuacion_id.is_(None), models.Tarea.actuacion_id.in_(actuaciones)),
        or_(models.Tarea.cliente_id.is_(None), models.Tarea.cliente_id.in_(clientes)),
    )


def filtrar_tareas_cliente(query, cliente: models.Usuario, db: Session):
    procesos = (
        db.query(models.ProcesoCliente.proceso_id)
        .join(models.Proceso, models.Proceso.id == models.ProcesoCliente.proceso_id)
        .filter(
            models.ProcesoCliente.cliente_id == cliente.id,
            models.Proceso.archivado_en.is_(None),
        )
    )
    radicados = (
        db.query(models.ProcesoRadicado.radicado_id)
        .join(models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.ProcesoRadicado.proceso_id)
        .join(models.Proceso, models.Proceso.id == models.ProcesoCliente.proceso_id)
        .filter(
            models.ProcesoCliente.cliente_id == cliente.id,
            models.Proceso.archivado_en.is_(None),
        )
    )
    actuaciones = (
        db.query(models.Actuacion.id)
        .join(models.ProcesoRadicado, models.ProcesoRadicado.radicado_id == models.Actuacion.radicado_id)
        .join(models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.ProcesoRadicado.proceso_id)
        .join(models.Proceso, models.Proceso.id == models.ProcesoCliente.proceso_id)
        .filter(
            models.ProcesoCliente.cliente_id == cliente.id,
            models.Proceso.archivado_en.is_(None),
        )
    )
    return query.filter(
        or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso_id.in_(procesos)),
        or_(models.Tarea.radicado_id.is_(None), models.Tarea.radicado_id.in_(radicados)),
        or_(models.Tarea.actuacion_id.is_(None), models.Tarea.actuacion_id.in_(actuaciones)),
    )


def obtener_tarea_usuario(tarea_id: int, usuario_actual: models.Usuario, db: Session):
    query = db.query(models.Tarea).filter(models.Tarea.id == tarea_id)
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        query = filtrar_tareas_cliente(query.filter(models.Tarea.cliente_id == usuario_actual.id), usuario_actual, db)
    elif not has_firm_wide_access(usuario_actual):
        responsible_lawyer_id = lawyer_scope_id(usuario_actual)
        assigned_processes = lawyer_process_ids(db, usuario_actual)
        query = query.filter(or_(models.Tarea.usuario_id == responsible_lawyer_id, models.Tarea.proceso_id.in_(assigned_processes)))
    query = filtrar_tareas_por_firma(query, db)
    tarea = query.first()
    if not tarea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada.")
    return tarea


def serializar_tarea_para_usuario(tarea: models.Tarea, usuario: models.Usuario):
    if usuario.rol != models.RolUsuario.CLIENTE:
        return tarea
    data = schemas.TareaOut.model_validate(tarea).model_dump()
    data["subtareas"] = [
        subtask
        for subtask in data["subtareas"]
        if subtask["asignada_cliente"] and subtask["cliente_id"] == usuario.id
    ]
    return data


def subtarea_cliente_permitida(subtarea_id: int, cliente_id: int, db: Session) -> bool:
    return db.query(models.Subtarea).filter(
        models.Subtarea.id == subtarea_id,
        models.Subtarea.cliente_id == cliente_id,
        models.Subtarea.asignada_cliente == True,
    ).first() is not None


def require_task_manager(usuario: models.Usuario, tarea: models.Tarea, action: str, db: Session | None = None) -> None:
    require_roles(usuario, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action=action)
    if has_firm_wide_access(usuario) or tarea.usuario_id == usuario.id:
        return
    if db is not None and tarea.proceso_id is not None:
        assigned_process = db.query(models.Proceso.id).filter(
            models.Proceso.id == tarea.proceso_id,
            models.Proceso.id.in_(lawyer_process_ids(db, usuario)),
        ).first()
        if assigned_process:
            return
    raise HTTPException(status_code=403, detail=f"No tienes permiso para {action}.")


def validar_actualizacion_tarea(datos: schemas.TareaUpdate, tarea: models.Tarea, usuario: models.Usuario, db: Session | None = None) -> None:
    if usuario.rol == models.RolUsuario.CLIENTE:
        if tarea.cliente_id != usuario.id:
            raise HTTPException(status_code=403, detail="El cliente solo puede actualizar sus tareas asignadas.")
        campos = getattr(datos, "model_fields_set", None)
        if campos is None:
            campos = getattr(datos, "__fields_set__", set())
        if campos != {"estado"} or datos.estado != models.EstadoTarea.COMPLETADA:
            raise HTTPException(status_code=403, detail="El cliente solo puede marcar sus tareas como completadas.")
        return
    require_task_manager(usuario, tarea, action="actualizar tareas", db=db)


def validar_relaciones_tarea(datos, usuario_actual: models.Usuario, db: Session):
    responsible_lawyer_id = lawyer_scope_id(usuario_actual)
    radicado = None
    actuacion = None
    if datos.radicado_id is not None:
        query = db.query(models.Radicado).filter(models.Radicado.id == datos.radicado_id)
        if responsible_lawyer_id is not None:
            assigned_radicados = db.query(models.ProcesoRadicado.radicado_id).filter(
                models.ProcesoRadicado.proceso_id.in_(lawyer_process_ids(db, usuario_actual))
            )
            query = query.filter(
                or_(
                    models.Radicado.usuarios_vinculados.any(
                        models.Usuario.id == responsible_lawyer_id
                    ),
                    models.Radicado.id.in_(assigned_radicados),
                )
            )
        radicado = query.first()
        if not radicado:
            raise HTTPException(status_code=404, detail="El radicado no está disponible para tu alcance.")
    if datos.actuacion_id is not None:
        query = (
            db.query(models.Actuacion)
            .join(models.Radicado, models.Actuacion.radicado_id == models.Radicado.id)
            .filter(models.Actuacion.id == datos.actuacion_id)
        )
        if responsible_lawyer_id is not None:
            assigned_radicados = db.query(models.ProcesoRadicado.radicado_id).filter(
                models.ProcesoRadicado.proceso_id.in_(lawyer_process_ids(db, usuario_actual))
            )
            query = query.filter(
                or_(
                    models.Radicado.usuarios_vinculados.any(
                        models.Usuario.id == responsible_lawyer_id
                    ),
                    models.Radicado.id.in_(assigned_radicados),
                )
            )
        actuacion = query.first()
        if not actuacion:
            raise HTTPException(status_code=404, detail="La actuación no está disponible para tu alcance.")
        if datos.radicado_id is not None and actuacion.radicado_id != datos.radicado_id:
            raise HTTPException(status_code=400, detail="La actuación no pertenece al radicado indicado.")
        if radicado is None:
            radicado = db.query(models.Radicado).filter(models.Radicado.id == actuacion.radicado_id).first()
    return radicado, actuacion


def validar_asignacion_subtarea(
    datos,
    tarea: models.Tarea,
    usuario: models.Usuario,
    db: Session,
    existente: models.Subtarea | None = None,
):
    fields_set = getattr(datos, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(datos, "__fields_set__", set())

    scope_fields = ("proceso_id", "radicado_id", "actuacion_id")
    scope = {}
    for field in scope_fields:
        parent_value = getattr(tarea, field)
        requested_value = getattr(datos, field, None)
        if existente is not None and field not in fields_set:
            requested_value = getattr(existente, field)
        if parent_value is not None and requested_value not in (None, parent_value):
            raise HTTPException(status_code=400, detail="La subtarea debe permanecer dentro del ámbito de su tarea padre.")
        scope[field] = requested_value if requested_value is not None else parent_value

    process = None
    if scope["proceso_id"] is not None:
        process_query = db.query(models.Proceso).filter(
            models.Proceso.id == scope["proceso_id"],
            models.Proceso.archivado_en.is_(None),
        )
        if not has_firm_wide_access(usuario):
            process_query = process_query.filter(
                models.Proceso.id.in_(lawyer_process_ids(db, usuario))
            )
        process = process_query.first()
        if not process:
            raise HTTPException(status_code=404, detail="Proceso no disponible para esta subtarea.")

    relation_data = schemas.TareaCreate(
        titulo="Subtarea",
        proceso_id=scope["proceso_id"],
        radicado_id=scope["radicado_id"],
        actuacion_id=scope["actuacion_id"],
    )
    radicado, actuacion = validar_relaciones_tarea(relation_data, usuario, db)
    if process and radicado and not db.query(models.ProcesoRadicado).filter_by(
        proceso_id=process.id,
        radicado_id=radicado.id,
    ).first():
        raise HTTPException(status_code=400, detail="El radicado no pertenece al proceso de la subtarea.")
    if process and actuacion and not db.query(models.ProcesoRadicado).filter_by(
        proceso_id=process.id,
        radicado_id=actuacion.radicado_id,
    ).first():
        raise HTTPException(status_code=400, detail="La actuación no pertenece al proceso de la subtarea.")

    assigned_to_client = bool(
        getattr(datos, "asignada_cliente", False)
        if existente is None or "asignada_cliente" in fields_set
        else existente.asignada_cliente
    )
    client_id = getattr(datos, "cliente_id", None)
    if existente is not None and "cliente_id" not in fields_set:
        client_id = existente.cliente_id
    if assigned_to_client and client_id is None:
        client_id = tarea.cliente_id
    if assigned_to_client and client_id is None:
        raise HTTPException(status_code=400, detail="Selecciona el cliente que recibirá la subtarea.")
    if not assigned_to_client:
        if client_id is not None:
            raise HTTPException(status_code=400, detail="Marca la asignación al cliente para enviarle la subtarea.")
        client_id = None
    if assigned_to_client:
        if tarea.cliente_id is not None and client_id != tarea.cliente_id:
            raise HTTPException(status_code=400, detail="La subtarea solo puede asignarse al cliente de la tarea padre.")
        client = db.query(models.Usuario).filter(
            models.Usuario.id == client_id,
            models.Usuario.rol == models.RolUsuario.CLIENTE,
        ).first()
        if not client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        if process:
            assigned = db.query(models.ProcesoCliente).filter_by(
                proceso_id=process.id, cliente_id=client.id
            ).first()
            if client.creado_por_abogado_id != process.abogado_id and not assigned:
                raise HTTPException(status_code=400, detail="El cliente no está asignado al proceso de la subtarea.")
        elif client.creado_por_abogado_id != tarea.usuario_id:
            raise HTTPException(status_code=400, detail="El cliente no pertenece a la tarea ni al proceso seleccionado.")

    return {
        **scope,
        "asignada_cliente": assigned_to_client,
        "cliente_id": client_id,
        "notificar_email": bool(
            getattr(datos, "notificar_email", True)
            if existente is None or "notificar_email" in fields_set
            else existente.notificar_email
        ),
        "notificar_whatsapp": bool(
            getattr(datos, "notificar_whatsapp", True)
            if existente is None or "notificar_whatsapp" in fields_set
            else existente.notificar_whatsapp
        ),
    }


def notificar_subtarea_asignada(
    subtarea: models.Subtarea,
    usuario: models.Usuario,
    db: Session,
) -> None:
    if not subtarea.asignada_cliente or subtarea.cliente_id is None:
        return
    cliente = db.query(models.Usuario).filter_by(id=subtarea.cliente_id).first()
    if cliente is None:
        return
    mensaje = f"{usuario.nombre_completo} le ha asignado la subtarea: {subtarea.titulo}."
    if subtarea.notificar_email and cliente.notificaciones_email:
        tarea_enviar_email.delay(cliente.email, "Nueva subtarea asignada", mensaje)
    if (
        subtarea.notificar_whatsapp
        and whatsapp_habilitado(cliente)
        and plan_whatsapp_habilitado(usuario, "notificaciones_whatsapp_tareas")
    ):
        tarea_enviar_whatsapp.delay(cliente.whatsapp_numero, mensaje)


@router.get("", response_model=list[schemas.TareaOut])
def listar_tareas(
    estado: models.EstadoTarea | None = None,
    radicado_id: int | None = None,
    actuacion_id: int | None = None,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    query = db.query(models.Tarea)
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        query = filtrar_tareas_cliente(query.filter(models.Tarea.cliente_id == usuario_actual.id), usuario_actual, db)
    elif not has_firm_wide_access(usuario_actual):
        responsible_lawyer_id = lawyer_scope_id(usuario_actual)
        assigned_processes = lawyer_process_ids(db, usuario_actual)
        query = query.filter(or_(models.Tarea.usuario_id == responsible_lawyer_id, models.Tarea.proceso_id.in_(assigned_processes)))
    query = filtrar_tareas_por_firma(query, db)
    if estado is not None:
        query = query.filter(models.Tarea.estado == estado)
    if radicado_id is not None:
        query = query.filter(models.Tarea.radicado_id == radicado_id)
    if actuacion_id is not None:
        query = query.filter(models.Tarea.actuacion_id == actuacion_id)
    tareas = query.order_by(models.Tarea.fecha_limite.asc().nullslast(), models.Tarea.created_at.desc()).all()
    return [serializar_tarea_para_usuario(tarea, usuario_actual) for tarea in tareas]


@router.get("/{tarea_id}", response_model=schemas.TareaOut)
def obtener_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    return serializar_tarea_para_usuario(
        obtener_tarea_usuario(tarea_id, usuario_actual, db),
        usuario_actual,
    )


@router.post("", response_model=schemas.TareaOut, status_code=status.HTTP_201_CREATED)
def crear_tarea(
    datos: schemas.TareaCreate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    require_roles(usuario_actual, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="crear tareas")
    titulo = datos.titulo.strip()
    if not titulo:
        raise HTTPException(status_code=400, detail="El título de la tarea es obligatorio.")

    responsible_lawyer_id = lawyer_scope_id(usuario_actual)
    proceso = None
    if datos.proceso_id is not None:
        query = db.query(models.Proceso).filter(
            models.Proceso.id == datos.proceso_id,
            models.Proceso.archivado_en.is_(None),
        )
        if responsible_lawyer_id is not None:
            query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario_actual)))
        proceso = query.first()
        if not proceso:
            raise HTTPException(status_code=404, detail="Proceso no encontrado o no asignado.")

    radicado, actuacion = validar_relaciones_tarea(datos, usuario_actual, db)
    if datos.cliente_id is not None:
        cliente = db.query(models.Usuario).filter(
            models.Usuario.id == datos.cliente_id,
            models.Usuario.rol == models.RolUsuario.CLIENTE,
        ).first()
        if not cliente:
            raise HTTPException(status_code=400, detail="Cliente no encontrado.")
        if datos.proceso_id is not None and not db.query(models.ProcesoCliente).filter_by(
            proceso_id=datos.proceso_id, cliente_id=datos.cliente_id
        ).first():
            raise HTTPException(status_code=400, detail="El cliente no está asignado al proceso de la tarea.")
        if responsible_lawyer_id is not None and datos.proceso_id is None:
            client_process = (
                db.query(models.ProcesoCliente.proceso_id)
                .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
                .filter(
                    models.ProcesoCliente.cliente_id == datos.cliente_id,
                    models.Proceso.id.in_(lawyer_process_ids(db, usuario_actual)),
                )
                .first()
            )
            if cliente.creado_por_abogado_id != responsible_lawyer_id and not client_process:
                raise HTTPException(status_code=400, detail="El cliente no está asignado a tus procesos.")

    radicado_id = actuacion.radicado_id if datos.actuacion_id is not None and datos.radicado_id is None else datos.radicado_id
    responsable_id = usuario_actual.id
    if has_firm_wide_access(usuario_actual):
        responsable_id = proceso.abogado_id if proceso is not None else radicado.creado_por_id if radicado is not None else usuario_actual.id
    tarea = models.Tarea(
        usuario_id=responsable_id,
        radicado_id=radicado_id,
        actuacion_id=datos.actuacion_id,
        proceso_id=datos.proceso_id,
        cliente_id=datos.cliente_id,
        titulo=titulo,
        descripcion=datos.descripcion,
        estado=datos.estado,
        prioridad=datos.prioridad,
        fecha_limite=datos.fecha_limite,
    )
    if datos.estado == models.EstadoTarea.COMPLETADA:
        tarea.completada_en = datetime.utcnow()
    db.add(tarea)
    db.flush()
    registrar_evento_auditoria(db, usuario_actual, "tarea.crear", "tarea", tarea.id)
    db.commit()
    db.refresh(tarea)

    if tarea.cliente_id:
        cliente = db.query(models.Usuario).filter_by(id=tarea.cliente_id).first()
        if cliente:
            mensaje = f"{usuario_actual.nombre_completo} le ha asignado una tarea: {tarea.titulo}."
            if cliente.notificaciones_email:
                tarea_enviar_email.delay(cliente.email, "Nueva tarea asignada", mensaje)
            if whatsapp_habilitado(cliente) and plan_whatsapp_habilitado(usuario_actual, "notificaciones_whatsapp_tareas"):
                tarea_enviar_whatsapp.delay(cliente.whatsapp_numero, mensaje)
    return tarea


@router.put("/{tarea_id}", response_model=schemas.TareaOut)
def actualizar_tarea(
    tarea_id: int,
    datos: schemas.TareaUpdate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(tarea_id, usuario_actual, db)
    validar_actualizacion_tarea(datos, tarea, usuario_actual, db)
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        tarea.estado = models.EstadoTarea.COMPLETADA
        if tarea.completada_en is None:
            tarea.completada_en = datetime.utcnow()
        registrar_evento_auditoria(db, usuario_actual, "tarea.completar", "tarea", tarea.id)
        db.commit()
        db.refresh(tarea)
        return tarea

    if datos.titulo is not None:
        titulo = datos.titulo.strip()
        if not titulo:
            raise HTTPException(status_code=400, detail="El título de la tarea no puede estar vacío.")
        tarea.titulo = titulo
    if datos.descripcion is not None:
        tarea.descripcion = datos.descripcion
    if datos.estado is not None:
        tarea.estado = datos.estado
        tarea.completada_en = datetime.utcnow() if datos.estado == models.EstadoTarea.COMPLETADA else None
    if datos.prioridad is not None:
        tarea.prioridad = datos.prioridad
    if datos.fecha_limite is not None:
        tarea.fecha_limite = datos.fecha_limite
    if datos.radicado_id is not None or datos.actuacion_id is not None:
        radicado, actuacion = validar_relaciones_tarea(datos, usuario_actual, db)
        if datos.actuacion_id is not None:
            tarea.actuacion_id = datos.actuacion_id
            tarea.radicado_id = actuacion.radicado_id
        else:
            tarea.radicado_id = datos.radicado_id
            tarea.actuacion_id = None
    registrar_evento_auditoria(db, usuario_actual, "tarea.actualizar", "tarea", tarea.id)
    db.commit()
    db.refresh(tarea)
    return serializar_tarea_para_usuario(tarea, usuario_actual)


@router.patch("/{tarea_id}/completar", response_model=schemas.TareaOut)
def completar_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(tarea_id, usuario_actual, db)
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        if tarea.cliente_id != usuario_actual.id:
            raise HTTPException(status_code=403, detail="El cliente solo puede completar sus tareas asignadas.")
        if tarea.estado == models.EstadoTarea.COMPLETADA:
            return tarea
    else:
        require_task_manager(usuario_actual, tarea, action="completar tareas", db=db)

    if tarea.estado == models.EstadoTarea.COMPLETADA:
        tarea.estado = models.EstadoTarea.PENDIENTE
        tarea.completada_en = None
    else:
        tarea.estado = models.EstadoTarea.COMPLETADA
        tarea.completada_en = datetime.utcnow()

    registrar_evento_auditoria(db, usuario_actual, "tarea.completar", "tarea", tarea.id)
    db.commit()
    db.refresh(tarea)

    return serializar_tarea_para_usuario(tarea, usuario_actual)

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
    require_task_manager(usuario_actual, tarea, action="eliminar tareas", db=db)

    registrar_evento_auditoria(db, usuario_actual, "tarea.eliminar", "tarea", tarea.id)
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
    require_task_manager(usuario_actual, tarea, action="crear subtareas", db=db)

    titulo = datos.titulo.strip()

    if not titulo:
        raise HTTPException(
            status_code=400,
            detail="El título de la subtarea es obligatorio.",
        )

    assignment = validar_asignacion_subtarea(datos, tarea, usuario_actual, db)

    subtarea = models.Subtarea(
        tarea_id=tarea.id,
        titulo=titulo,
        orden=datos.orden,
        **assignment,
    )

    db.add(subtarea)
    db.flush()
    registrar_evento_auditoria(db, usuario_actual, "subtarea.crear", "subtarea", subtarea.id)
    db.commit()
    db.refresh(subtarea)

    notificar_subtarea_asignada(subtarea, usuario_actual, db)

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
    campos = getattr(datos, "model_fields_set", None)
    if campos is None:
        campos = getattr(datos, "__fields_set__", set())
    if usuario_actual.rol == models.RolUsuario.CLIENTE and (
        campos != {"completada"} or datos.completada is not True or not subtarea_cliente_permitida(subtarea_id, usuario_actual.id, db)
    ):
        raise HTTPException(status_code=403, detail="El cliente solo puede completar sus subtareas asignadas.")
    if usuario_actual.rol != models.RolUsuario.CLIENTE:
        require_task_manager(usuario_actual, tarea, action="actualizar subtareas", db=db)

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

    old_assignment = (
        subtarea.asignada_cliente,
        subtarea.cliente_id,
        subtarea.notificar_email,
        subtarea.notificar_whatsapp,
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

    if usuario_actual.rol != models.RolUsuario.CLIENTE:
        assignment = validar_asignacion_subtarea(
            datos, tarea, usuario_actual, db, existente=subtarea
        )
        for field, value in assignment.items():
            setattr(subtarea, field, value)

    registrar_evento_auditoria(db, usuario_actual, "subtarea.actualizar", "subtarea", subtarea.id)
    db.commit()
    db.refresh(subtarea)

    new_assignment = (
        subtarea.asignada_cliente,
        subtarea.cliente_id,
        subtarea.notificar_email,
        subtarea.notificar_whatsapp,
    )
    if new_assignment[0] and new_assignment[1] and (
        old_assignment[:2] != new_assignment[:2]
        or (not old_assignment[2] and new_assignment[2])
        or (not old_assignment[3] and new_assignment[3])
    ):
        notificar_subtarea_asignada(subtarea, usuario_actual, db)

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
    require_task_manager(usuario_actual, tarea, action="eliminar subtareas", db=db)

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

    registrar_evento_auditoria(db, usuario_actual, "subtarea.eliminar", "subtarea", subtarea.id)
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
    require_task_manager(usuario_actual, tarea, action="gestionar recordatorios", db=db)

    responsable = tarea.usuario
    if not whatsapp_habilitado(responsable) or not plan_whatsapp_habilitado(responsable, "notificaciones_whatsapp_tareas"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Activa WhatsApp y configura un número para recibir recordatorios.",
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
    db.flush()
    registrar_evento_auditoria(db, usuario_actual, "recordatorio.crear", "recordatorio_tarea", recordatorio.id)
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
    require_task_manager(usuario_actual, tarea, action="gestionar recordatorios", db=db)

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

    registrar_evento_auditoria(db, usuario_actual, "recordatorio.actualizar", "recordatorio_tarea", recordatorio.id)
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
    require_task_manager(usuario_actual, tarea, action="gestionar recordatorios", db=db)

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

    registrar_evento_auditoria(db, usuario_actual, "recordatorio.eliminar", "recordatorio_tarea", recordatorio.id)
    db.delete(recordatorio)
    db.commit()

    return {
        "mensaje": "Recordatorio eliminado correctamente."
    }
