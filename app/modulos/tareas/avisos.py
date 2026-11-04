"""Avisos de las tareas: a quién se le cuenta cada cambio y con qué enlace."""

from sqlalchemy.orm import Session

from app import models
from app.notification_service import emitir_notificacion_workflow
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import user_portal_url

ELIMINO = "eliminó la tarea"


def ruta_tarea(usuario: models.Usuario, tarea_id: int | None = None) -> str:
    """La pantalla de la tarea en el portal de quien recibe el aviso; sin id, la lista."""
    if usuario.rol == models.RolUsuario.CLIENTE:
        return f"/gestion-procesos/cliente/tareas?tarea={tarea_id}#tarea-{tarea_id}" if tarea_id else "/gestion-procesos/cliente/tareas"
    if usuario.rol == models.RolUsuario.ADMIN:
        return f"/gestion-procesos/admin/tareas/{tarea_id}" if tarea_id else "/gestion-procesos/admin/tareas"
    return f"/gestion-procesos/abogado/tareas/{tarea_id}" if tarea_id else "/gestion-procesos/abogado/tareas"


def url_tarea(usuario: models.Usuario, tarea_id: int | None = None) -> str:
    return user_portal_url(usuario, ruta_tarea(usuario, tarea_id))


def notificar_cambio(db: Session, tarea: models.Tarea, actor: models.Usuario, accion: str, detalle: str) -> None:
    """Le cuenta el cambio a la otra parte: al cliente asignado o, si no, al responsable."""
    destinatarios = []
    cliente = tarea.cliente_asignado if tarea.cliente_id else None
    if cliente and cliente.estado == models.EstadoUsuario.ACTIVO and actor.id != cliente.id:
        destinatarios.append(cliente)
    elif tarea.usuario and tarea.usuario.id != actor.id:
        destinatarios.append(tarea.usuario)
    if not destinatarios:
        return
    vence = format_colombia_datetime(tarea.fecha_limite) if tarea.fecha_limite else "Sin fecha límite"
    proceso = tarea.proceso.nombre if tarea.proceso else "Tarea general"
    radicado = tarea.radicado.numero if tarea.radicado else "No asociado"
    actuacion = tarea.actuacion_rel.actuacion if tarea.actuacion_rel else "No asociada"
    for destinatario in destinatarios:
        enlace = url_tarea(destinatario, None if accion == ELIMINO else tarea.id)
        cuerpo = (
            f"Hola {destinatario.nombre_completo},\n\n{actor.nombre_completo} {accion}.\n\n"
            f"Tarea: {tarea.titulo}\nDetalle: {detalle}\nEstado: {tarea.estado.value}\n"
            f"Prioridad: {tarea.prioridad.value}\nFecha límite: {vence}\nProceso: {proceso}\n"
            f"Radicado: {radicado}\nActuación: {actuacion}\n\n"
            f"Abrir enlace: Ver tareas | {enlace}"
        )
        emitir_notificacion_workflow(
            db, destinatario, "TAREAS", f"TAREA_ACCION:{tarea.id}:{utc_ahora().timestamp()}",
            f"{accion.capitalize()}: {tarea.titulo}", cuerpo, incluir_email=True,
            plantilla_clave="TAREA_ACCION",
            variables={"nombre": destinatario.nombre_completo, "actor": actor.nombre_completo,
                       "accion": accion, "tarea": tarea.titulo, "detalle": detalle,
                       "estado": tarea.estado.value, "prioridad": tarea.prioridad.value,
                       "fecha_limite": vence, "proceso": proceso, "radicado": radicado,
                       "actuacion": actuacion},
            enlace_texto="Ver tareas", enlace_url=enlace,
        )


def notificar_subtarea_asignada(db: Session, subtarea: models.Subtarea, actor: models.Usuario) -> None:
    if not subtarea.asignada_cliente or subtarea.cliente_id is None:
        return
    cliente = db.get(models.Usuario, subtarea.cliente_id)
    if cliente is None:
        return
    tarea = db.get(models.Tarea, subtarea.tarea_id)
    enlace = url_tarea(cliente, subtarea.tarea_id)
    emitir_notificacion_workflow(
        db, cliente, "SUBTAREAS", f"SUBTAREA:{subtarea.id}:{cliente.id}", "Nueva subtarea asignada",
        f"{actor.nombre_completo} le ha asignado la subtarea: {subtarea.titulo}.\nAbrir tarea: {enlace}",
        plantilla_clave="SUBTAREA_ASIGNADA",
        variables={"nombre": cliente.nombre_completo, "actor": actor.nombre_completo,
                   "subtarea": subtarea.titulo, "tarea": tarea.titulo if tarea else ""},
        enlace_texto="Ver tarea", enlace_url=enlace,
    )
