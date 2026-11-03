"""Recordatorios de una tarea: los que programa la persona y los del sistema.

El sistema programa dos avisos antes del vencimiento (24 y 12 horas) para quien
debe hacer la tarea: el cliente asignado o, si no hay, el responsable. Cada
cambio de fecha o de estado los vuelve a programar; cerrar la tarea los descarta.
Un recordatorio se manda con el workflow de recordatorios, que lee su `version`
para no enviar uno que ya cambió.
"""

from datetime import timedelta

from sqlalchemy.orm import Session

from app import models
from app.notification_policy import preferencia_de_cliente
from app.reminder_workflow import iniciar_workflow_recordatorio
from app.timezone import utc_ahora

CERRADAS = {models.EstadoTarea.COMPLETADA, models.EstadoTarea.CANCELADA}
ANTICIPACIONES_SISTEMA = (1440, 720)


def versionar_pendientes(tarea: models.Tarea, incluir_sistema: bool = True) -> list[int]:
    """Sube la versión de los recordatorios por enviar y devuelve los que hay que volver a lanzar."""
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


def invalidar_sistema(tarea: models.Tarea) -> None:
    for recordatorio in tarea.recordatorios:
        if recordatorio.interno_sistema and recordatorio.activo and recordatorio.enviado_en is None:
            recordatorio.activo = False
            recordatorio.version += 1


def descartar(db: Session, tarea: models.Tarea) -> None:
    """Borra los recordatorios de la tarea y descarta los envíos que ya estaban en cola."""
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


def crear_sistema(db: Session, tarea: models.Tarea) -> list[int]:
    if tarea.fecha_limite is None or tarea.estado in CERRADAS:
        return []
    destinatario = tarea.cliente_asignado if tarea.cliente_id else tarea.usuario
    if destinatario is None or destinatario.estado != models.EstadoUsuario.ACTIVO:
        return []
    if destinatario.rol == models.RolUsuario.CLIENTE:
        email, whatsapp = preferencia_de_cliente(destinatario, "RECORDATORIOS")
        email = email and bool(destinatario.email)
        whatsapp = whatsapp and destinatario.notificaciones_whatsapp and bool(destinatario.whatsapp_numero.strip())
    else:
        preferencias = (destinatario.preferencias_notificacion or {}).get("RECORDATORIOS", {})
        email = bool(preferencias.get("email", destinatario.notificaciones_email)) and bool(destinatario.email)
        whatsapp = bool(preferencias.get("whatsapp", destinatario.notificaciones_whatsapp)) and bool(destinatario.whatsapp_numero.strip())
    ids = []
    for anticipacion in ANTICIPACIONES_SISTEMA:
        if tarea.fecha_limite - timedelta(minutes=anticipacion) <= utc_ahora():
            continue
        recordatorio = models.RecordatorioTarea(
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
        db.add(recordatorio)
        db.flush()
        ids.append(recordatorio.id)
    return ids


def reprogramar(db: Session, tarea: models.Tarea, *, estado_anterior, fecha_cambio: bool, estado_cambio: bool) -> list[int]:
    """Deja los recordatorios al día después de un cambio y devuelve los que hay que lanzar.

    Cerrar la tarea los descarta; mover la fecha rehace los del sistema y reprograma
    los de la persona; reabrirla vuelve a crear los del sistema.
    """
    if tarea.estado in CERRADAS:
        descartar(db, tarea)
        return []
    if fecha_cambio:
        ids = versionar_pendientes(tarea, incluir_sistema=False)
        invalidar_sistema(tarea)
        return ids + crear_sistema(db, tarea)
    if estado_cambio:
        # Versionar antes de crear: los recordatorios nuevos ya nacen en la versión 1.
        ids = versionar_pendientes(tarea)
        if estado_anterior in CERRADAS:
            invalidar_sistema(tarea)
            ids.extend(crear_sistema(db, tarea))
        return ids
    return []


def lanzar(db: Session, tarea: models.Tarea, recordatorio_ids: list[int]) -> None:
    if tarea.estado in CERRADAS:
        return
    for recordatorio_id in recordatorio_ids:
        iniciar_workflow_recordatorio(db, recordatorio_id)
