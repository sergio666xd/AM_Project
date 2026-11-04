"""Avisos que salen del expediente: a los clientes cuando cambia algo de su proceso y
al abogado que entra al equipo. Usan las plantillas de mensaje que se editan desde Administración."""

from uuid import uuid4

from sqlalchemy.orm import Session

from app import models
from app.notification_service import emitir_notificacion_workflow
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import user_portal_url


def clientes_activos(proceso: models.Proceso) -> list[models.Usuario]:
    return [
        vinculo.cliente for vinculo in proceso.clientes
        if vinculo.cliente
        and vinculo.cliente.rol == models.RolUsuario.CLIENTE
        and vinculo.cliente.estado == models.EstadoUsuario.ACTIVO
    ]


def notificar_clientes(
    db: Session,
    proceso: models.Proceso,
    actor: models.Usuario,
    asunto: str,
    accion: str,
    detalle: str,
    *,
    tipo: str = "RESUMENES",
    cliente: models.Usuario | None = None,
) -> None:
    """A un cliente, o a todos los clientes activos del proceso, con la plantilla PROCESO_ACTUALIZACION."""
    for destinatario in [cliente] if cliente else clientes_activos(proceso):
        emitir_notificacion_workflow(
            db, destinatario, tipo, f"ACCION_PROCESO:{proceso.id}:{uuid4().hex}", asunto, "",
            incluir_email=True,
            plantilla_clave="PROCESO_ACTUALIZACION",
            variables={"nombre": destinatario.nombre_completo, "actor": actor.nombre_completo,
                       "accion": accion, "proceso": proceso.nombre,
                       "fecha": format_colombia_datetime(utc_ahora()), "detalle": detalle},
            enlace_texto="Ver proceso",
            enlace_url=user_portal_url(destinatario, f"/gestion-procesos/cliente/procesos/{proceso.id}"),
        )


def permiso_legible(visible_cliente: bool) -> str:
    return "abogado participante, visible para el cliente" if visible_cliente else "colaborador interno"


def avisar_miembro_agregado(
    db: Session, proceso: models.Proceso, abogado: models.Usuario, actor: models.Usuario, visible_cliente: bool
) -> None:
    permiso = permiso_legible(visible_cliente)
    enlace = user_portal_url(abogado, f"/gestion-procesos/abogado/procesos/{proceso.id}/resumen")
    cuerpo = (
        f"Hola {abogado.nombre_completo},\n\n"
        f"{actor.nombre_completo} lo agregó como {permiso} en el proceso {proceso.nombre}.\n\n"
        f"Proceso: {proceso.nombre}\nResponsable: {proceso.abogado.nombre_completo}\nPermiso: {permiso}\n\n"
        f"Abrir enlace: Ver proceso | {enlace}"
    )
    emitir_notificacion_workflow(
        db, abogado, "RESUMENES", f"COLABORACION_PROCESO:{proceso.id}:{abogado.id}:{uuid4().hex}",
        f"Lo agregaron al proceso {proceso.nombre}", cuerpo,
        incluir_email=True,
        plantilla_clave="COLABORADOR_AGREGADO",
        variables={"nombre": abogado.nombre_completo, "actor": actor.nombre_completo, "permiso": permiso,
                   "proceso": proceso.nombre, "responsable": proceso.abogado.nombre_completo},
        enlace_texto="Ver proceso",
        enlace_url=enlace,
    )
