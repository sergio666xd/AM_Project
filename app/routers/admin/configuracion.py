"""Configuración general y datos de la firma."""

from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get("/configuracion", response_model=schemas.ConfiguracionSaasOut)
def obtener_configuracion(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    configuracion = db.query(models.ConfiguracionSaas).filter_by(id=1).first()
    if not configuracion:
        configuracion = models.ConfiguracionSaas(id=1, mostrar_planes=False)
        db.add(configuracion)
        db.commit()
        db.refresh(configuracion)
    return configuracion


def _serializar_configuracion_firma(config: models.ConfiguracionFirma) -> dict:
    return {
        "nombre": config.nombre,
        "correo_contacto": config.correo_contacto,
        "correo_pqr": config.correo_pqr,
        "telefono": config.telefono,
        "whatsapp": config.whatsapp,
        "direccion": config.direccion,
        "ciudad": config.ciudad,
        "pais": config.pais,
        "logo_url": config.logo_url,
        "logo_correo_url": config.logo_correo_url,
        "sitio_web": config.sitio_web,
        "zona_horaria": config.zona_horaria,
        "mostrar_contacto_publico": config.mostrar_contacto_publico,
        "preferencias_notificacion": config.preferencias_notificacion or {"email": True, "whatsapp": True},
        "parametros_generales": config.parametros_generales or {},
        "updated_at": config.updated_at,
    }


@router.get("/configuracion/firma")
def obtener_configuracion_firma(db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    config = db.query(models.ConfiguracionFirma).filter_by(id=1).first()
    if config is None:
        config = models.ConfiguracionFirma(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return _serializar_configuracion_firma(config)


@router.put("/configuracion/firma")
def actualizar_configuracion_firma(
    datos: schemas.ConfiguracionFirmaUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    try:
        ZoneInfo(datos.zona_horaria)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="La zona horaria no es válida.") from exc
    for field_name in ("logo_url", "logo_correo_url", "sitio_web"):
        value = getattr(datos, field_name).strip()
        if value and urlsplit(value).scheme not in {"https", "http"}:
            raise HTTPException(status_code=400, detail=f"{field_name} debe usar una URL HTTP o HTTPS.")
    invalid_channels = set(datos.preferencias_notificacion) - {"email", "whatsapp"}
    if invalid_channels:
        raise HTTPException(status_code=400, detail="Las preferencias solo aceptan los canales email y whatsapp.")
    config = db.query(models.ConfiguracionFirma).filter_by(id=1).with_for_update().first()
    if config is None:
        config = models.ConfiguracionFirma(id=1)
        db.add(config)
    for field_name, value in datos.model_dump().items():
        setattr(config, field_name, value)
    config.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.configuracion_firma.actualizar", "configuracion_firma", 1)
    db.commit()
    db.refresh(config)
    return _serializar_configuracion_firma(config)


@router.put("/configuracion", response_model=schemas.ConfiguracionSaasOut)
def actualizar_configuracion(
    datos: schemas.ConfiguracionSaasUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    configuracion = db.query(models.ConfiguracionSaas).filter_by(id=1).first()
    if not configuracion:
        configuracion = models.ConfiguracionSaas(id=1)
        db.add(configuracion)
    configuracion.mostrar_planes = datos.mostrar_planes
    registrar_evento_auditoria(db, admin, "admin.configuracion.actualizar", "configuracion_saas", 1)
    db.commit()
    db.refresh(configuracion)
    return configuracion
