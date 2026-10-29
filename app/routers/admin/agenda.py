"""Agenda de la firma: tareas y eventos."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.notification_policy import preferencia_de_cliente
from app.notification_service import emitir_notificacion_workflow
from app.reminder_workflow import iniciar_workflow_recordatorio
from app.routers.admin.comun import logger, verificar_admin
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import (
    chat_conversation_url,
    user_portal_url,
)

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get("/agenda/tareas")
def obtener_agenda_tareas_firma(
    mes: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    abogado_id: int | None = None,
    proceso_id: int | None = None,
    cliente_id: int | None = None,
    estado: str | None = None,
    limite: int = 500,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    zona = ZoneInfo("America/Bogota")
    if mes:
        try:
            inicio_local = datetime.strptime(mes, "%Y-%m").date().replace(day=1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="mes debe tener formato YYYY-MM.") from exc
        if inicio_local.month == 12:
            fin_local = inicio_local.replace(year=inicio_local.year + 1, month=1)
        else:
            fin_local = inicio_local.replace(month=inicio_local.month + 1)
    elif fecha_desde and fecha_hasta:
        try:
            inicio_local = datetime.fromisoformat(fecha_desde).date()
            fin_local = datetime.fromisoformat(fecha_hasta).date() + timedelta(days=1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Usa fechas ISO YYYY-MM-DD.") from exc
    elif fecha_desde or fecha_hasta:
        raise HTTPException(status_code=400, detail="Indica ambas fechas del rango.")
    else:
        hoy_local = datetime.now(zona).date()
        inicio_local = hoy_local.replace(day=1)
        fin_local = inicio_local.replace(year=inicio_local.year + 1, month=1) if inicio_local.month == 12 else inicio_local.replace(month=inicio_local.month + 1)

    if fin_local <= inicio_local:
        raise HTTPException(status_code=400, detail="El rango de fechas no es válido.")
    inicio_utc = datetime.combine(inicio_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)
    fin_utc = datetime.combine(fin_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)

    query = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
            models.Tarea.fecha_limite >= inicio_utc,
            models.Tarea.fecha_limite < fin_utc,
            or_(
                models.Tarea.proceso_id.is_(None),
                models.Tarea.proceso.has(and_(
                    models.Proceso.archivado_en.is_(None),
                    models.Proceso.abogado.has(models.Usuario.rol.in_((
                        models.RolUsuario.ABOGADO_ADMIN,
                        models.RolUsuario.ADMIN,
                    ))),
                )),
            ),
            or_(
                models.Tarea.radicado_id.is_(None),
                models.Tarea.radicado.has(models.Radicado.ambito_key == "FIRMA"),
            ),
        )
    )
    if abogado_id is not None:
        query = query.filter(models.Tarea.usuario_id == abogado_id)
    if proceso_id is not None:
        query = query.filter(models.Tarea.proceso_id == proceso_id)
    if cliente_id is not None:
        query = query.filter(models.Tarea.cliente_id == cliente_id)
    if estado:
        try:
            estado_tarea = models.EstadoTarea(estado.upper())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Estado de tarea no válido.") from exc
        query = query.filter(models.Tarea.estado == estado_tarea)

    tareas = query.order_by(models.Tarea.fecha_limite.asc(), models.Tarea.id.asc()).limit(min(max(limite, 1), 1000)).all()
    recordatorios_query = (
        db.query(models.RecordatorioTarea, models.Tarea)
        .join(models.Tarea, models.Tarea.id == models.RecordatorioTarea.tarea_id)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(
            models.RecordatorioTarea.activo.is_(True),
            models.RecordatorioTarea.interno_sistema.is_(False),
            models.RecordatorioTarea.fecha_hora >= inicio_utc,
            models.RecordatorioTarea.fecha_hora < fin_utc,
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
            or_(
                models.Tarea.proceso_id.is_(None),
                models.Tarea.proceso.has(and_(
                    models.Proceso.archivado_en.is_(None),
                    models.Proceso.abogado.has(models.Usuario.rol.in_((models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN))),
                )),
            ),
            or_(models.Tarea.radicado_id.is_(None), models.Tarea.radicado.has(models.Radicado.ambito_key == "FIRMA")),
        )
    )
    if abogado_id is not None:
        recordatorios_query = recordatorios_query.filter(models.Tarea.usuario_id == abogado_id)
    if proceso_id is not None:
        recordatorios_query = recordatorios_query.filter(models.Tarea.proceso_id == proceso_id)
    if cliente_id is not None:
        recordatorios_query = recordatorios_query.filter(models.Tarea.cliente_id == cliente_id)
    if estado:
        recordatorios_query = recordatorios_query.filter(models.Tarea.estado == estado_tarea)
    recordatorios = recordatorios_query.order_by(models.RecordatorioTarea.fecha_hora.asc()).limit(1000).all()
    responsables = (
        db.query(models.Usuario.id, models.Usuario.nombre_completo)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
            models.Usuario.estado == models.EstadoUsuario.ACTIVO,
        )
        .order_by(models.Usuario.nombre_completo.asc())
        .all()
    )
    return {
        "tareas": [
            {
                "id": tarea.id,
                "titulo": tarea.titulo,
                "descripcion": tarea.descripcion,
                "estado": tarea.estado.value,
                "prioridad": tarea.prioridad.value,
                "fecha_limite": tarea.fecha_limite,
                "responsable_id": tarea.usuario_id,
                "responsable": tarea.usuario.nombre_completo,
                "cliente_id": tarea.cliente_id,
                "cliente": (
                    tarea.cliente_asignado.nombre_completo
                    if tarea.cliente_asignado
                    and tarea.proceso
                    and tarea.cliente_asignado.rol == models.RolUsuario.CLIENTE
                    and any(link.cliente_id == tarea.cliente_id for link in tarea.proceso.clientes)
                    else None
                ),
                "proceso_id": tarea.proceso_id,
                "proceso": tarea.proceso.nombre if tarea.proceso else None,
                "radicado_id": tarea.radicado_id,
                "radicado": tarea.radicado.numero if tarea.radicado else None,
            }
            for tarea in tareas
        ],
        "responsables": [{"id": responsable.id, "nombre": responsable.nombre_completo} for responsable in responsables],
        "recordatorios": [
            {
                "id": recordatorio.id,
                "fecha_hora": recordatorio.fecha_hora,
                "tarea_id": tarea.id,
                "tarea": tarea.titulo,
                "responsable": tarea.usuario.nombre_completo,
                "proceso": tarea.proceso.nombre if tarea.proceso else None,
                "cliente": tarea.cliente_asignado.nombre_completo if tarea.cliente_asignado else None,
                "canales": [canal for canal, activo in (("email", recordatorio.notificar_email), ("whatsapp", recordatorio.notificar_whatsapp)) if activo],
                "enviado": recordatorio.enviado_en is not None,
            }
            for recordatorio, tarea in recordatorios
        ],
    }


def _fecha_agenda_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _validar_vinculos_evento_agenda(db: Session, responsable_id: int | None, proceso_id: int | None, cliente_id: int | None, tipo: str = "EVENTO", contrato_id: int | None = None, actor: models.Usuario | None = None):
    if responsable_id is not None:
        responsable = db.query(models.Usuario).filter_by(id=responsable_id, estado=models.EstadoUsuario.ACTIVO).first()
        if not responsable or responsable.rol not in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
            raise HTTPException(status_code=400, detail="El responsable debe pertenecer al equipo activo de la firma.")
    proceso = None
    if proceso_id is not None:
        proceso = db.query(models.Proceso).filter_by(id=proceso_id, archivado_en=None).first()
        if not proceso or proceso.abogado.rol not in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
            raise HTTPException(status_code=400, detail="El proceso no pertenece a la firma.")
    if cliente_id is not None:
        cliente = db.query(models.Usuario).filter_by(id=cliente_id, rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO).first()
        if not cliente or (proceso and not db.query(models.ProcesoCliente).filter_by(proceso_id=proceso.id, cliente_id=cliente.id).first()):
            raise HTTPException(status_code=400, detail="El cliente no está asignado al proceso seleccionado.")
    if tipo == "FIRMA_CONTRATO":
        if contrato_id is None or proceso is None or cliente_id is None:
            raise HTTPException(status_code=400, detail="La firma debe vincularse a contrato, expediente y cliente.")
        contract = db.query(models.ContratoServicio).filter_by(id=contrato_id, proceso_id=proceso.id).with_for_update().first()
        if not contract or contract.cliente_id != cliente_id or contract.estado not in {"LISTO_PARA_FIRMA", "EN_FIRMA"}:
            raise HTTPException(status_code=400, detail="El contrato no está listo para firma en el expediente y cliente seleccionados.")
        if contract.estado == "LISTO_PARA_FIRMA":
            contract.estado = "EN_FIRMA"
            version_number = max([version.version for version in contract.versiones] or [contract.version_actual]) + 1
            contract.version_actual = version_number
            db.add(models.ContratoServicioVersion(
                contrato_id=contract.id, version=version_number, estado="EN_FIRMA",
                contenido=json.dumps(contract.campos_actual or {}, ensure_ascii=False, sort_keys=True),
                campos=contract.campos_actual or {}, parte_cliente_snapshot=contract.parte_cliente_snapshot,
                hash_sha256=hashlib.sha256(json.dumps(contract.campos_actual or {}, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
                creado_por_id=actor.id if actor else None,
            ))
            if actor:
                registrar_evento_auditoria(db, actor, "contrato.estado", "contrato_servicio", contract.id, {"estado": "EN_FIRMA", "origen": "evento_agenda"})
    elif contrato_id is not None:
        raise HTTPException(status_code=400, detail="Solo los eventos de firma pueden asociarse a un contrato.")


def _notificar_evento_agenda_admin(db: Session, evento: models.EventoAgenda, admin: models.Usuario, accion: str) -> None:
    if not evento.proceso_id:
        return
    proceso = db.query(models.Proceso).filter_by(id=evento.proceso_id).first()
    if not proceso:
        return
    destinatarios = [evento.cliente] if evento.cliente else [
        link.cliente for link in proceso.clientes
        if link.cliente
        and link.cliente.rol == models.RolUsuario.CLIENTE
        and link.cliente.estado == models.EstadoUsuario.ACTIVO
    ]
    for cliente in destinatarios:
        if not cliente or cliente.estado != models.EstadoUsuario.ACTIVO:
            continue
        link_url = user_portal_url(cliente, f"/gestion-procesos/cliente/procesos/{proceso.id}#evento-{evento.id}")
        emitir_notificacion_workflow(
            db, cliente, "RESUMENES", f"EVENTO_AGENDA:{evento.id}:{accion.upper()}:{evento.fecha_inicio.isoformat()}",
            f"{accion.capitalize()} actividad: {evento.titulo}", "", emisor=admin, incluir_email=True,
            plantilla_clave="EVENTO_AGENDA",
            variables={"nombre": cliente.nombre_completo, "actor": admin.nombre_completo, "accion": accion,
                       "proceso": proceso.nombre, "actividad": evento.titulo, "tipo": evento.tipo,
                       "estado": evento.estado, "inicio": format_colombia_datetime(evento.fecha_inicio),
                       "fin": format_colombia_datetime(evento.fecha_fin) if evento.fecha_fin else 'No indicada',
                       "responsable": evento.responsable.nombre_completo if evento.responsable else 'No asignado',
                       "detalle": evento.descripcion or 'Sin detalles adicionales'},
            enlace_texto="Ver agenda", enlace_url=link_url,
        )


def _notificar_agenda_tras_reactivacion(db: Session, usuario: models.Usuario, actor: models.Usuario) -> None:
    """Deliver catch-up notices for pending and unread agenda items after reactivation."""
    ahora = utc_ahora()
    marca_reactivacion = ahora.isoformat()
    if usuario.rol == models.RolUsuario.CLIENTE:
        process_ids = [row[0] for row in db.query(models.ProcesoCliente.proceso_id).filter_by(cliente_id=usuario.id).all()]
        task_query = db.query(models.Tarea).filter(
            models.Tarea.cliente_id == usuario.id,
            models.Tarea.estado.notin_((models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA)),
        )
        event_query = db.query(models.EventoAgenda).filter(
            models.EventoAgenda.proceso_id.in_(process_ids or [-1]),
            models.EventoAgenda.estado == "PROGRAMADO",
            models.EventoAgenda.fecha_inicio >= ahora,
            or_(models.EventoAgenda.cliente_id == usuario.id, models.EventoAgenda.cliente_id.is_(None)),
        )
        communication_query = db.query(models.ComunicacionProceso).filter(
            models.ComunicacionProceso.cliente_id == usuario.id,
            models.ComunicacionProceso.visibilidad == "CLIENTE",
            models.ComunicacionProceso.actor_id != usuario.id,
            models.ComunicacionProceso.leido_en.is_(None),
        )
    else:
        owned_ids = [row[0] for row in db.query(models.Proceso.id).filter_by(abogado_id=usuario.id).all()]
        collaborating_ids = [row[0] for row in db.query(models.ProcesoColaborador.proceso_id).filter_by(abogado_id=usuario.id).all()]
        process_ids = list(set(owned_ids + collaborating_ids))
        task_query = db.query(models.Tarea).filter(
            models.Tarea.usuario_id == usuario.id,
            models.Tarea.estado.notin_((models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA)),
        )
        event_query = db.query(models.EventoAgenda).filter(
            models.EventoAgenda.responsable_id == usuario.id,
            models.EventoAgenda.estado == "PROGRAMADO",
            models.EventoAgenda.fecha_inicio >= ahora,
        )
        communication_query = db.query(models.ComunicacionProceso).filter(
            models.ComunicacionProceso.proceso_id.in_(process_ids or [-1]),
            models.ComunicacionProceso.visibilidad == "CLIENTE",
            models.ComunicacionProceso.actor_id != usuario.id,
            models.ComunicacionProceso.leido_en.is_(None),
        )

    recordatorio_ids = []
    for task in task_query.order_by(models.Tarea.fecha_limite.asc().nullslast()).limit(30).all():
        process = task.proceso.nombre if task.proceso else "Tarea general"
        destinatario_recordatorio = task.cliente_asignado if task.cliente_id else task.usuario
        active_system_reminders = [item for item in task.recordatorios if item.interno_sistema and item.activo and item.enviado_en is None]
        if task.fecha_limite and destinatario_recordatorio and destinatario_recordatorio.estado == models.EstadoUsuario.ACTIVO and not active_system_reminders:
            if destinatario_recordatorio.rol == models.RolUsuario.CLIENTE:
                email_enabled, whatsapp_enabled = preferencia_de_cliente(destinatario_recordatorio, "RECORDATORIOS")
                email_enabled = email_enabled and bool(destinatario_recordatorio.email)
                whatsapp_enabled = whatsapp_enabled and destinatario_recordatorio.notificaciones_whatsapp and bool(destinatario_recordatorio.whatsapp_numero.strip())
            else:
                reminder_preferences = (destinatario_recordatorio.preferencias_notificacion or {}).get("RECORDATORIOS", {})
                email_enabled = bool(reminder_preferences.get("email", destinatario_recordatorio.notificaciones_email)) and bool(destinatario_recordatorio.email)
                whatsapp_enabled = bool(reminder_preferences.get("whatsapp", destinatario_recordatorio.notificaciones_whatsapp)) and bool(destinatario_recordatorio.whatsapp_numero.strip())
            for anticipation in (1440, 720):
                if task.fecha_limite - timedelta(minutes=anticipation) <= ahora:
                    continue
                reminder = models.RecordatorioTarea(
                    tarea_id=task.id, canal=models.CanalRecordatorio.WHATSAPP,
                    notificar_email=email_enabled, notificar_whatsapp=whatsapp_enabled,
                    activo=True, version=1, workflow_version_lanzada=0,
                    anticipacion_minutos=anticipation, interno_sistema=True,
                )
                db.add(reminder)
                db.flush()
                recordatorio_ids.append(reminder.id)
        recipient_url = (
            user_portal_url(usuario, f"/gestion-procesos/cliente/tareas?tarea={task.id}#tarea-{task.id}")
            if usuario.rol == models.RolUsuario.CLIENTE
            else user_portal_url(usuario, f"/gestion-procesos/dashboard/tareas/{task.id}")
            if usuario.rol == models.RolUsuario.ABOGADO
            else user_portal_url(usuario, f"/gestion-procesos/admin/tareas?detalle={task.id}")
            if usuario.rol == models.RolUsuario.ADMIN
            else user_portal_url(usuario, f"/gestion-procesos/abogado/tareas/{task.id}")
        )
        try:
            emitir_notificacion_workflow(
                db, usuario, "TAREAS", f"REACTIVACION:{usuario.id}:TAREA:{task.id}:{marca_reactivacion}",
                "Tarea pendiente tras reactivar tu cuenta", "", emisor=actor, incluir_email=True,
                plantilla_clave="REACTIVACION_TAREA",
                variables={"nombre": usuario.nombre_completo, "tarea": task.titulo, "proceso": process,
                           "estado": task.estado.value, "fecha_limite": format_colombia_datetime(task.fecha_limite) if task.fecha_limite else "Sin fecha límite"},
                enlace_texto="Ver tarea", enlace_url=recipient_url,
            )
        except Exception:
            logger.exception("No se pudo preparar aviso de tarea pendiente al reactivar usuario %s", usuario.id)

    for event in event_query.order_by(models.EventoAgenda.fecha_inicio.asc()).limit(30).all():
        process = event.proceso
        if not process:
            continue
        if usuario.rol == models.RolUsuario.CLIENTE:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/cliente/procesos/{process.id}#evento-{event.id}")
            recipient_label = "Ver agenda"
        elif usuario.rol == models.RolUsuario.ABOGADO_ADMIN:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/abogado/procesos/{process.id}/agenda")
            recipient_label = "Ver agenda"
        elif usuario.rol == models.RolUsuario.ADMIN:
            recipient_url = user_portal_url(usuario, "/gestion-procesos/admin/agenda")
            recipient_label = "Ver agenda"
        else:
            # The SaaS dashboard has no process agenda detail route yet.
            recipient_url = user_portal_url(usuario, "/gestion-procesos/dashboard")
            recipient_label = "Abrir panel"
        try:
            emitir_notificacion_workflow(
                db, usuario, "RESUMENES", f"REACTIVACION:{usuario.id}:EVENTO:{event.id}:{marca_reactivacion}",
                "Actividad próxima tras reactivar tu cuenta", "", emisor=actor, incluir_email=True,
                plantilla_clave="REACTIVACION_EVENTO",
                variables={"nombre": usuario.nombre_completo, "actividad": event.titulo, "proceso": process.nombre,
                           "tipo": event.tipo, "fecha": format_colombia_datetime(event.fecha_inicio),
                           "descripcion": event.descripcion or "Sin detalles adicionales"},
                enlace_texto=recipient_label, enlace_url=recipient_url,
            )
        except Exception:
            logger.exception("No se pudo preparar aviso de evento al reactivar usuario %s", usuario.id)

    for communication in communication_query.order_by(models.ComunicacionProceso.created_at.desc()).limit(30).all():
        process = communication.proceso
        if not process:
            continue
        other_user_id = communication.actor_id if usuario.rol == models.RolUsuario.CLIENTE else communication.cliente_id
        if other_user_id:
            recipient_url = chat_conversation_url(usuario, process.id, other_user_id)
            recipient_label = "Abrir chat"
        elif usuario.rol == models.RolUsuario.CLIENTE:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/cliente/procesos/{process.id}")
            recipient_label = "Ver proceso"
        elif usuario.rol == models.RolUsuario.ADMIN:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/admin/procesos?detalle={process.id}")
            recipient_label = "Ver proceso"
        elif usuario.rol == models.RolUsuario.ABOGADO_ADMIN:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/abogado/procesos/{process.id}/resumen")
            recipient_label = "Ver proceso"
        else:
            # Legacy communications are being replaced by chat; the SaaS view
            # has no compatible process chat route, so use its existing home.
            recipient_url = user_portal_url(usuario, "/gestion-procesos/dashboard")
            recipient_label = "Abrir panel"
        try:
            emitir_notificacion_workflow(
                db, usuario, "RESUMENES", f"REACTIVACION:{usuario.id}:COMUNICACION:{communication.id}:{marca_reactivacion}",
                f"Comunicación pendiente: {communication.asunto}", "", emisor=actor, incluir_email=True,
                plantilla_clave="REACTIVACION_COMUNICACION",
                variables={"nombre": usuario.nombre_completo, "proceso": process.nombre,
                           "asunto": communication.asunto, "fecha": format_colombia_datetime(communication.created_at),
                           "mensaje": communication.contenido},
                enlace_texto=recipient_label, enlace_url=recipient_url,
            )
        except Exception:
            logger.exception("No se pudo preparar aviso de comunicación al reactivar usuario %s", usuario.id)

    db.commit()
    for recordatorio_id in recordatorio_ids:
        try:
            iniciar_workflow_recordatorio(db, recordatorio_id)
        except Exception:
            logger.exception("No se pudo iniciar un recordatorio al reactivar usuario %s", usuario.id)


@router.get("/agenda/eventos")
def listar_eventos_agenda_admin(
    fecha_desde: str,
    fecha_hasta: str,
    responsable_id: int | None = None,
    proceso_id: int | None = None,
    cliente_id: int | None = None,
    tipo: str | None = None,
    estado: str | None = None,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    try:
        zona = ZoneInfo("America/Bogota")
        desde_fecha = datetime.fromisoformat(fecha_desde).date()
        hasta_fecha = datetime.fromisoformat(fecha_hasta).date() + timedelta(days=1)
        desde = datetime.combine(desde_fecha, datetime.min.time(), tzinfo=zona)
        hasta = datetime.combine(hasta_fecha, datetime.min.time(), tzinfo=zona)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Usa fechas ISO YYYY-MM-DD.") from exc
    query = db.query(models.EventoAgenda).filter(
        models.EventoAgenda.fecha_inicio >= _fecha_agenda_utc(desde),
        models.EventoAgenda.fecha_inicio < _fecha_agenda_utc(hasta),
    )
    for field, value in (("responsable_id", responsable_id), ("proceso_id", proceso_id), ("cliente_id", cliente_id), ("tipo", tipo), ("estado", estado)):
        if value is not None:
            query = query.filter(getattr(models.EventoAgenda, field) == value)
    eventos = query.order_by(models.EventoAgenda.fecha_inicio.asc()).limit(1000).all()
    return [{
        "id": event.id, "titulo": event.titulo, "descripcion": event.descripcion,
        "tipo": event.tipo, "estado": event.estado, "fecha_inicio": event.fecha_inicio,
        "fecha_fin": event.fecha_fin, "responsable_id": event.responsable_id,
        "responsable": event.responsable.nombre_completo if event.responsable else None,
        "proceso_id": event.proceso_id, "proceso": event.proceso.nombre if event.proceso else None,
        "cliente_id": event.cliente_id, "cliente": event.cliente.nombre_completo if event.cliente else None,
        "contrato_id": event.contrato_id,
    } for event in eventos]


@router.post("/agenda/eventos", status_code=status.HTTP_201_CREATED)
def crear_evento_agenda_admin(datos: schemas.EventoAgendaCreate, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    _validar_vinculos_evento_agenda(db, datos.responsable_id, datos.proceso_id, datos.cliente_id, datos.tipo, datos.contrato_id, admin)
    inicio = _fecha_agenda_utc(datos.fecha_inicio)
    fin = _fecha_agenda_utc(datos.fecha_fin) if datos.fecha_fin else None
    if fin and fin < inicio:
        raise HTTPException(status_code=400, detail="La fecha de finalización debe ser posterior al inicio.")
    evento = models.EventoAgenda(
        titulo=datos.titulo.strip(), descripcion=datos.descripcion, tipo=datos.tipo,
        estado=datos.estado, fecha_inicio=inicio, fecha_fin=fin,
        responsable_id=datos.responsable_id, proceso_id=datos.proceso_id,
        cliente_id=datos.cliente_id, contrato_id=datos.contrato_id, creado_por_id=admin.id,
    )
    db.add(evento)
    db.flush()
    registrar_evento_auditoria(db, admin, "admin.agenda.evento.crear", "evento_agenda", evento.id)
    db.commit()
    db.refresh(evento)
    _notificar_evento_agenda_admin(db, evento, admin, "programó")
    return {"id": evento.id, "mensaje": "Evento agregado a la agenda."}


@router.patch("/agenda/eventos/{evento_id}")
def actualizar_evento_agenda_admin(evento_id: int, datos: schemas.EventoAgendaUpdate, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    evento = db.query(models.EventoAgenda).filter_by(id=evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="El evento no existe.")
    _validar_vinculos_evento_agenda(db, datos.responsable_id, datos.proceso_id, datos.cliente_id, datos.tipo, datos.contrato_id, admin)
    inicio = _fecha_agenda_utc(datos.fecha_inicio)
    fin = _fecha_agenda_utc(datos.fecha_fin) if datos.fecha_fin else None
    if fin and fin < inicio:
        raise HTTPException(status_code=400, detail="La fecha de finalización debe ser posterior al inicio.")
    for key in ("titulo", "descripcion", "tipo", "estado", "responsable_id", "proceso_id", "cliente_id", "contrato_id"):
        setattr(evento, key, getattr(datos, key))
    evento.fecha_inicio = inicio
    evento.fecha_fin = fin
    registrar_evento_auditoria(db, admin, "admin.agenda.evento.actualizar", "evento_agenda", evento.id)
    db.commit()
    return {"id": evento.id, "mensaje": "Evento actualizado."}


@router.delete("/agenda/eventos/{evento_id}")
def eliminar_evento_agenda_admin(evento_id: int, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    evento = db.query(models.EventoAgenda).filter_by(id=evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="El evento no existe.")
    registrar_evento_auditoria(db, admin, "admin.agenda.evento.eliminar", "evento_agenda", evento.id)
    db.delete(evento)
    db.commit()
    return {"mensaje": "Evento eliminado de la agenda."}
