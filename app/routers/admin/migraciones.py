"""Migración de radicados canónicos desde la API de administración."""

import os

from fastapi import APIRouter, Depends, HTTPException

from app import models, schemas
from app.database import engine
from app.migrate_radicados_canonicos import migrar as migrar_radicados_canonicos
from app.migrate_radicados_canonicos import (
    previsualizar as previsualizar_migracion_radicados,
)
from app.routers.admin.comun import verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get("/migraciones/radicados/preview")
def previsualizar_migracion_radicados_admin(
    admin: models.Usuario = Depends(verificar_admin),
):
    """Read-only counts and blockers before the explicit schema migration."""
    try:
        with engine.connect() as connection:
            return previsualizar_migracion_radicados(connection)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="No fue posible revisar la migración de radicados en esta base de datos.",
        ) from exc


@router.post("/migraciones/radicados/aplicar")
def aplicar_migracion_radicados_admin(
    datos: schemas.AplicarMigracionRadicados,
    admin: models.Usuario = Depends(verificar_admin),
):
    """Apply the migration only when explicitly enabled and backup-confirmed."""
    enabled = os.getenv("RADICADO_MIGRATION_API_ENABLED", "").strip().lower() == "true"
    if not enabled:
        raise HTTPException(
            status_code=404,
            detail="La ejecución de migraciones desde API está deshabilitada.",
        )
    if datos.confirmacion != "CONFIRMO_BACKUP_VERIFICADO":
        raise HTTPException(status_code=400, detail="Se requiere confirmar el backup verificado.")

    try:
        with engine.begin() as connection:
            reporte = migrar_radicados_canonicos(connection)
            connection.execute(
                models.EventoAuditoria.__table__.insert().values(
                    actor_id=admin.id,
                    accion="admin.migracion.radicados.aplicar",
                    tipo_recurso="migracion",
                    recurso_id="radicados_canonicos",
                )
            )
        return {"aplicada": True, "reporte": reporte}
    except RuntimeError as exc:
        raise HTTPException(
            status_code=409,
            detail="El preflight bloqueó la migración; revisa conflictos y referencias.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="No fue posible aplicar la migración; la transacción se revirtió.",
        ) from exc
