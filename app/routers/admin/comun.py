"""Utilidades compartidas por los routers de administración."""

import logging

from fastapi import Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.firm_access import require_roles
from app.security import obtener_usuario_actual

logger = logging.getLogger(__name__)


def _validar_capacidad_actuaciones(limite: int | None) -> None:
    if limite is not None and limite < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El límite de actuaciones debe ser mayor que cero o null para todas.",
        )


def _roles_para_sector(sector: str) -> tuple[models.RolUsuario, ...]:
    sectores = {
        "FIRMA": (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN),
        "SAAS": (models.RolUsuario.ABOGADO,),
        "GLOBAL": (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN, models.RolUsuario.ABOGADO),
    }
    roles = sectores.get(sector.upper())
    if roles is None:
        raise HTTPException(status_code=400, detail="Selecciona un ámbito válido: FIRMA, SAAS o GLOBAL.")
    return roles


def _filtrar_radicados_por_sector(query, sector: str):
    sector = sector.upper()
    if sector == "FIRMA":
        return query.filter(models.Radicado.ambito_key == "FIRMA")
    if sector == "SAAS":
        return query.filter(models.Radicado.ambito_key.like("SAAS:%"))
    if sector == "GLOBAL":
        return query
    raise HTTPException(status_code=400, detail="Selecciona un ámbito válido: FIRMA, SAAS o GLOBAL.")


def _owner_admin(db: Session, owner_id: int, sector: str) -> models.Usuario:
    roles = _roles_para_sector(sector)
    owner = db.query(models.Usuario).filter(
        models.Usuario.id == owner_id,
        models.Usuario.rol.in_(roles),
    ).first()
    if owner is None:
        raise HTTPException(status_code=400, detail="El responsable no pertenece al ámbito seleccionado.")
    return owner


def _query_inventario_admin(db: Session, recurso: str, sector: str):
    roles = _roles_para_sector(sector)
    if recurso == "procesos":
        return db.query(models.Proceso).join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id).filter(models.Usuario.rol.in_(roles))
    if recurso == "radicados":
        return _filtrar_radicados_por_sector(db.query(models.Radicado), sector)
    if recurso == "tareas":
        return db.query(models.Tarea).join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id).filter(models.Usuario.rol.in_(roles))
    if recurso == "documentos":
        return db.query(models.DocumentoProceso).outerjoin(
            models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id
        ).outerjoin(
            models.Usuario, models.Usuario.id == models.Proceso.abogado_id
        ).filter(or_(
            models.DocumentoProceso.proceso_id.is_(None),
            models.Usuario.rol.in_(roles),
        ))
    raise HTTPException(status_code=404, detail="Inventario no disponible.")


def _recurso_admin_por_id(db: Session, recurso: str, item_id: int, sector: str):
    models_by_resource = {
        "procesos": models.Proceso,
        "radicados": models.Radicado,
        "tareas": models.Tarea,
        "documentos": models.DocumentoProceso,
    }
    model = models_by_resource.get(recurso)
    if model is None:
        raise HTTPException(status_code=404, detail="Inventario no disponible.")
    return _query_inventario_admin(db, recurso, sector).filter(model.id == item_id).first()


def verificar_admin(
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    require_roles(usuario_actual, ["ADMIN"], action="acceder al panel administrativo")
    return usuario_actual
