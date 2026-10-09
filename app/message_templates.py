"""Database backed rendering for editable system messages."""

import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models

_TOKEN = re.compile(r"{{\s*([a-zA-Z0-9_.-]+)\s*}}")


def _render(source: str | None, values: dict[str, Any]) -> str:
    if not source:
        return ""
    source = source.replace("\\n", "\n")

    def replace(match: re.Match[str]) -> str:
        value: Any = values
        for part in match.group(1).split("."):
            value = value.get(part, "") if isinstance(value, dict) else ""
        return str(value if value is not None else "")

    return _TOKEN.sub(replace, source)


def render_message(
    db: Session,
    key: str,
    values: dict[str, Any],
    *,
    canal: str,
    link_label: str | None = None,
    link_url: str | None = None,
) -> tuple[str, str]:
    template = db.query(models.PlantillaMensaje).filter_by(clave=key, activo=True).first()
    if template is None:
        raise HTTPException(status_code=503, detail=f"La plantilla de mensaje '{key}' no está configurada.")
    subject = _render(template.asunto_email, values)
    body = _render(template.cuerpo_whatsapp if canal == "WHATSAPP" else template.cuerpo_email, values)
    if link_label and link_url:
        body = f"{body.rstrip()}\n\nAbrir enlace: {link_label} | {link_url}"
    return subject, body


def render_direct_message(
    db: Session,
    key: str,
    values: dict[str, Any],
    *,
    link_label: str | None = None,
    link_url: str | None = None,
) -> tuple[str, str]:
    template = db.query(models.PlantillaMensaje).filter_by(clave=key, activo=True).first()
    if template is None:
        raise HTTPException(status_code=503, detail=f"La plantilla de mensaje '{key}' no está configurada.")
    body = _render(template.cuerpo_email, values)
    if link_label and link_url:
        body = f"{body.rstrip()}\n\nAbrir enlace: {link_label} | {link_url}"
    return _render(template.asunto_email, values), body
