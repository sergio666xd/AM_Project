"""Browser push delivery helper for workflow notifications."""

import json
import logging
import os

from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)
DEFAULT_PUSH_ICON = "/AM_logo_Recurso%202_Landscape_web.png"


def firm_push_icon(db: Session) -> str:
    """Return the configured firm logo for browser push notifications."""
    try:
        config = db.query(models.ConfiguracionFirma).filter_by(id=1).first()
        logo_url = (config.logo_url or "").strip() if config else ""
        return logo_url or DEFAULT_PUSH_ICON
    except Exception:
        logger.exception("No se pudo leer el logo de la firma para la notificación Push.")
        return DEFAULT_PUSH_ICON


def send_web_push(
    db: Session,
    recipient: models.Usuario,
    *,
    title: str,
    body: str,
    link: str,
    tag: str,
) -> bool:
    public_key = os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY", "").strip()
    private_key = os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").strip()
    subject = os.getenv("WEB_PUSH_VAPID_SUBJECT", "mailto:contacto@alejandramunozabogada.com").strip()
    if not public_key or not private_key:
        missing = [name for name, value in (
            ("WEB_PUSH_VAPID_PUBLIC_KEY", public_key),
            ("WEB_PUSH_VAPID_PRIVATE_KEY", private_key),
        ) if not value]
        logger.warning(
            "Push no enviada al usuario %s: faltan variables de configuración %s.",
            recipient.id, ", ".join(missing),
        )
        return False

    subscriptions = db.query(models.ChatPushSubscription).filter_by(usuario_id=recipient.id).all()
    if not subscriptions:
        logger.info("Push no enviada al usuario %s: no tiene suscripciones registradas.", recipient.id)
        return False

    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:
        logger.exception("No se pudo importar pywebpush o una dependencia necesaria: %s", exc)
        return False

    icon = firm_push_icon(db)
    payload = json.dumps({"title": title, "body": body, "url": link, "tag": tag, "icon": icon, "badge": icon}, ensure_ascii=False)
    delivered = False
    failed = 0
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
                ttl=60 * 60,
                timeout=8,
            )
            delivered = True
        except WebPushException as exc:
            failed += 1
            status_code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                db.delete(subscription)
                logger.info(
                    "Suscripción Push vencida eliminada para usuario %s (HTTP %s).",
                    recipient.id, status_code,
                )
            else:
                logger.warning(
                    "No se pudo entregar Web Push al usuario %s (HTTP %s).",
                    recipient.id, status_code or "desconocido",
                )
        except Exception as exc:
            failed += 1
            logger.exception("Error al enviar Web Push al usuario %s: %s", recipient.id, exc)

    if not delivered:
        logger.warning(
            "Push no enviada al usuario %s: fallaron sus %s suscripciones registradas.",
            recipient.id, failed,
        )
    elif failed:
        logger.warning(
            "Push entregada al usuario %s, pero fallaron %s de %s suscripciones.",
            recipient.id, failed, len(subscriptions),
        )
    return delivered
