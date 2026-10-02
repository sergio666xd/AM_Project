"""Schedule durable Workflows for task reminders and reconcile failed starts."""

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlsplit

import requests
from sqlalchemy.orm import Session

from app import models
from app.workflow_service import workflow_frontend_url, workflow_service_headers

logger = logging.getLogger(__name__)


def normalizar_utc_naive(momento: datetime | None) -> datetime | None:
    if momento is None:
        return None
    if momento.tzinfo is not None:
        return momento.astimezone(timezone.utc).replace(tzinfo=None)
    return momento


def momento_programado(
    recordatorio: models.RecordatorioTarea,
    tarea: models.Tarea,
) -> datetime | None:
    momento = recordatorio.fecha_hora
    if momento is None and recordatorio.anticipacion_minutos is not None and tarea.fecha_limite:
        fecha_limite = normalizar_utc_naive(tarea.fecha_limite)
        momento = fecha_limite - timedelta(minutes=recordatorio.anticipacion_minutos)
    return normalizar_utc_naive(momento)


def _iso_utc(momento: datetime) -> str:
    return momento.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def iniciar_workflow_recordatorio(db: Session, recordatorio_id: int) -> bool:
    recordatorio = (
        db.query(models.RecordatorioTarea)
        .filter_by(id=recordatorio_id)
        .with_for_update()
        .first()
    )
    if (
        recordatorio is None
        or not recordatorio.activo
        or recordatorio.enviado_en is not None
        or recordatorio.workflow_version_lanzada == recordatorio.version
    ):
        db.rollback()
        return False

    momento = momento_programado(recordatorio, recordatorio.tarea)
    if momento is None:
        logger.error("No se pudo programar Workflow para recordatorio %s sin fecha vigente.", recordatorio.id)
        db.rollback()
        return False

    base_url = workflow_frontend_url()
    headers = workflow_service_headers()
    if not base_url or "Authorization" not in headers:
        logger.error("No se pudo iniciar Workflow de recordatorio: falta la URL o el token de servicio.")
        db.rollback()
        return False

    version = recordatorio.version
    try:
        response = requests.post(
            urljoin(base_url.rstrip("/") + "/", "workflow-internal/recordatorios"),
            headers=headers,
            json={
                "recordatorio_id": recordatorio.id,
                "version": version,
                "programado_para": _iso_utc(momento),
            },
            timeout=10,
        )
        if not response.ok:
            if response.status_code == 401:
                content_type = getattr(response, "headers", {}).get("content-type", "").lower()
                reason = (
                    "DEPLOYMENT_PROTECTION_OR_PROXY"
                    if "html" in content_type or "text/" in content_type
                    else "AUTH_REJECTED_WITHOUT_LAUNCHER_CODE"
                )
                if "json" in content_type:
                    try:
                        code = response.json().get("code")
                        if code in {
                            "WORKFLOW_SERVICE_TOKEN_MISSING",
                            "AUTHORIZATION_HEADER_MISSING",
                            "WORKFLOW_SERVICE_TOKEN_MISMATCH",
                        }:
                            reason = code
                    except (ValueError, AttributeError):
                        pass
                launcher_host = urlsplit(base_url).hostname or "unknown"
                logger.error(
                    "El launcher de recordatorios respondió HTTP 401 (%s; host=%s; content_type=%s).",
                    reason,
                    launcher_host,
                    content_type or "unknown",
                )
            else:
                logger.error("El launcher de recordatorios respondió HTTP %s.", response.status_code)
            db.rollback()
            return False
    except requests.RequestException:
        logger.exception("No fue posible iniciar el Workflow de recordatorio %s.", recordatorio.id)
        db.rollback()
        return False

    actual = (
        db.query(models.RecordatorioTarea)
        .filter_by(id=recordatorio.id, version=version)
        .with_for_update()
        .first()
    )
    if (
        actual is None
        or not actual.activo
        or actual.enviado_en is not None
        or actual.tarea is None
        or actual.tarea.estado in {
            models.EstadoTarea.COMPLETADA,
            models.EstadoTarea.CANCELADA,
        }
    ):
        db.commit()
        return False
    actual.workflow_version_lanzada = version
    db.commit()
    return True