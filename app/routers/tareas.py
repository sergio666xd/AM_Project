from datetime import datetime, timedelta

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
    require_task_manager,
    require_roles,
)
from app.security import obtener_usuario_actual
from app.notification_service import emitir_notificacion_workflow
from app.notification_policy import plan_whatsapp_habilitado
from app.reminder_workflow import iniciar_workflow_recordatorio, normalizar_utc_naive
from app.workflow_service import user_portal_url
from app.timezone import format_colombia_datetime


router = APIRouter(
    prefix="/api/tareas",
    tags=["Tareas"],
)


def _url_tarea_notificacion(usuario: models.Usuario, tarea_id: int) -> str:
    if usuario.rol == models.RolUsuario.CLIENTE:
        ruta = f"/gestion-procesos/cliente/tareas?tarea={tarea_id}#tarea-{tarea_id}"
    elif usuario.rol == models.RolUsuario.ABOGADO:
        ruta = f"/gestion-procesos/dashboard/tareas/{tarea_id}"
    elif usuario.rol == models.RolUsuario.ADMIN:
        ruta = f"/gestion-procesos/admin/tareas?detalle={tarea_id}"
    else:
        ruta = f"/gestion-procesos/abogado/tareas/{tarea_id}"
    return user_portal_url(usuario, ruta)


def _versionar_recordatorios_pendientes(tarea: models.Tarea, incluir_sistema: bool = True) -> list[int]:
    recordatorio_ids = []
    for recordatorio in tarea.recordatorios:
        if recordatorio.interno_sistema and not incluir_sistema:
            continue
        if not recordatorio.activo or recordatorio.enviado_en is not None:
            continue
        recordatorio.version += 1
        if recordatorio.anticipacion_minutos is not None and tarea.fecha_limite is None:
            recordatorio.activo = False
            continue
        recordatorio_ids.append(recordatorio.id)
    return recordatorio_ids


def _invalidar_recordatorios_sistema(tarea: models.Tarea) -> None:
    for recordatorio in tarea.recordatorios:
        if recordatorio.interno_sistema and recordatorio.activo and recordatorio.enviado_en is None:
            recordatorio.activo = False
            recordatorio.version += 1


def _descartar_recordatorios_tarea(db: Session, tarea: models.Tarea) -> None:
    """Remove scheduled reminders and prevent their queued deliveries from sending."""
    for recordatorio in list(tarea.recordatorios):
        entregas = db.query(models.EntregaNotificacion).filter(
            models.EntregaNotificacion.recordatorio_id == recordatorio.id,
            models.EntregaNotificacion.estado.in_(("PENDIENTE", "ERROR", "ENVIANDO")),
        ).all()
        for entrega in entregas:
            entrega.estado = "DESCARTADA"
            entrega.error = "La tarea fue completada, cancelada o eliminada."
            entrega.lease_hasta = None
        db.delete(recordatorio)
    db.flush()


def _crear_recordatorios_sistema(db: Session, tarea: models.Tarea) -> list[int]:
    if tarea.fecha_limite is None or tarea.estado in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}:
        return []
    destinatario = tarea.cliente_asignado if tarea.cliente_id else tarea.usuario
    if destinatario is None or destinatario.estado != models.EstadoUsuario.ACTIVO:
        return []
    if destinatario.rol == models.RolUsuario.CLIENTE:
        email = bool(destinatario.notificaciones_email and destinatario.email)
        whatsapp = bool(destinatario.notificaciones_whatsapp and destinatario.whatsapp_numero.strip())
    else:
        preferencias = (destinatario.preferencias_notificacion or {}).get("RECORDATORIOS", {})
        email = bool(preferencias.get("email", destinatario.notificaciones_email)) and bool(destinatario.email)
        whatsapp = bool(preferencias.get("whatsapp", destinatario.notificaciones_whatsapp)) and bool(destinatario.whatsapp_numero.strip())
    ids = []
    for anticipacion in (1440, 720):
        fecha_aviso = tarea.fecha_limite - timedelta(minutes=anticipacion)
        if fecha_aviso <= datetime.utcnow():
            continue
        reminder = models.RecordatorioTarea(
            tarea_id=tarea.id,
            canal=models.CanalRecordatorio.WHATSAPP,
            notificar_email=email,
            notificar_whatsapp=whatsapp,
            activo=True,
            version=1,
            workflow_version_lanzada=0,
            anticipacion_minutos=anticipacion,
            interno_sistema=True,
        )
        db.add(reminder)
        db.flush()
        ids.append(reminder.id)
    return ids


