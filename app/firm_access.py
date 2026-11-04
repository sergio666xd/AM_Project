from __future__ import annotations

from app import models
from app.nucleo.errores import NoAutenticado, SinPermiso


def role_name(user: object) -> str:
    role = getattr(user, "rol", None)
    return role.value if hasattr(role, "value") else str(role)


def lawyer_process_ids(db, user: object, include_archived: bool = False):
    from sqlalchemy import or_

    query = db.query(models.Proceso.id)
    if not include_archived:
        query = query.filter(models.Proceso.archivado_en.is_(None))
    responsible_id = lawyer_scope_id(user)
    if responsible_id is None:
        return query.filter(models.Proceso.id == -1)
    if role_name(user) == "ABOGADO_ADMIN":
        collaborated_processes = db.query(models.ProcesoColaborador.proceso_id).filter(
            models.ProcesoColaborador.abogado_id == responsible_id
        )
        return query.filter(
            or_(
                models.Proceso.abogado_id == responsible_id,
                models.Proceso.id.in_(collaborated_processes),
            )
        )
    return query.filter(models.Proceso.abogado_id == responsible_id)


def lawyer_scope_id(user: object) -> int | None:
    if role_name(user) in {"ABOGADO", "ABOGADO_ADMIN"}:
        return getattr(user, "id", None)
    return None


def require_process_access(
    actor: object,
    responsible_lawyer_id: int,
    action: str = "acceder al proceso",
    process_id: int | None = None,
    db=None,
) -> None:
    if actor is None:
        raise NoAutenticado("Hace falta iniciar sesión para continuar.")
    if role_name(actor) == "ADMIN":
        return
    if role_name(actor) in {"ABOGADO", "ABOGADO_ADMIN"} and getattr(actor, "id", None) == responsible_lawyer_id:
        return
    if (
        role_name(actor) == "ABOGADO_ADMIN"
        and process_id is not None
        and db is not None
        and db.query(models.ProcesoColaborador).filter_by(
            proceso_id=process_id,
            abogado_id=getattr(actor, "id", None),
        ).first()
    ):
        return
    raise SinPermiso(f"Esta cuenta no tiene permiso para {action}.")


