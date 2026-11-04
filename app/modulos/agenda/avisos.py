"""Aviso al cliente cuando se programa, cambia o cancela un evento de su proceso."""

from sqlalchemy.orm import Session

from app import models
from app.modulos.expedientes.avisos import clientes_activos
from app.notification_service import emitir_notificacion_workflow
from app.timezone import format_colombia_datetime
from app.workflow_service import user_portal_url

ETIQUETAS = {"AUDIENCIA": "Audiencia", "REUNION": "Reunión", "FIRMA_CONTRATO": "Firma de contrato", "EVENTO": "Evento"}
ESTADOS = {"PROGRAMADO": "programado", "COMPLETADO": "realizado", "CANCELADO": "cancelado"}


def notificar_evento(
    db: Session,
    proceso: models.Proceso,
    evento: models.EventoAgenda,
    actor: models.Usuario,
    accion: str,
    cliente: models.Usuario | None = None,
) -> None:
    """Al cliente elegido o, si no hay, a todos los clientes activos del proceso."""
    destinatarios = [cliente] if cliente and cliente.estado == models.EstadoUsuario.ACTIVO else (
        [] if cliente else clientes_activos(proceso)
    )
    inicio = format_colombia_datetime(evento.fecha_inicio)
    fin = format_colombia_datetime(evento.fecha_fin) if evento.fecha_fin else ""
    responsable = evento.responsable.nombre_completo if evento.responsable else proceso.abogado.nombre_completo
    for destinatario in destinatarios:
        emitir_notificacion_workflow(
            db, destinatario, "RESUMENES",
            f"EVENTO_AGENDA:{evento.id}:{accion.upper()}:{evento.fecha_inicio.isoformat()}",
            f"{accion.capitalize()} actividad: {evento.titulo}", "",
            incluir_email=True,
            plantilla_clave="EVENTO_AGENDA",
            variables={"nombre": destinatario.nombre_completo, "actor": actor.nombre_completo,
                       "accion": accion, "proceso": proceso.nombre, "actividad": evento.titulo,
                       "tipo": ETIQUETAS.get(evento.tipo, "Evento").lower(),
                       "estado": ESTADOS.get(evento.estado, evento.estado.lower()),
                       "inicio": inicio, "fin": fin, "responsable": responsable,
                       "detalle": evento.descripcion or ""},
            enlace_texto="Ver agenda",
            enlace_url=user_portal_url(destinatario, f"/gestion-procesos/cliente/procesos/{proceso.id}#evento-{evento.id}"),
        )