def _notificar_cambio_tarea(
    db: Session,
    tarea: models.Tarea,
    actor: models.Usuario,
    accion: str,
    detalle: str,
) -> None:
    destinatarios = []
    cliente = tarea.cliente_asignado if tarea.cliente_id else None
    if cliente and cliente.estado == models.EstadoUsuario.ACTIVO and actor.id != cliente.id:
        destinatarios.append(cliente)
    elif actor.rol == models.RolUsuario.CLIENTE and tarea.usuario and tarea.usuario.id != actor.id:
        destinatarios.append(tarea.usuario)
    elif tarea.usuario and tarea.usuario.id != actor.id:
        destinatarios.append(tarea.usuario)
    if not destinatarios:
        return
    due = format_colombia_datetime(tarea.fecha_limite) if tarea.fecha_limite else "Sin fecha límite"
    process = tarea.proceso.nombre if tarea.proceso else "Tarea general"
    radicado = tarea.radicado.numero if tarea.radicado else "No asociado"
    actuacion = tarea.actuacion_rel.actuacion if tarea.actuacion_rel else "No asociada"
    for destinatario in destinatarios:
        url_tarea = _url_tarea_notificacion(destinatario, tarea.id)
        if accion == "eliminó la tarea":
            if destinatario.rol == models.RolUsuario.CLIENTE:
                url_tarea = user_portal_url(destinatario, "/gestion-procesos/cliente/tareas")
            elif destinatario.rol == models.RolUsuario.ABOGADO:
                url_tarea = user_portal_url(destinatario, "/gestion-procesos/dashboard/tareas")
            elif destinatario.rol == models.RolUsuario.ADMIN:
                url_tarea = user_portal_url(destinatario, "/gestion-procesos/admin/tareas")
            else:
                url_tarea = user_portal_url(destinatario, "/gestion-procesos/abogado/tareas")
        cuerpo = (
            f"Hola {destinatario.nombre_completo},\n\n{actor.nombre_completo} {accion}.\n\n"
            f"Tarea: {tarea.titulo}\nDetalle: {detalle}\nEstado: {tarea.estado.value}\n"
            f"Prioridad: {tarea.prioridad.value}\nFecha límite: {due}\nProceso: {process}\n"
            f"Radicado: {radicado}\nActuación: {actuacion}\n\n"
            f"Abrir enlace: Ver tareas | {url_tarea}"
        )
        emitir_notificacion_workflow(
            db, destinatario, "TAREAS", f"TAREA_ACCION:{tarea.id}:{datetime.utcnow().timestamp()}",
            f"{accion.capitalize()}: {tarea.titulo}", cuerpo, emisor=actor, incluir_email=True,
            plantilla_clave="TAREA_ACCION",
            variables={"nombre": destinatario.nombre_completo, "actor": actor.nombre_completo,
                       "accion": accion, "tarea": tarea.titulo, "detalle": detalle,
                       "estado": tarea.estado.value, "prioridad": tarea.prioridad.value,
                       "fecha_limite": due, "proceso": process, "radicado": radicado,
                       "actuacion": actuacion},
            enlace_texto="Ver tareas", enlace_url=url_tarea,
        )


