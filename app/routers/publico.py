"""Endpoints públicos del sitio: configuración, contenido, planes y registro de interés."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.rate_limit import (
    VENTANA_INTENTOS,
    clave_intento,
    ip_cliente,
    limite_excedido,
    registrar_intentos,
)
from app.site_content import PUBLIC_CONTENT_PAGES, PUBLIC_PAGE_ROUTES

router = APIRouter()


@router.get("/api/configuracion-publica", response_model=schemas.ConfiguracionSaasOut)
def obtener_configuracion_publica(db: Session = Depends(get_db)):
    configuracion = db.query(models.ConfiguracionSaas).filter_by(id=1).first()
    return {"mostrar_planes": configuracion.mostrar_planes if configuracion else True}


@router.get("/api/contacto-publico")
def obtener_contacto_publico(db: Session = Depends(get_db)):
    """Datos de contacto que el sitio público muestra, tomados de la configuración del panel.

    Si la administración desactiva "mostrar_contacto_publico", solo se expone el nombre.
    """
    config = db.query(models.ConfiguracionFirma).filter_by(id=1).first()
    if config is None:
        config = models.ConfiguracionFirma(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    datos = {"nombre": config.nombre, "mostrar_contacto": bool(config.mostrar_contacto_publico)}
    if not config.mostrar_contacto_publico:
        return datos
    return {
        **datos,
        "correo_contacto": config.correo_contacto,
        "correo_pqr": config.correo_pqr,
        "telefono": config.telefono,
        "whatsapp": config.whatsapp,
        "direccion": config.direccion,
        "ciudad": config.ciudad,
        "pais": config.pais,
    }


@router.get("/api/contenido-publico/{slug}")
def obtener_contenido_publico(slug: str, db: Session = Depends(get_db)):
    if slug not in PUBLIC_CONTENT_PAGES:
        raise HTTPException(status_code=404, detail="Página pública no encontrada.")
    page = db.query(models.ContenidoPagina).filter_by(slug=slug).first()
    if page is None:
        raise HTTPException(status_code=404, detail="La página usa su contenido base.")
    return {"slug": page.slug, "contenido": page.contenido, "updated_at": page.updated_at}


@router.get("/api/contenido-publico/ruta/resolver")
def resolver_ruta_contenido_publico(ruta: str, db: Session = Depends(get_db)):
    normalized = ruta.rstrip("/") or "/"
    for slug, default_route in PUBLIC_PAGE_ROUTES.items():
        page = db.query(models.ContenidoPagina).filter_by(slug=slug).first()
        saved_route = (page.contenido or {}).get("route") if page and isinstance(page.contenido, dict) else None
        current_route = saved_route or default_route
        if normalized == current_route:
            return {"slug": slug, "ruta": current_route}
    raise HTTPException(status_code=404, detail="Ruta de contenido público no encontrada.")


@router.get("/api/planes-publicos", response_model=list[schemas.PlanOut])
def listar_planes_publicos(db: Session = Depends(get_db)):
    """Retorna planes SaaS disponibles para abogados externos."""
    return db.query(models.Plan).filter(models.Plan.activo == True).order_by(models.Plan.precio_mensual.asc(), models.Plan.id.asc()).all()


@router.post("/api/intereses-saas", response_model=schemas.InteresSaasOut, status_code=status.HTTP_201_CREATED)
def registrar_interes_saas(
    interes: schemas.InteresSaasCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    clave_ip = clave_intento("interes:ip", ip_cliente(request))
    if limite_excedido(db, [(clave_ip, 5)], VENTANA_INTENTOS):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta nuevamente más tarde.")
    registrar_intentos(db, [clave_ip])
    if interes.website.strip():
        raise HTTPException(status_code=400, detail="No fue posible procesar la solicitud.")
    if not interes.autorizacion_datos:
        raise HTTPException(status_code=400, detail="Debe autorizar el tratamiento de sus datos.")
    email = str(interes.email).strip().lower()
    if not db.query(models.InteresSaas).filter(models.InteresSaas.email == email).first():
        db.add(models.InteresSaas(email=email))
        db.commit()
    return {"mensaje": "Gracias. Le avisaremos sobre los planes para abogados externos."}
