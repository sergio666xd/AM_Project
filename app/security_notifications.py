"""Send security change confirmations through the user's registered channels."""

import logging

from app.database import SessionLocal
from app.email_service import enviar_correo
from app.message_templates import render_message
from app.whatsapp import enviar_mensaje_whatsapp

logger = logging.getLogger(__name__)


def send_security_change_confirmation(
    name: str,
    change: str,
    emails: list[str],
    whatsapp_numbers: list[str],
) -> None:
    db = SessionLocal()
    try:
        variables = {"nombre": name, "cambio": change}
        for email in dict.fromkeys(value.strip().lower() for value in emails if value.strip()):
            try:
                subject, body = render_message(db, "CAMBIO_SEGURIDAD_CONFIRMADO", variables, canal="EMAIL")
                if not enviar_correo(email, subject, body):
                    logger.warning("Security change confirmation email was not sent to %s", email)
            except Exception:
                logger.exception("Security change confirmation email failed for %s", email)
        for number in dict.fromkeys(value.strip() for value in whatsapp_numbers if value.strip()):
            try:
                _, body = render_message(db, "CAMBIO_SEGURIDAD_CONFIRMADO", variables, canal="WHATSAPP")
                if not enviar_mensaje_whatsapp(number, body):
                    logger.warning("Security change confirmation WhatsApp was not sent")
            except Exception:
                logger.exception("Security change confirmation WhatsApp failed")
    finally:
        db.close()