def _lanzar_recordatorios_pendientes(
    db: Session,
    tarea: models.Tarea,
    recordatorio_ids: list[int],
) -> None:
    if tarea.estado in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}:
        return
    for recordatorio_id in recordatorio_ids:
        iniciar_workflow_recordatorio(db, recordatorio_id)


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


def filtrar_tareas_visibles_cliente(query, cliente: models.Usuario, db: Session):
    assigned_subtasks = db.query(models.Subtarea.tarea_id).filter(
        models.Subtarea.asignada_cliente.is_(True),
        models.Subtarea.cliente_id == cliente.id,
    ).distinct()
    return filtrar_tareas_cliente(query.filter(or_(
        models.Tarea.cliente_id == cliente.id,
        models.Tarea.id.in_(assigned_subtasks),
    )), cliente, db)


def obtener_tarea_usuario(tarea_id: int, usuario_actual: models.Usuario, db: Session):
    query = db.query(models.Tarea).filter(models.Tarea.id == tarea_id)
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        query = filtrar_tareas_visibles_cliente(query, usuario_actual, db)
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
    # A parent task can be visible because one of its subtasks is shared with
    # this client. Do not disclose another client's assignment on that parent.
    if data.get("cliente_id") != usuario.id:
        data["cliente_id"] = None
    return data


def subtarea_cliente_permitida(subtarea_id: int, cliente_id: int, db: Session) -> bool:
    return db.query(models.Subtarea).filter(
        models.Subtarea.id == subtarea_id,
        models.Subtarea.cliente_id == cliente_id,
        models.Subtarea.asignada_cliente == True,
    ).first() is not None


def validar_actualizacion_tarea(datos: schemas.TareaUpdate, tarea: models.Tarea, usuario: models.Usuario, db: Session | None = None) -> None:
    if usuario.rol == models.RolUsuario.CLIENTE:
        if tarea.cliente_id != usuario.id:
            raise HTTPException(status_code=403, detail="El cliente solo puede actualizar sus tareas asignadas.")
        campos = getattr(datos, "model_fields_set", None)
        if campos is None:
            campos = getattr(datos, "__fields_set__", set())
        if campos == {"fecha_limite"} and datos.fecha_limite is not None:
            return
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


def validar_ambito_proceso_radicado_actuacion(
    proceso_id: int | None,
    radicado: models.Radicado | None,
    actuacion: models.Actuacion | None,
    db: Session,
) -> None:
    """Cuando una tarea está en un proceso, impide asociarla a recursos de otro expediente."""
    if proceso_id is None:
        return
    radicado_id = actuacion.radicado_id if actuacion is not None else radicado.id if radicado is not None else None
    if radicado_id is not None and not db.query(models.ProcesoRadicado).filter_by(
        proceso_id=proceso_id, radicado_id=radicado_id
    ).first():
        raise HTTPException(status_code=400, detail="El radicado o la actuación no pertenece al proceso seleccionado.")


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
        raise HTTPException(status_code=400, detail="Selecciona el cliente que recibirá la subtarea.")
    if not assigned_to_client:
        # The client relation belongs to this subtask only; clear it independently.
        client_id = None
    if assigned_to_client:
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
    tarea = db.query(models.Tarea).filter_by(id=subtarea.tarea_id).first()
    tarea_id = tarea.id if tarea else subtarea.tarea_id
    mensaje = (
        f"{usuario.nombre_completo} le ha asignado la subtarea: {subtarea.titulo}.\n"
        f"Abrir tarea: {_url_tarea_notificacion(cliente, tarea_id)}"
    )
    emitir_notificacion_workflow(
        db,
        cliente,
        "SUBTAREAS",
        f"SUBTAREA:{subtarea.id}:{cliente.id}",
        "Nueva subtarea asignada",
        mensaje,
        emisor=usuario,
        plantilla_clave="SUBTAREA_ASIGNADA",
        variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo,
                   "subtarea": subtarea.titulo, "tarea": tarea.titulo if tarea else ""},
        enlace_texto="Ver tarea", enlace_url=_url_tarea_notificacion(cliente, tarea_id),
    )


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
        query = filtrar_tareas_visibles_cliente(query, usuario_actual, db)
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
    validar_ambito_proceso_radicado_actuacion(datos.proceso_id, radicado, actuacion, db)
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
    reminder_ids = _crear_recordatorios_sistema(db, tarea)
    registrar_evento_auditoria(db, usuario_actual, "tarea.crear", "tarea", tarea.id)
    db.commit()
    db.refresh(tarea)
    _lanzar_recordatorios_pendientes(db, tarea, reminder_ids)
    _notificar_cambio_tarea(db, tarea, usuario_actual, "creó una tarea asignada", "Se creó una nueva actividad con la fecha, prioridad y contexto indicados.")
    return serializar_tarea_para_usuario(tarea, usuario_actual)


