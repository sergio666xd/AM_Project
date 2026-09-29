from __future__ import annotations

from fastapi import HTTPException, status
from app import models


def role_name(user: object) -> str:
    role = getattr(user, "rol", None)
    return role.value if hasattr(role, "value") else str(role)


def has_firm_wide_access(user: object) -> bool:
    return role_name(user) == "ADMIN"


def is_process_manager(user: object, responsible_id: int) -> bool:
    return has_firm_wide_access(user) or (
        role_name(user) in {"ABOGADO", "ABOGADO_ADMIN"}
        and getattr(user, "id", None) == responsible_id
    )


def require_process_manager(
    actor: object,
    responsible_id: int,
    action: str = "administrar el equipo del proceso",
) -> None:
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no autenticado.")
    if not is_process_manager(actor, responsible_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Solo el responsable o ADMIN puede {action}.")


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


def require_roles(actor: object, allowed_roles: set[str] | list[str], action: str = "realizar esta acción") -> None:
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no autenticado.")
    if role_name(actor) not in set(allowed_roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"No tienes permiso para {action}.")


def require_process_access(
    actor: object,
    responsible_lawyer_id: int,
    action: str = "acceder al proceso",
    process_id: int | None = None,
    db=None,
) -> None:
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no autenticado.")
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
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"No tienes permiso para {action}.",
    )


def require_responsible_or_manager(actor: object, responsible_id: int | None, action: str = "realizar esta acción") -> None:
    if actor is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no autenticado.")
    if role_name(actor) == "ADMIN":
        return
    if role_name(actor) in {"ABOGADO", "ABOGADO_ADMIN"} and getattr(actor, "id", None) == responsible_id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"No tienes permiso para {action}.",
    )