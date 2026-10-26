"""Edición del contenido de las páginas públicas."""

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import verificar_admin
from app.site_content import PUBLIC_CONTENT_PAGES, PUBLIC_PAGE_ROUTES

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get("/contenido")
def listar_contenido_publico_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    saved = {
        page.slug: page
        for page in db.query(models.ContenidoPagina).all()
    }
    def configured_route(slug):
        contenido = saved[slug].contenido if slug in saved else None
        return contenido.get("route", PUBLIC_PAGE_ROUTES[slug]) if isinstance(contenido, dict) else PUBLIC_PAGE_ROUTES[slug]
    return [
        {
            "slug": slug,
            "nombre": label,
            "contenido": saved[slug].contenido if slug in saved else None,
            "ruta": configured_route(slug),
            "updated_at": saved[slug].updated_at if slug in saved else None,
        }
        for slug, label in PUBLIC_CONTENT_PAGES.items()
    ]


@router.put("/contenido/{slug}")
def guardar_contenido_publico_admin(
    slug: str,
    datos: schemas.ContenidoPaginaUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if slug not in PUBLIC_CONTENT_PAGES:
        raise HTTPException(status_code=404, detail="Página pública no disponible para edición.")
    if not isinstance(datos.contenido, dict):
        raise HTTPException(status_code=400, detail="El contenido debe ser un objeto.")
    route = datos.contenido.get("route")
    if not isinstance(route, str) or not re.fullmatch(r"/(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*|/", route):
        raise HTTPException(status_code=400, detail="La ruta debe comenzar con / y usar minúsculas, números y guiones.")
    if route != "/" and any(route == reserved or route.startswith(f"{reserved}/") for reserved in ("/api", "/gestion-procesos", "/_next", "/robots.txt", "/sitemap.xml", "/favicon.ico")):
        raise HTTPException(status_code=400, detail="La ruta elegida está reservada para el sistema.")
    for other_slug in PUBLIC_CONTENT_PAGES:
        if other_slug == slug:
            continue
        other_page = db.query(models.ContenidoPagina).filter_by(slug=other_slug).first()
        other_content = other_page.contenido if other_page else None
        other_route = other_content.get("route", PUBLIC_PAGE_ROUTES[other_slug]) if isinstance(other_content, dict) else PUBLIC_PAGE_ROUTES[other_slug]
        if route == other_route or route == PUBLIC_PAGE_ROUTES[other_slug]:
            raise HTTPException(status_code=409, detail="Esa ruta ya está asignada a otra página.")
    if len(json.dumps(datos.contenido, ensure_ascii=False)) > 250_000:
        raise HTTPException(status_code=413, detail="El contenido de la página supera el tamaño permitido.")
    page = db.query(models.ContenidoPagina).filter_by(slug=slug).first()
    if page is None:
        page = models.ContenidoPagina(slug=slug, contenido=datos.contenido)
        db.add(page)
    else:
        page.contenido = datos.contenido
    page.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.contenido.guardar", "pagina_publica", slug)
    db.commit()
    db.refresh(page)
    return {"slug": page.slug, "contenido": page.contenido, "ruta": route, "updated_at": page.updated_at}


@router.delete("/contenido/{slug}")
def restaurar_contenido_publico_admin(
    slug: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if slug not in PUBLIC_CONTENT_PAGES:
        raise HTTPException(status_code=404, detail="Página pública no disponible para edición.")
    page = db.query(models.ContenidoPagina).filter_by(slug=slug).first()
    if page is not None:
        db.delete(page)
    registrar_evento_auditoria(db, admin, "admin.contenido.restaurar", "pagina_publica", slug)
    db.commit()
    return {"mensaje": "Se restaurará el contenido base de la página."}