@router.put("/{tarea_id}", response_model=schemas.TareaOut)
def actualizar_tarea(
    tarea_id: int,
    datos: schemas.TareaUpdate,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    tarea = obtener_tarea_usuario(tarea_id, usuario_actual, db)
    validar_actualizacion_tarea(datos, tarea, usuario_actual, db)
    fields_set = datos.model_fields_set
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        if tarea.estado in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA} and fields_set != {"estado"}:
            raise HTTPException(status_code=409, detail="No se pueden programar avisos ni cambiar el vencimiento de una tarea completada o cancelada.")
        if fields_set == {"estado"}:
            tarea.estado = models.EstadoTarea.COMPLETADA
            if tarea.completada_en is None:
                tarea.completada_en = datetime.utcnow()
            _descartar_recordatorios_tarea(db, tarea)
            recordatorio_ids = []
            registrar_evento_auditoria(db, usuario_actual, "tarea.completar", "tarea", tarea.id)
            db.commit()
            _lanzar_recordatorios_pendientes(db, tarea, recordatorio_ids)
            db.refresh(tarea)
            _notificar_cambio_tarea(db, tarea, usuario_actual, "completó la tarea", "El cliente marcó la tarea como finalizada.")
            return serializar_tarea_para_usuario(tarea, usuario_actual)
        nueva_fecha = normalizar_utc_naive(datos.fecha_limite)
        if nueva_fecha is None or nueva_fecha <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="El nuevo vencimiento debe ser una fecha y hora futura.")
        if tarea.fecha_limite == nueva_fecha:
            return serializar_tarea_para_usuario(tarea, usuario_actual)
        anterior = tarea.fecha_limite
        tarea.fecha_limite = nueva_fecha
        recordatorio_ids = _versionar_recordatorios_pendientes(tarea, incluir_sistema=False)
        _invalidar_recordatorios_sistema(tarea)
        recordatorio_ids.extend(_crear_recordatorios_sistema(db, tarea))
        registrar_evento_auditoria(db, usuario_actual, "tarea.fecha_limite.cambiar_cliente", "tarea", tarea.id)
        db.commit()
        _lanzar_recordatorios_pendientes(db, tarea, recordatorio_ids)
        db.refresh(tarea)
        _notificar_cambio_tarea(db, tarea, usuario_actual, "cambió la fecha límite", f"Fecha anterior: {format_colombia_datetime(anterior) if anterior else 'Sin fecha'}. Nueva fecha: {format_colombia_datetime(nueva_fecha)}.")
        return serializar_tarea_para_usuario(tarea, usuario_actual)

    estado_anterior = tarea.estado
    reprogramar_recordatorios = False
    fecha_cambio = False
    relaciones_cambiadas = False
    fecha_anterior = tarea.fecha_limite
    if datos.titulo is not None:
        titulo = datos.titulo.strip()
        if not titulo:
            raise HTTPException(status_code=400, detail="El título de la tarea no puede estar vacío.")
        tarea.titulo = titulo
    if datos.descripcion is not None:
        tarea.descripcion = datos.descripcion
    if datos.estado is not None:
        reprogramar_recordatorios = tarea.estado != datos.estado
        tarea.estado = datos.estado
        tarea.completada_en = datetime.utcnow() if datos.estado == models.EstadoTarea.COMPLETADA else None
    if datos.prioridad is not None:
        tarea.prioridad = datos.prioridad
    if "fecha_limite" in fields_set:
        fecha_limite = normalizar_utc_naive(datos.fecha_limite)
        fecha_cambio = tarea.fecha_limite != fecha_limite
        reprogramar_recordatorios = reprogramar_recordatorios or tarea.fecha_limite != fecha_limite
        tarea.fecha_limite = fecha_limite
    campos_relacion = {"proceso_id", "radicado_id", "actuacion_id", "cliente_id"}
    if fields_set & campos_relacion:
        proceso_id = datos.proceso_id if "proceso_id" in fields_set else tarea.proceso_id
        radicado_id = datos.radicado_id if "radicado_id" in fields_set else tarea.radicado_id
        actuacion_id = datos.actuacion_id if "actuacion_id" in fields_set else tarea.actuacion_id
        cliente_id = datos.cliente_id if "cliente_id" in fields_set else tarea.cliente_id

        # Clearing a radicado also clears its child actuation unless the caller
        # explicitly chooses another actuation in the same update.
        if "radicado_id" in fields_set and radicado_id is None and "actuacion_id" not in fields_set:
            actuacion_id = None

        if proceso_id is not None:
            query_proceso = db.query(models.Proceso).filter(
                models.Proceso.id == proceso_id,
                models.Proceso.archivado_en.is_(None),
            )
            if not has_firm_wide_access(usuario_actual):
                query_proceso = query_proceso.filter(
                    models.Proceso.id.in_(lawyer_process_ids(db, usuario_actual))
                )
            if not query_proceso.first():
                raise HTTPException(status_code=404, detail="Proceso no encontrado o no asignado.")

        # If the process changes and the existing radicado was not explicitly
        # replaced, detach it when it does not belong to the newly selected process.
        if "proceso_id" in fields_set and "radicado_id" not in fields_set and proceso_id is not None and radicado_id is not None:
            pertenece = db.query(models.ProcesoRadicado).filter_by(
                proceso_id=proceso_id, radicado_id=radicado_id,
            ).first()
            if not pertenece:
                radicado_id = None
                actuacion_id = None

        relation_data = schemas.TareaCreate(
            titulo=tarea.titulo,
            proceso_id=proceso_id,
            radicado_id=radicado_id,
            actuacion_id=actuacion_id,
        )
        radicado, actuacion = validar_relaciones_tarea(relation_data, usuario_actual, db)
        validar_ambito_proceso_radicado_actuacion(proceso_id, radicado, actuacion, db)
        if actuacion is not None:
            radicado_id = actuacion.radicado_id
        if cliente_id is not None:
            cliente = db.query(models.Usuario).filter(
                models.Usuario.id == cliente_id,
                models.Usuario.rol == models.RolUsuario.CLIENTE,
            ).first()
            if not cliente:
                raise HTTPException(status_code=400, detail="Cliente no encontrado.")
            if proceso_id is not None and not db.query(models.ProcesoCliente).filter_by(
                proceso_id=proceso_id, cliente_id=cliente_id,
            ).first():
                raise HTTPException(status_code=400, detail="El cliente no está asignado al proceso de la tarea.")
            if responsible_lawyer_id := lawyer_scope_id(usuario_actual):
                if proceso_id is None:
                    client_process = db.query(models.ProcesoCliente.proceso_id).join(
                        models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id,
                    ).filter(
                        models.ProcesoCliente.cliente_id == cliente_id,
                        models.Proceso.id.in_(lawyer_process_ids(db, usuario_actual)),
                    ).first()
                    if cliente.creado_por_abogado_id != responsible_lawyer_id and not client_process:
                        raise HTTPException(status_code=400, detail="El cliente no está asignado a tus procesos.")

        relaciones_cambiadas = (
            tarea.proceso_id != proceso_id
            or tarea.radicado_id != radicado_id
            or tarea.actuacion_id != actuacion_id
            or tarea.cliente_id != cliente_id
        )
        tarea.proceso_id = proceso_id
        tarea.radicado_id = radicado_id
        tarea.actuacion_id = actuacion_id
        tarea.cliente_id = cliente_id
    if tarea.estado in (models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA):
        _descartar_recordatorios_tarea(db, tarea)
        recordatorio_ids = []
    elif fecha_cambio:
        recordatorio_ids = _versionar_recordatorios_pendientes(tarea, incluir_sistema=False)
        _invalidar_recordatorios_sistema(tarea)
        recordatorio_ids.extend(_crear_recordatorios_sistema(db, tarea))
    elif reprogramar_recordatorios:
        recordatorio_ids = _versionar_recordatorios_pendientes(tarea)
        if estado_anterior in (models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA):
            _invalidar_recordatorios_sistema(tarea)
            recordatorio_ids.extend(_crear_recordatorios_sistema(db, tarea))
    else:
        recordatorio_ids = []
    registrar_evento_auditoria(db, usuario_actual, "tarea.actualizar", "tarea", tarea.id)
    db.commit()
    _lanzar_recordatorios_pendientes(db, tarea, recordatorio_ids)
    db.refresh(tarea)
    cambios = []
    if datos.estado is not None: cambios.append(f"estado {datos.estado.value}")
    if datos.prioridad is not None: cambios.append(f"prioridad {datos.prioridad.value}")
    if fecha_cambio: cambios.append(f"vencimiento actualizado desde {format_colombia_datetime(fecha_anterior) if fecha_anterior else 'sin fecha'}")
    if relaciones_cambiadas: cambios.append("relaciones de proceso, radicado o cliente actualizadas")
    _notificar_cambio_tarea(db, tarea, usuario_actual, "actualizó la tarea", "; ".join(cambios) or "Se actualizaron sus datos.")
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

    estado_anterior = tarea.estado
    if tarea.estado == models.EstadoTarea.COMPLETADA:
        tarea.estado = models.EstadoTarea.PENDIENTE
        tarea.completada_en = None
    else:
        tarea.estado = models.EstadoTarea.COMPLETADA
        tarea.completada_en = datetime.utcnow()

    if tarea.estado in (models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA):
        _descartar_recordatorios_tarea(db, tarea)
        recordatorio_ids = []
    elif estado_anterior in (models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA):
        recordatorio_ids = _crear_recordatorios_sistema(db, tarea)
        recordatorio_ids.extend(_versionar_recordatorios_pendientes(tarea))
    else:
        recordatorio_ids = _versionar_recordatorios_pendientes(tarea)
    registrar_evento_auditoria(db, usuario_actual, "tarea.completar", "tarea", tarea.id)
    db.commit()
    _lanzar_recordatorios_pendientes(db, tarea, recordatorio_ids)
    db.refresh(tarea)
    _notificar_cambio_tarea(db, tarea, usuario_actual, "actualizó el estado de la tarea", f"Estado actualizado a {tarea.estado.value}.")

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

    _descartar_recordatorios_tarea(db, tarea)
    _notificar_cambio_tarea(
        db, tarea, usuario_actual, "eliminó la tarea",
        "La tarea y sus recordatorios asociados se eliminaron del sistema.",
    )
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

    if tarea.estado in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}:
        raise HTTPException(status_code=409, detail="No se pueden programar avisos para una tarea completada o cancelada.")

    if (datos.fecha_hora is None) == (datos.anticipacion_minutos is None):
        raise HTTPException(
            status_code=400,
            detail="Indica una fecha y hora o una anticipación, pero no ambas.",
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
        notificar_email=datos.notificar_email,
        notificar_whatsapp=datos.notificar_whatsapp,
        activo=datos.activo,
        fecha_hora=normalizar_utc_naive(datos.fecha_hora),
        anticipacion_minutos=datos.anticipacion_minutos,
    )

    if not recordatorio.notificar_email and not recordatorio.notificar_whatsapp:
        raise HTTPException(status_code=400, detail="Selecciona al menos un canal de notificación.")
    if recordatorio.notificar_whatsapp:
        if not usuario_actual.whatsapp_numero.strip():
            raise HTTPException(status_code=400, detail="Configura un número de WhatsApp antes de activar ese canal.")
        if usuario_actual.rol == models.RolUsuario.ABOGADO and not plan_whatsapp_habilitado(
            usuario_actual, "notificaciones_whatsapp_tareas"
        ):
            raise HTTPException(status_code=403, detail="Tu plan no permite notificaciones de tareas por WhatsApp.")

    db.add(recordatorio)
    db.flush()
    registrar_evento_auditoria(db, usuario_actual, "recordatorio.crear", "recordatorio_tarea", recordatorio.id)
    db.commit()
    db.refresh(recordatorio)
    if recordatorio.activo and tarea.estado not in {
        models.EstadoTarea.COMPLETADA,
        models.EstadoTarea.CANCELADA,
    }:
        iniciar_workflow_recordatorio(db, recordatorio.id)
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

    if tarea.estado in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}:
        raise HTTPException(status_code=409, detail="No se pueden modificar avisos de una tarea completada o cancelada.")

    recordatorio = (
        db.query(models.RecordatorioTarea)
        .filter(
            models.RecordatorioTarea.id == recordatorio_id,
            models.RecordatorioTarea.tarea_id == tarea.id,
            models.RecordatorioTarea.interno_sistema.is_(False),
        )
        .first()
    )

    if not recordatorio:
        raise HTTPException(
            status_code=404,
            detail="Recordatorio no encontrado.",
        )

    fields_set = datos.model_fields_set
    cambio_programacion = False
    if "activo" in fields_set and datos.activo is not None and recordatorio.activo != datos.activo:
        recordatorio.activo = datos.activo
        cambio_programacion = True
    if "fecha_hora" in fields_set:
        fecha_hora = normalizar_utc_naive(datos.fecha_hora)
        if recordatorio.fecha_hora != fecha_hora:
            recordatorio.fecha_hora = fecha_hora
            cambio_programacion = True
    if "anticipacion_minutos" in fields_set:
        anticipacion = datos.anticipacion_minutos
        if anticipacion is not None and anticipacion < 0:
            raise HTTPException(status_code=400, detail="La anticipación no puede ser negativa.")
        if anticipacion is not None and tarea.fecha_limite is None:
            raise HTTPException(status_code=400, detail="La tarea debe tener fecha límite para utilizar una anticipación.")
        if recordatorio.anticipacion_minutos != anticipacion:
            recordatorio.anticipacion_minutos = anticipacion
            cambio_programacion = True

    if (recordatorio.fecha_hora is None) == (recordatorio.anticipacion_minutos is None):
        raise HTTPException(status_code=400, detail="Debe quedar configurada una sola fecha o anticipación.")
    if cambio_programacion:
        recordatorio.version += 1

    registrar_evento_auditoria(db, usuario_actual, "recordatorio.actualizar", "recordatorio_tarea", recordatorio.id)
    db.commit()
    db.refresh(recordatorio)
    if (
        recordatorio.activo
        and recordatorio.enviado_en is None
        and tarea.estado not in {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}
    ):
        iniciar_workflow_recordatorio(db, recordatorio.id)
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
            models.RecordatorioTarea.interno_sistema.is_(False),
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
