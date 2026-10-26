"""Shared helpers for account password reset messages."""

import ipaddress
import logging
import os
from urllib.parse import quote, urlsplit

from app.database import SessionLocal
from app.email_service import enviar_correo
from app.message_templates import render_direct_message
from app.workflow_service import public_site_url
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)


def password_reset_frontend_url() -> str:
    """Use a configured public frontend origin and avoid localhost in production."""
    configured = os.getenv("FRONTEND_URL", "").strip()
    candidate = configured if "://" in configured else f"https://{configured}" if configured else ""
    parsed = urlsplit(candidate) if candidate else None
    hostname = (parsed.hostname or "").lower() if parsed else ""
    is_local = hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".localhost")
    if hostname:
        try:
            address = ipaddress.ip_address(hostname)
            is_local = is_local or address.is_loopback or address.is_unspecified
        except ValueError:
            pass
    if parsed and parsed.scheme in {"http", "https"} and parsed.netloc and hostname and not is_local:
        return candidate.rstrip("/")

    canonical = public_site_url()
    canonical_host = (urlsplit(canonical).hostname or "").lower()
    if os.getenv("NODE_ENV") != "development" and (
        canonical_host in {"localhost", "localhost.localdomain"}
        or canonical_host.endswith(".localhost")
    ):
        return "https://www.alejandramunozabogada.com"
    return canonical


def password_reset_url(token: str, role: object | None = None) -> str:
    route = f"/gestion-procesos/auth/restablecer-password?token={quote(token, safe='')}"
    if role is not None:
        return user_portal_url(role, route)
    return f"{password_reset_frontend_url()}{route}"


def send_password_reset_email(email: str, reset_url: str) -> None:
    db = SessionLocal()
    try:
        subject, body = render_direct_message(
            db, "RECUPERAR_PASSWORD", {},
            link_label="Restablecer contraseña", link_url=reset_url,
        )
        if not enviar_correo(email, subject, body):
            logger.warning("Password reset email was not sent to %s", email)
    except Exception:
        logger.exception("Password reset email delivery failed.")
    finally:
        db.close()
