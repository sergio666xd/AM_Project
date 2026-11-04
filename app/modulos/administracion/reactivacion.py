"""Avisos de agenda que una cuenta se perdió mientras estuvo suspendida."""
import logging
from datetime import timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.notification_policy import preferencia_de_cliente
from app.notification_service import emitir_notificacion_workflow
from app.reminder_workflow import iniciar_workflow_recordatorio

from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import (
    chat_conversation_url,
    user_portal_url,
)

logger = logging.getLogger(__name__)


def ponerse_al_dia(db: Session, usuario: models.Usuario, actor: models.Usuario) -> None:
    """Avisa de las tareas pendientes, los eventos próximos y los mensajes sin leer."""
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
            else user_portal_url(usuario, f"/gestion-procesos/admin/tareas/{task.id}")
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
        elif usuario.rol == models.RolUsuario.ADMIN:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/admin/procesos/{process.id}/agenda")
            recipient_label = "Ver agenda"
        else:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/abogado/procesos/{process.id}/agenda")
            recipient_label = "Ver agenda"
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
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/admin/procesos/{process.id}/resumen")
            recipient_label = "Ver proceso"
        else:
            recipient_url = user_portal_url(usuario, f"/gestion-procesos/abogado/procesos/{process.id}/resumen")
            recipient_label = "Ver proceso"
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
