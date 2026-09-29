from sqlalchemy.orm import Session

from app import models


def registrar_evento_auditoria(
    db: Session,
    actor: models.Usuario,
    accion: str,
    tipo_recurso: str,
    recurso_id: int | str | None = None,
) -> None:
    db.add(
        models.EventoAuditoria(
            actor_id=actor.id,
            accion=accion,
            tipo_recurso=tipo_recurso,
            recurso_id=str(recurso_id) if recurso_id is not None else None,
        )
    )