"""Persist and launch notification deliveries through Vercel Workflows."""

import hashlib
import logging
from urllib.parse import urljoin

import requests
from sqlalchemy.orm import Session

from app import models
from app.notification_policy import canales_habilitados, canales_recordatorio_seleccionados
from app.workflow_service import workflow_frontend_url, workflow_service_headers

logger = logging.getLogger(__name__)


def _delivery_key(tipo: str, origen: str, usuario_id: int, canal: str) -> str:
    source = f"{tipo}:{origen}:{usuario_id}:{canal}".encode("utf-8")
    return f"{tipo}:{hashlib.sha256(source).hexdigest()}"


def crear_entrega_canal(
    db: Session,
    usuario: models.Usuario,
    tipo: str,
    origen: str,
    canal: str,
    asunto: str,
    cuerpo: str,
    recordatorio_id: int | None = None,
    recordatorio_version: int | None = None,
) -> int:
    clave = _delivery_key(tipo, origen, usuario.id, canal)
    entrega = db.query(models.EntregaNotificacion).filter_by(
        clave_idempotencia=clave
    ).with_for_update().first()
    if entrega is None:
        entrega = models.EntregaNotificacion(
            clave_idempotencia=clave,
            usuario_id=usuario.id,
            tipo=tipo,
            canal=canal,
            recordatorio_id=recordatorio_id,
            recordatorio_version=recordatorio_version,
            asunto=asunto,
            cuerpo=cuerpo,
            estado="PENDIENTE",
        )
        db.add(entrega)
        db.flush()
    elif entrega.estado not in {"ENVIADA", "OMITIDA"} and entrega.intentos < 3:
        entrega.asunto = asunto
        entrega.cuerpo = cuerpo
        entrega.recordatorio_id = recordatorio_id
        entrega.recordatorio_version = recordatorio_version
        entrega.estado = "PENDIENTE"
        entrega.error = None
        entrega.lease_hasta = None
    db.commit()
    db.refresh(entrega)
    return entrega.id


def _iniciar_workflow(entrega_ids: list[int]) -> None:
    if not entrega_ids:
        return
    base_url = workflow_frontend_url()
    headers = workflow_service_headers()
    if not base_url or "Authorization" not in headers:
        logger.error("No se pudo iniciar Workflow de notificaciones: falta la URL o el token de servicio.")
        return
    try:
        response = requests.post(
            urljoin(base_url.rstrip("/") + "/", "workflow-internal/notificaciones"),
            headers=headers,
            json={"entrega_ids": sorted(set(entrega_ids))},
            timeout=10,
        )
        if not response.ok:
            logger.error("El launcher de notificaciones respondió HTTP %s.", response.status_code)
    except requests.RequestException:
        logger.exception("No fue posible iniciar el Workflow de notificaciones.")


def emitir_notificacion_workflow(
    db: Session,
    usuario: models.Usuario,
    tipo: str,
    origen: str,
    asunto: str,
    cuerpo: str,
    emisor: models.Usuario | None = None,
    iniciar_workflow: bool = True,
    recordatorio_id: int | None = None,
    recordatorio_version: int | None = None,
    actuacion_ids: list[int] | None = None,
) -> list[int]:
    recordatorio = (
        db.query(models.RecordatorioTarea).filter_by(id=recordatorio_id).first()
        if tipo == "RECORDATORIOS" and recordatorio_id is not None
        else None
    )
    canales = (
        canales_recordatorio_seleccionados(usuario, recordatorio)
        if tipo == "RECORDATORIOS" and recordatorio_id is not None
        else canales_habilitados(usuario, tipo, emisor=emisor)
    )
    if not canales:
        if usuario.rol == models.RolUsuario.CLIENTE:
            canal = usuario.canal_notificacion_cliente or "SIN_CANAL"
            clave = _delivery_key(tipo, origen, usuario.id, f"BLOQUEADA:{canal}")
            existente = db.query(models.EntregaNotificacion).filter_by(
                clave_idempotencia=clave
            ).first()
            if existente is None:
                existente = models.EntregaNotificacion(
                    clave_idempotencia=clave,
                    usuario_id=usuario.id,
                    tipo=tipo,
                    canal=canal,
                    recordatorio_id=recordatorio_id,
                    recordatorio_version=recordatorio_version,
                    asunto=asunto,
                    cuerpo=cuerpo,
                    estado="OMITIDA",
                    error="El canal obligatorio no está disponible para este contacto o plan.",
                )
                db.add(existente)
                db.flush()
            for actuacion_id in actuacion_ids or []:
                mapping = db.query(models.EntregaNotificacionActuacion).filter_by(
                    actuacion_id=actuacion_id,
                    usuario_id=usuario.id,
                    canal=canal,
                ).first()
                if mapping is None:
                    db.add(models.EntregaNotificacionActuacion(
                        entrega_id=existente.id,
                        actuacion_id=actuacion_id,
                        usuario_id=usuario.id,
                        canal=canal,
                    ))
            db.commit()
            return [existente.id]
        return []

    entrega_ids = [
        crear_entrega_canal(
            db,
            usuario,
            tipo,
            origen,
            canal,
            asunto,
            cuerpo,
            recordatorio_id=recordatorio_id,
            recordatorio_version=recordatorio_version,
        )
        for canal in canales
    ]
    for entrega_id, canal in zip(entrega_ids, canales):
        for actuacion_id in actuacion_ids or []:
            mapping = db.query(models.EntregaNotificacionActuacion).filter_by(
                actuacion_id=actuacion_id,
                usuario_id=usuario.id,
                canal=canal,
            ).first()
            if mapping is None:
                db.add(models.EntregaNotificacionActuacion(
                    entrega_id=entrega_id,
                    actuacion_id=actuacion_id,
                    usuario_id=usuario.id,
                    canal=canal,
                ))
    if actuacion_ids:
        db.commit()
    if iniciar_workflow:
        dispatchable = (
            db.query(models.EntregaNotificacion.id)
            .filter(
                models.EntregaNotificacion.id.in_(entrega_ids),
                models.EntregaNotificacion.estado.in_(("PENDIENTE", "ERROR")),
                models.EntregaNotificacion.intentos < 3,
            )
            .all()
        )
        _iniciar_workflow([row.id for row in dispatchable])
    return entrega_ids
