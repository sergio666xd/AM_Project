"""Consulta y depuración de los eventos de auditoría."""

import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import verificar_admin
from app.routers.admin.dashboard import (
    _dashboard_activity_description,
    _dashboard_activity_href,
)

router = APIRouter(prefix="/api/admin", tags=["Administración"])


# Resource groups consumed by the admin audit filters and event serializer.
AUDIT_RESOURCE_MODULES = {
    "Usuarios": ("usuario", "solicitud_registro"),
    "Procesos": ("proceso", "proceso_cliente", "proceso_radicado"),
    "Radicados": ("radicado",),
    "Tareas": ("tarea", "subtarea", "recordatorio_tarea"),
    "Documentos": ("documento_proceso", "solicitud_documento"),
    "Planes": ("plan",),
    "Contenido público": ("pagina_publica",),
    "Alertas": ("alerta",),
    "Configuración": ("configuracion_consultas", "configuracion_integraciones", "configuracion_saas"),
}


AUDIT_RESOURCE_MODULE_LABELS = {
    resource: module
    for module, resources in AUDIT_RESOURCE_MODULES.items()
    for resource in resources
}


@router.get("/auditoria")
def listar_eventos_auditoria(
    limit: int = 100,
    offset: int = 0,
    usuario: str | None = None,
    accion: str | None = None,
    modulo: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    resultado: str | None = None,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    query = (
        db.query(models.EventoAuditoria, models.Usuario.nombre_completo)
        .outerjoin(models.Usuario, models.Usuario.id == models.EventoAuditoria.actor_id)
    )
    if usuario:
        term = f"%{usuario.strip()}%"
        query = query.filter(or_(models.Usuario.nombre_completo.ilike(term), models.EventoAuditoria.actor_id.cast(models.String).ilike(term)))
    if accion:
        query = query.filter(models.EventoAuditoria.accion == accion)
    if modulo:
        tipos_recurso = AUDIT_RESOURCE_MODULES.get(modulo)
        if tipos_recurso:
            query = query.filter(models.EventoAuditoria.tipo_recurso.in_(tipos_recurso))
        elif modulo == "Sistema":
            recursos_con_modulo = tuple(resource for resources in AUDIT_RESOURCE_MODULES.values() for resource in resources)
            query = query.filter(~models.EventoAuditoria.tipo_recurso.in_(recursos_con_modulo))
        else:
            return []
    if fecha_desde:
        query = query.filter(models.EventoAuditoria.created_at >= datetime.combine(fecha_desde, datetime.min.time()))
    if fecha_hasta:
        query = query.filter(models.EventoAuditoria.created_at < datetime.combine(fecha_hasta + timedelta(days=1), datetime.min.time()))
    if resultado:
        normalized_result = resultado.upper()
        if normalized_result not in {"REGISTRADO", "ERROR"}:
            return []
        if normalized_result == "ERROR":
            query = query.filter(models.EventoAuditoria.error_tecnico.is_not(None))
        else:
            query = query.filter(models.EventoAuditoria.error_tecnico.is_(None))
    eventos = (
        query
        .order_by(models.EventoAuditoria.created_at.desc(), models.EventoAuditoria.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    results = []
    for evento, actor_name in eventos:
        description, resource_label = _dashboard_activity_description(evento.accion, evento.tipo_recurso)
        modulo_label = AUDIT_RESOURCE_MODULE_LABELS.get(evento.tipo_recurso, "Sistema")
        try:
            metadata = json.loads(evento.metadata_json) if evento.metadata_json else None
        except (TypeError, ValueError):
            metadata = evento.metadata_json
        results.append({
            "id": evento.id,
            "actor_id": evento.actor_id,
            "actor": actor_name or "Sistema",
            "accion": evento.accion,
            "tipo_recurso": evento.tipo_recurso,
            "modulo": modulo_label,
            "recurso_id": evento.recurso_id,
            "created_at": evento.created_at,
            "descripcion": f"{actor_name or 'El sistema'} {description}.",
            "recurso": resource_label,
            "resultado": "ERROR" if evento.error_tecnico else "REGISTRADO",
            "href": _dashboard_activity_href(evento.tipo_recurso, evento.recurso_id),
            # Estos campos no se registran todavía en EventoAuditoria; null es explícito y no inventado.
            "detalle_tecnico": {
                "endpoint": evento.endpoint,
                "metodo": evento.metodo,
                "recurso": evento.tipo_recurso,
                "id": evento.recurso_id,
                "metadata": metadata,
                "error": evento.error_tecnico,
            },
        })
    return results


@router.delete("/auditoria")
def eliminar_eventos_auditoria(
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    ids = datos.get("ids")
    if not isinstance(ids, list) or not ids or len(ids) > 200:
        raise HTTPException(status_code=400, detail="Selecciona entre 1 y 200 registros de auditoría.")
    if any(not isinstance(event_id, int) or isinstance(event_id, bool) or event_id < 1 for event_id in ids):
        raise HTTPException(status_code=400, detail="La selección contiene identificadores inválidos.")
    selected_ids = list(set(ids))
    deleted = db.query(models.EventoAuditoria).filter(models.EventoAuditoria.id.in_(selected_ids)).delete(synchronize_session=False)
    if not deleted:
        raise HTTPException(status_code=404, detail="No se encontraron registros para eliminar.")
    registrar_evento_auditoria(db, admin, "admin.auditoria.eliminar_en_bloque", "evento_auditoria", None, {"cantidad": deleted})
    db.commit()
    return {"eliminados": deleted}


@router.delete("/auditoria/{evento_id}")
def eliminar_evento_auditoria(
    evento_id: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    evento = db.query(models.EventoAuditoria).filter(models.EventoAuditoria.id == evento_id).first()
    if evento is None:
        raise HTTPException(status_code=404, detail="El registro de auditoría no existe.")
    db.delete(evento)
    registrar_evento_auditoria(db, admin, "admin.auditoria.eliminar", "evento_auditoria", evento_id)
    db.commit()
    return {"eliminado": evento_id}
