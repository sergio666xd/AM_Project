import json
from contextvars import ContextVar, Token

from sqlalchemy.orm import Session

from app import models


_request_context: ContextVar[tuple[str, str] | None] = ContextVar("audit_request_context", default=None)


def establecer_contexto_solicitud_auditoria(metodo: str, endpoint: str) -> Token:
    return _request_context.set((metodo.upper(), endpoint))


def limpiar_contexto_solicitud_auditoria(token: Token) -> None:
    _request_context.reset(token)


def registrar_evento_auditoria(
    db: Session,
    actor: models.Usuario,
    accion: str,
    tipo_recurso: str,
    recurso_id: int | str | None = None,
    metadata: dict | list | None = None,
    error_tecnico: str | None = None,
) -> None:
    request_context = _request_context.get()
    db.add(
        models.EventoAuditoria(
            actor_id=actor.id,
            accion=accion,
            tipo_recurso=tipo_recurso,
            recurso_id=str(recurso_id) if recurso_id is not None else None,
            endpoint=request_context[1] if request_context else None,
            metodo=request_context[0] if request_context else None,
            metadata_json=json.dumps(metadata, ensure_ascii=False, default=str) if metadata is not None else None,
            error_tecnico=error_tecnico,
        )
    )
