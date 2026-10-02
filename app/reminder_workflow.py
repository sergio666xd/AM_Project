"""Schedule durable Workflows for task reminders and reconcile failed starts."""

import logging
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

import requests
from sqlalchemy.orm import Session

from app import models

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

    base_url = os.getenv("WORKFLOW_FRONTEND_URL") or (
        "http://localhost:3000" if os.getenv("NODE_ENV") == "development" else ""
    )
    token = os.getenv("WORKFLOW_SERVICE_TOKEN", "")
    if not base_url or not token:
        logger.error("No se pudo iniciar Workflow de recordatorio: falta el binding o token de servicio.")
        db.rollback()
        return False

    version = recordatorio.version
    try:
        response = requests.post(
            urljoin(base_url.rstrip("/") + "/", "workflow-internal/recordatorios"),
            headers={"Authorization": f"Bearer {token}"},
            json={
                "recordatorio_id": recordatorio.id,
                "version": version,
                "programado_para": _iso_utc(momento),
            },
            timeout=10,
        )
        if not response.ok:
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