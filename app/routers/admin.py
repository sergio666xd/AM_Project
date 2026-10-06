import os
import re
import smtplib
from uuid import uuid4
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

import requests
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas, security, storage
from app.audit import registrar_evento_auditoria
from app.database import engine, get_db
from app.email_service import enviar_correo
from app.document_validation import (
    ALLOWED_DOCUMENT_TYPES,
    MAX_DOCUMENT_BYTES,
    document_content_matches_type,
)
from app.security import obtener_usuario_actual
from app.firm_access import require_roles
from app.site_content import PUBLIC_CONTENT_PAGES, PUBLIC_PAGE_ROUTES
from app.radicados import (
    ambito_radicado_usuario,
    iniciar_consulta_nuevo_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
    normalizar_numero_radicado,
)
from app.migrate_radicados_canonicos import migrar as migrar_radicados_canonicos
from app.migrate_radicados_canonicos import previsualizar as previsualizar_migracion_radicados
from app.rama_judicial_api import API_BASE_URL
from app.whatsapp import enviar_mensaje_whatsapp
from app.integration_settings import encrypt_secret, get_integration_settings
from app.workflow_service import (
    workflow_401_reason,
    workflow_frontend_url,
    workflow_service_headers,
)
import json


router = APIRouter(
    prefix="/api/admin",
    tags=["Administración"],
)


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
        return db.query(models.DocumentoProceso).join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id).join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id).filter(models.Usuario.rol.in_(roles))
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


# ============================================================
# SEGURIDAD ADMINISTRATIVA
# ============================================================

def verificar_admin(
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    require_roles(usuario_actual, ["ADMIN"], action="acceder al panel administrativo")
    return usuario_actual


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
        raise HTTPException(status_code=404, detail="PÃ¡gina pÃºblica no disponible para ediciÃ³n.")
    if not isinstance(datos.contenido, dict):
        raise HTTPException(status_code=400, detail="El contenido debe ser un objeto.")
    route = datos.contenido.get("route")
    if not isinstance(route, str) or not re.fullmatch(r"/(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*|/", route):
        raise HTTPException(status_code=400, detail="La ruta debe comenzar con / y usar minÃºsculas, nÃºmeros y guiones.")
    if route != "/" and any(route == reserved or route.startswith(f"{reserved}/") for reserved in ("/api", "/gestion-procesos", "/_next", "/robots.txt", "/sitemap.xml", "/favicon.ico")):
        raise HTTPException(status_code=400, detail="La ruta elegida estÃ¡ reservada para el sistema.")
    for other_slug in PUBLIC_CONTENT_PAGES:
        if other_slug == slug:
            continue
        other_page = db.query(models.ContenidoPagina).filter_by(slug=other_slug).first()
        other_content = other_page.contenido if other_page else None
        other_route = other_content.get("route", PUBLIC_PAGE_ROUTES[other_slug]) if isinstance(other_content, dict) else PUBLIC_PAGE_ROUTES[other_slug]
        if route == other_route or route == PUBLIC_PAGE_ROUTES[other_slug]:
            raise HTTPException(status_code=409, detail="Esa ruta ya estÃ¡ asignada a otra pÃ¡gina.")
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


# ============================================================
# DASHBOARD
# ============================================================

def _dashboard_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _dashboard_activity_description(action: str, resource_type: str) -> tuple[str, str]:
    resource = {
        "usuario": "un usuario",
        "solicitud_registro": "una solicitud de registro",
        "proceso": "un proceso",
        "proceso_cliente": "un cliente del proceso",
        "proceso_radicado": "un radicado del proceso",
        "radicado": "un radicado",
        "tarea": "una tarea",
        "documento_proceso": "un documento",
        "solicitud_documento": "una solicitud de documento",
        "pagina_publica": "una página pública",
        "plan": "un plan",
    }.get(resource_type.lower(), "un registro")
    known_actions = {
        "admin.usuario.crear": "creó un usuario",
        "abogado.crear": "creó un abogado",
        "cliente.crear": "creó un cliente",
        "admin.solicitud.aprobar": "aprobó una solicitud de registro",
        "admin.solicitud.rechazar": "rechazó una solicitud de registro",
        "proceso.crear": "creó un proceso",
        "proceso.actualizar": "actualizó un proceso",
        "proceso.archivar": "archivó un proceso",
        "proceso.restaurar": "restauró un proceso",
        "documento.cargar": "cargó un documento",
        "documento.solicitar": "solicitó un documento",
        "tarea.crear": "creó una tarea",
        "tarea.actualizar": "actualizó una tarea",
        "tarea.completar": "completó una tarea",
        "radicado.crear": "agregó un radicado",
        "radicado.vincular": "vinculó un radicado",
    }
    description = known_actions.get(action)
    if description is None:
        if "radicado" in action and any(word in action for word in ("consulta", "consultar")):
            description = "consultó un radicado"
        elif action.endswith(".aprobar"):
            description = f"aprobó {resource}"
        elif action.endswith(".rechazar"):
            description = f"rechazó {resource}"
        elif action.endswith(".actualizar"):
            description = f"actualizó {resource}"
        elif action.endswith(".crear") or action.endswith(".cargar"):
            description = f"registró {resource}"
        elif action.endswith(".eliminar") or action.endswith(".retirar"):
            description = f"retiró {resource}"
        elif action.endswith(".enviar"):
            description = f"envió {resource}"
        else:
            description = f"realizó una acción sobre {resource}"
    return description, resource.capitalize()


def _dashboard_activity_href(resource_type: str, resource_id: str | None) -> str:
    resource = resource_type.lower()
    if resource == "usuario" and resource_id and resource_id.isdigit():
        return f"/gestion-procesos/admin/usuarios/{resource_id}"
    if resource in {"solicitud_registro"}:
        return "/gestion-procesos/admin/solicitudes"
    if resource in {"proceso", "proceso_cliente", "proceso_radicado"}:
        return "/gestion-procesos/admin/procesos"
    if resource in {"radicado"}:
        return "/gestion-procesos/admin/radicados"
    if resource in {"tarea", "subtarea", "recordatorio_tarea"}:
        return "/gestion-procesos/admin/tareas"
    if resource in {"documento_proceso", "solicitud_documento"}:
        return "/gestion-procesos/admin/documentos"
    if resource == "pagina_publica":
        return "/gestion-procesos/admin/contenido"
    if resource == "plan":
        return "/gestion-procesos/admin/planes"
    return "/gestion-procesos/admin/auditoria"

@router.get("/dashboard")
def obtener_dashboard_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    roles_firma = (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN)
    estados_tarea_activa = (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)

    cuentas = db.query(models.Usuario).filter(models.Usuario.rol != models.RolUsuario.ADMIN)
    usuarios_activos = cuentas.filter(models.Usuario.estado == models.EstadoUsuario.ACTIVO).count()
    usuarios_pendientes = cuentas.filter(models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION).count()
    usuarios_rechazados = cuentas.filter(models.Usuario.estado == models.EstadoUsuario.RECHAZADO).count()
    solicitudes_registro = db.query(models.SolicitudRegistro).count()
    solicitudes_perfil = db.query(models.SolicitudEdicionPerfilCliente).filter(
        models.SolicitudEdicionPerfilCliente.estado == "PENDIENTE"
    ).count()

    procesos_activos_firma = (
        db.query(models.Proceso)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Proceso.archivado_en.is_(None))
    )
    procesos_activos_saas = (
        db.query(models.Proceso)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol == models.RolUsuario.ABOGADO, models.Proceso.archivado_en.is_(None))
    )
    procesos_firma_count = procesos_activos_firma.count()
    procesos_saas_count = procesos_activos_saas.count()

    tareas_activas = (
        db.query(models.Tarea)
        .filter(models.Tarea.estado.in_(estados_tarea_activa))
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
    )
    tareas_pendientes = tareas_activas.count()
    tareas_firma = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Tarea.estado.in_(estados_tarea_activa))
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
    )
    tareas_vencidas = tareas_firma.filter(models.Tarea.fecha_limite < ahora).count()

    documentos_pendientes = (
        db.query(models.SolicitudDocumento)
        .join(models.Proceso, models.Proceso.id == models.SolicitudDocumento.proceso_id)
        .filter(models.SolicitudDocumento.atendida_en.is_(None), models.Proceso.archivado_en.is_(None))
        .count()
    )
    errores_consulta = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado == "ERROR").count()
    notificaciones_criticas = db.query(models.EntregaNotificacion).filter(
        models.EntregaNotificacion.estado == "ERROR",
        models.EntregaNotificacion.intentos >= 3,
    ).count()
    errores_operativos = errores_consulta + notificaciones_criticas
    total_alertas = (
        solicitudes_registro
        + solicitudes_perfil
        + tareas_vencidas
        + documentos_pendientes
        + errores_operativos
    )

    radicados_firma = _filtrar_radicados_por_sector(db.query(models.Radicado), "FIRMA").count()
    radicados_saas = _filtrar_radicados_por_sector(db.query(models.Radicado), "SAAS").count()
    tareas_firma_count = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(models.Usuario.rol.in_(roles_firma))
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
        .count()
    )
    tareas_saas_count = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(models.Usuario.rol == models.RolUsuario.ABOGADO)
        .filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
        .count()
    )
    documentos_firma = (
        db.query(models.DocumentoProceso)
        .join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Proceso.archivado_en.is_(None))
        .count()
    )

    proceso_ids = [row[0] for row in (
        db.query(models.Proceso.id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(models.Usuario.rol.in_(roles_firma), models.Proceso.archivado_en.is_(None))
        .order_by(models.Proceso.created_at.desc(), models.Proceso.id.desc())
        .all()
    )]
    procesos_riesgo_query = (
        db.query(models.Tarea.proceso_id)
        .join(models.Proceso, models.Proceso.id == models.Tarea.proceso_id)
        .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
        .filter(
            models.Usuario.rol.in_(roles_firma),
            models.Proceso.archivado_en.is_(None),
            models.Tarea.estado.in_(estados_tarea_activa),
            or_(models.Tarea.fecha_limite < ahora, models.Tarea.prioridad == models.PrioridadTarea.URGENTE),
        )
        .distinct()
    )
    procesos_riesgo_count = procesos_riesgo_query.count()

    procesos = []
    if proceso_ids:
        process_rows = (
            db.query(
                models.Proceso.id,
                models.Proceso.nombre,
                models.Proceso.created_at,
                models.Usuario.nombre_completo,
            )
            .join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id)
            .filter(models.Proceso.id.in_(proceso_ids))
            .all()
        )
        task_rows = db.query(
            models.Tarea.proceso_id,
            models.Tarea.id,
            models.Tarea.titulo,
            models.Tarea.estado,
            models.Tarea.prioridad,
            models.Tarea.fecha_limite,
            models.Tarea.updated_at,
        ).filter(models.Tarea.proceso_id.in_(proceso_ids)).all()
        tasks_by_process: dict[int, list] = {}
        for row in task_rows:
            tasks_by_process.setdefault(row.proceso_id, []).append(row)
        clients_by_process: dict[int, list[str]] = {}
        for process_id, client_name in db.query(
            models.ProcesoCliente.proceso_id, models.Usuario.nombre_completo
        ).join(models.Usuario, models.Usuario.id == models.ProcesoCliente.cliente_id).filter(
            models.ProcesoCliente.proceso_id.in_(proceso_ids)
        ).order_by(models.ProcesoCliente.proceso_id, models.Usuario.nombre_completo).all():
            clients_by_process.setdefault(process_id, []).append(client_name)
        docs_by_process = dict(db.query(
            models.DocumentoProceso.proceso_id,
            func.max(models.DocumentoProceso.created_at),
        ).filter(models.DocumentoProceso.proceso_id.in_(proceso_ids)).group_by(models.DocumentoProceso.proceso_id).all())

        for process_id, name, created_at, lawyer_name in process_rows:
            all_tasks = tasks_by_process.get(process_id, [])
            open_tasks = [task for task in all_tasks if task.estado in estados_tarea_activa]
            overdue = [task for task in open_tasks if task.fecha_limite and task.fecha_limite < ahora]
            urgent = [task for task in open_tasks if task.prioridad == models.PrioridadTarea.URGENTE]
            open_tasks.sort(key=lambda task: (task.fecha_limite is None, task.fecha_limite or datetime.max, task.id))
            activity_dates = [created_at]
            activity_dates.extend(task.updated_at for task in all_tasks if task.updated_at)
            if docs_by_process.get(process_id):
                activity_dates.append(docs_by_process[process_id])
            client_names = clients_by_process.get(process_id, [])
            risk_label = "Tarea vencida" if overdue else "Tarea urgente" if urgent else None
            procesos.append({
                "id": process_id,
                "nombre": name,
                "cliente": client_names[0] if client_names else None,
                "clientes": len(client_names),
                "responsable": lawyer_name,
                "estado": "ACTIVO",
                "ultima_actividad": _dashboard_iso(max(activity_dates) if activity_dates else None),
                "riesgo": risk_label,
                "proxima_accion": open_tasks[0].titulo if open_tasks else None,
                "vencido": bool(overdue),
                "en_atencion": bool(open_tasks),
                "sin_actividad": not all_tasks and not docs_by_process.get(process_id),
            })
        procesos.sort(key=lambda item: (
            item["riesgo"] is None,
            not item["en_atencion"],
            item["ultima_actividad"] or "",
        ))

    eventos = (
        db.query(models.EventoAuditoria, models.Usuario.nombre_completo)
        .outerjoin(models.Usuario, models.Usuario.id == models.EventoAuditoria.actor_id)
        .order_by(models.EventoAuditoria.created_at.desc(), models.EventoAuditoria.id.desc())
        .limit(12)
        .all()
    )
    actividad = []
    for event, actor_name in eventos:
        description, resource_label = _dashboard_activity_description(event.accion, event.tipo_recurso)
        actividad.append({
            "id": f"audit-{event.id}",
            "actor": actor_name or "Sistema",
            "descripcion": description,
            "recurso": resource_label,
            "fecha": _dashboard_iso(event.created_at),
            "href": _dashboard_activity_href(event.tipo_recurso, event.recurso_id),
            "tipo": "normal",
        })
    consultas_recientes = (
        db.query(models.ConsultaRadicado)
        .filter(models.ConsultaRadicado.estado.in_(("COMPLETADA", "ERROR")))
        .order_by(models.ConsultaRadicado.finalizacion.desc(), models.ConsultaRadicado.inicio.desc())
        .limit(8)
        .all()
    )
    for consulta in consultas_recientes:
        fecha = consulta.finalizacion or consulta.inicio
        numero = consulta.radicado.numero if consulta.radicado else "radicado"
        actividad.append({
            "id": f"consulta-{consulta.id}",
            "actor": "Sistema",
            "descripcion": "detectó un error en una consulta judicial" if consulta.estado == "ERROR" else "completó una consulta judicial",
            "recurso": f"Radicado {numero}",
            "fecha": _dashboard_iso(fecha),
            "href": "/gestion-procesos/admin/operacion",
            "tipo": "error" if consulta.estado == "ERROR" else "normal",
        })
    actividad.sort(key=lambda item: item["fecha"] or "", reverse=True)

    atencion = [
        {"key": "registro", "label": "Solicitudes de registro", "count": solicitudes_registro, "href": "/gestion-procesos/admin/solicitudes", "tone": "warning"},
        {"key": "aprobacion", "label": "Usuarios pendientes de aprobación", "count": usuarios_pendientes, "href": "/gestion-procesos/admin/usuarios", "tone": "warning"},
        {"key": "perfil", "label": "Solicitudes de perfil por revisar", "count": solicitudes_perfil, "href": "/gestion-procesos/admin/solicitudes-perfil", "tone": "warning"},
        {"key": "procesos", "label": "Procesos con tareas de riesgo", "count": procesos_riesgo_count, "href": "/gestion-procesos/admin/procesos", "tone": "danger"},
        {"key": "tareas", "label": "Tareas vencidas", "count": tareas_vencidas, "href": "/gestion-procesos/admin/tareas", "tone": "danger"},
        {"key": "documentos", "label": "Documentos pendientes de revisión", "count": documentos_pendientes, "href": "/gestion-procesos/admin/documentos", "tone": "warning"},
        {"key": "consultas", "label": "Consultas judiciales con error", "count": errores_consulta, "href": "/gestion-procesos/admin/operacion", "tone": "danger"},
        {"key": "notificaciones", "label": "Notificaciones críticas sin entregar", "count": notificaciones_criticas, "href": "/gestion-procesos/admin/operacion", "tone": "danger"},
    ]

    return {
        "usuarios": {
            "total": db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.ABOGADO).count(),
            "activos": usuarios_activos,
            "pendientes": db.query(models.Usuario).filter(
                models.Usuario.rol == models.RolUsuario.ABOGADO,
                models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION,
            ).count(),
            "rechazados": db.query(models.Usuario).filter(
                models.Usuario.rol == models.RolUsuario.ABOGADO,
                models.Usuario.estado == models.EstadoUsuario.RECHAZADO,
            ).count(),
        },
        "radicados": {
            "total": db.query(models.Radicado).count(),
        },
        "planes": {
            "total": db.query(models.Plan).count(),
            "activos": db.query(models.Plan).filter(models.Plan.activo.is_(True)).count(),
        },
        "resumen": {
            "usuarios_activos": usuarios_activos,
            "usuarios_pendientes_aprobacion": usuarios_pendientes,
            "solicitudes_pendientes": solicitudes_registro + solicitudes_perfil,
            "procesos_activos": procesos_firma_count + procesos_saas_count,
            "tareas_pendientes": tareas_pendientes,
            "documentos_pendientes": documentos_pendientes,
            "alertas": total_alertas,
            "errores_operativos": errores_operativos,
            "notificaciones_criticas": notificaciones_criticas,
        },
        "firma": {
            "procesos": procesos_firma_count,
            "radicados": radicados_firma,
            "tareas": tareas_firma_count,
            "documentos": documentos_firma,
        },
        "saas": {
            "abogados": db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.ABOGADO).count(),
            "procesos": procesos_saas_count,
            "radicados": radicados_saas,
            "tareas": tareas_saas_count,
        },
        "atencion": atencion,
        "actividad": actividad[:8],
        "procesos_criticos": procesos,
    }


def _alertas_admin(db: Session) -> list[dict]:
    """Construye alertas desde pendientes y errores reales ya persistidos."""
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    roles_firma = (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN)
    alertas: list[dict] = []

    def agregar(alert_id: str, tipo: str, prioridad: str, fecha, descripcion: str, recurso: str, href: str, accion: str, descartable: bool = False):
        alertas.append({
            "id": alert_id, "tipo": tipo, "prioridad": prioridad,
            "fecha": _dashboard_iso(fecha), "descripcion": descripcion,
            "recurso": recurso, "href": href, "accion_recomendada": accion,
            "estado": "ACTIVA", "descartable": descartable,
        })

    solicitudes = db.query(models.SolicitudRegistro, models.Usuario.nombre_completo).join(
        models.Usuario, models.Usuario.id == models.SolicitudRegistro.usuario_id
    ).filter(models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION).all()
    for solicitud, nombre in solicitudes:
        agregar(f"registro:{solicitud.usuario_id}", "Pendiente", "Media", solicitud.fecha_solicitud,
                f"Solicitud de registro de {nombre}", nombre, "/gestion-procesos/admin/solicitudes", "Revisar solicitud")

    perfiles = db.query(models.SolicitudEdicionPerfilCliente).filter(
        models.SolicitudEdicionPerfilCliente.estado == "PENDIENTE"
    ).all()
    for solicitud in perfiles:
        agregar(f"perfil:{solicitud.id}", "Pendiente", "Media", solicitud.solicitada_en,
                f"Solicitud de cambio de perfil de {solicitud.cliente.nombre_completo if solicitud.cliente else 'cliente'}",
                "Solicitud de perfil", "/gestion-procesos/admin/solicitudes-perfil", "Revisar solicitud")

    tasks = db.query(models.Tarea).join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id).filter(
        models.Usuario.rol.in_(roles_firma),
        models.Tarea.estado.in_((models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)),
        models.Tarea.fecha_limite.is_not(None), models.Tarea.fecha_limite < ahora,
        or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))),
    ).all()
    for tarea in tasks:
        agregar(f"tarea_vencida:{tarea.id}", "Riesgo", "Alta", tarea.fecha_limite,
                f"Tarea vencida: {tarea.titulo}", tarea.proceso.nombre if tarea.proceso else "Tarea",
                f"/gestion-procesos/admin/tareas", "Revisar tarea")

    tareas_urgentes = db.query(models.Tarea).join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id).filter(
        models.Usuario.rol.in_(roles_firma),
        models.Tarea.estado.in_((models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)),
        models.Tarea.prioridad == models.PrioridadTarea.URGENTE,
        or_(models.Tarea.fecha_limite.is_(None), models.Tarea.fecha_limite >= ahora),
        or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))),
    ).all()
    for tarea in tareas_urgentes:
        agregar(f"tarea_urgente:{tarea.id}", "Advertencia", "Media", tarea.fecha_limite or tarea.created_at,
                f"Tarea urgente pendiente: {tarea.titulo}", tarea.proceso.nombre if tarea.proceso else "Tarea",
                "/gestion-procesos/admin/tareas", "Revisar tarea")

    documentos = db.query(models.SolicitudDocumento).join(
        models.Proceso, models.Proceso.id == models.SolicitudDocumento.proceso_id
    ).filter(models.SolicitudDocumento.atendida_en.is_(None), models.Proceso.archivado_en.is_(None)).all()
    for solicitud in documentos:
        agregar(f"documento:{solicitud.id}", "Pendiente", "Media", solicitud.created_at,
                f"Documento pendiente: {solicitud.titulo}", solicitud.proceso.nombre,
                "/gestion-procesos/admin/documentos", "Revisar documento")

    consultas = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado == "ERROR").all()
    for consulta in consultas:
        numero = consulta.radicado.numero if consulta.radicado else "radicado"
        agregar(f"consulta:{consulta.id}", "Error", "Alta", consulta.finalizacion or consulta.inicio,
                f"Falló la consulta judicial del radicado {numero}", f"Radicado {numero}",
                "/gestion-procesos/admin/operacion", "Revisar consulta")

    entregas = db.query(models.EntregaNotificacion).filter(
        models.EntregaNotificacion.estado == "ERROR", models.EntregaNotificacion.intentos >= 3
    ).all()
    for entrega in entregas:
        agregar(f"notificacion:{entrega.id}", "Error", "Alta", entrega.created_at,
                f"No se pudo entregar una notificación tras {entrega.intentos} intentos",
                entrega.asunto, "/gestion-procesos/admin/operacion", "Revisar entrega")

    acciones_importantes = {
        "proceso.archivar": ("Proceso archivado", "/gestion-procesos/admin/procesos"),
        "proceso.restaurar": ("Proceso restaurado", "/gestion-procesos/admin/procesos"),
        "proceso.crear": ("Proceso creado", "/gestion-procesos/admin/procesos"),
        "admin.usuario.crear": ("Usuario creado", "/gestion-procesos/admin/usuarios"),
        "admin.contenido.restaurar": ("Contenido público restaurado", "/gestion-procesos/admin/contenido"),
    }
    eventos = db.query(models.EventoAuditoria).filter(
        models.EventoAuditoria.accion.in_(tuple(acciones_importantes))
    ).order_by(models.EventoAuditoria.id.desc()).limit(30).all()
    for evento in eventos:
        descripcion, href = acciones_importantes[evento.accion]
        agregar(f"evento:{evento.id}", "Evento", "Baja", evento.created_at,
                descripcion, f"{evento.tipo_recurso} {evento.recurso_id or ''}".strip(), href,
                "Abrir registro", descartable=True)

    disposition_events = db.query(models.EventoAuditoria).filter(
        models.EventoAuditoria.tipo_recurso == "alerta",
        models.EventoAuditoria.accion.in_(("admin.alerta.atender", "admin.alerta.descartar", "admin.alerta.eliminar")),
    ).order_by(models.EventoAuditoria.id.desc()).all()
    dispositions: dict[str, str] = {}
    for event in disposition_events:
        if event.recurso_id and event.recurso_id not in dispositions:
            dispositions[event.recurso_id] = (
                "ATENDIDA" if event.accion.endswith("atender")
                else "ELIMINADA" if event.accion.endswith("eliminar")
                else "DESCARTADA"
            )
    for alerta in alertas:
        alerta["estado"] = dispositions.get(alerta["id"], "ACTIVA")
    prioridad_orden = {"Alta": 0, "Media": 1, "Baja": 2}
    alertas.sort(key=lambda item: (
        prioridad_orden[item["prioridad"]],
        -datetime.fromisoformat(item["fecha"]).timestamp() if item["fecha"] else 0,
    ))
    return alertas


@router.get("/alertas")
def listar_alertas_admin(
    limite: int | None = Query(default=None, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    alertas = _alertas_admin(db)
    if limite is not None:
        alertas = [alerta for alerta in alertas if alerta["estado"] != "ELIMINADA"]
        alertas.sort(key=lambda item: datetime.fromisoformat(item["fecha"]).timestamp() if item["fecha"] else 0, reverse=True)
        return alertas[:limite]
    return alertas


@router.delete("/alertas")
def eliminar_todas_alertas_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    alertas = _alertas_admin(db)
    por_eliminar = [alerta for alerta in alertas if alerta["estado"] != "ELIMINADA"]
    for alerta in por_eliminar:
        registrar_evento_auditoria(db, admin, "admin.alerta.eliminar", "alerta", alerta["id"])
    db.commit()
    return {"eliminadas": len(por_eliminar)}


@router.post("/alertas/acciones")
def ejecutar_accion_masiva_alertas_admin(
    datos: schemas.AlertasAccionMasiva,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    actuales = {alerta["id"]: alerta for alerta in _alertas_admin(db)}
    ids = list(dict.fromkeys(datos.alerta_ids))
    faltantes = [alerta_id for alerta_id in ids if alerta_id not in actuales]
    if faltantes:
        raise HTTPException(status_code=409, detail="Algunas alertas ya no existen; actualiza la lista.")
    if datos.estado == "DESCARTADA" and any(not actuales[alerta_id]["descartable"] for alerta_id in ids):
        raise HTTPException(status_code=400, detail="La selección incluye alertas que deben resolverse desde su recurso.")
    accion = {
        "ATENDIDA": "admin.alerta.atender",
        "DESCARTADA": "admin.alerta.descartar",
        "ELIMINADA": "admin.alerta.eliminar",
    }[datos.estado]
    for alerta_id in ids:
        registrar_evento_auditoria(db, admin, accion, "alerta", alerta_id)
    db.commit()
    return {"actualizadas": len(ids), "estado": datos.estado}


@router.patch("/alertas/{alerta_id}/estado")
def actualizar_estado_alerta_admin(
    alerta_id: str,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    nuevo_estado = datos.get("estado")
    if nuevo_estado not in ("ATENDIDA", "DESCARTADA"):
        raise HTTPException(status_code=400, detail="Estado de alerta no válido.")
    alerta = next((item for item in _alertas_admin(db) if item["id"] == alerta_id), None)
    if alerta is None:
        raise HTTPException(status_code=404, detail="La alerta ya no está activa o no existe.")
    if nuevo_estado == "DESCARTADA" and not alerta["descartable"]:
        raise HTTPException(status_code=400, detail="Esta alerta debe resolverse desde el recurso relacionado.")
    accion = "admin.alerta.atender" if nuevo_estado == "ATENDIDA" else "admin.alerta.descartar"
    registrar_evento_auditoria(db, admin, accion, "alerta", alerta_id)
    db.commit()
    return {"id": alerta_id, "estado": nuevo_estado}


@router.get("/vision-global")
def obtener_vision_global(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    """Datos agregados para la consola de operación, sin depender de webhooks."""
    usuarios_por_rol = {
        (rol.value if hasattr(rol, "value") else str(rol)): total
        for rol, total in db.query(models.Usuario.rol, func.count(models.Usuario.id)).group_by(models.Usuario.rol).all()
    }
    tareas_por_estado = {
        (estado.value if hasattr(estado, "value") else str(estado)): total
        for estado, total in db.query(models.Tarea.estado, func.count(models.Tarea.id)).group_by(models.Tarea.estado).all()
    }
    consultas_error = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado == "ERROR").count()
    consultas_en_cola = db.query(models.ConsultaRadicado).filter(models.ConsultaRadicado.estado.in_(["ENCOLADA", "EN_PROCESO", "REINTENTANDO"])).count()
    configuracion = db.query(models.ConfiguracionSaas).filter_by(id=1).first()
    usuarios_recientes = db.query(models.Usuario).order_by(models.Usuario.created_at.desc()).limit(8).all()
    consultas_recientes = db.query(models.ConsultaRadicado).order_by(models.ConsultaRadicado.inicio.desc()).limit(8).all()
    return {
        "resumen": {
            "usuarios": db.query(models.Usuario).count(),
            "abogados_admin": usuarios_por_rol.get("ABOGADO_ADMIN", 0),
            "abogados_saas": usuarios_por_rol.get("ABOGADO", 0),
            "clientes": usuarios_por_rol.get("CLIENTE", 0),
            "procesos": db.query(models.Proceso).count(),
            "radicados": db.query(models.Radicado).count(),
            "actuaciones": db.query(models.Actuacion).count(),
            "tareas": db.query(models.Tarea).count(),
            "documentos": db.query(models.DocumentoProceso).count(),
            "solicitudes_documento_pendientes": db.query(models.SolicitudDocumento).filter(models.SolicitudDocumento.atendida_en == None).count(),
            "consultas_error": consultas_error,
            "consultas_en_cola": consultas_en_cola,
        },
        "usuarios_por_rol": usuarios_por_rol,
        "tareas_por_estado": tareas_por_estado,
        "operacion": {
            "motor_local": "Vercel Workflows",
            "webhooks_vercel": "no configurados",
            "mostrar_planes": configuracion.mostrar_planes if configuracion else False,
        },
        "usuarios_recientes": [{"id": u.id, "nombre": u.nombre_completo, "email": u.email, "rol": u.rol.value, "estado": u.estado.value, "created_at": u.created_at.isoformat() if u.created_at else None} for u in usuarios_recientes],
        "consultas_recientes": [{"id": c.id, "radicado": c.radicado.numero if c.radicado else "", "estado": c.estado, "tipo": c.tipo, "inicio": c.inicio.isoformat() if c.inicio else None, "actuaciones_nuevas": c.actuaciones_nuevas} for c in consultas_recientes],
    }


@router.get("/inventario/{recurso}")
def listar_inventario_global(
    recurso: str,
    sector: str = "GLOBAL",
    archivados: bool = False,
    limite: int = 100,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    """Read an inventory in one explicit platform, firm, or SaaS scope."""
    limite = min(max(limite, 1), 250)
    roles_por_sector = {
        "FIRMA": (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN),
        "SAAS": (models.RolUsuario.ABOGADO,),
        "GLOBAL": (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN, models.RolUsuario.ABOGADO),
    }
    if sector not in roles_por_sector:
        raise HTTPException(status_code=400, detail="Selecciona un ámbito válido: FIRMA, SAAS o GLOBAL.")
    roles = roles_por_sector[sector]
    if recurso == "procesos":
        query = db.query(models.Proceso).join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id).filter(models.Usuario.rol.in_(roles))
        query = query.filter(models.Proceso.archivado_en.is_not(None) if archivados else models.Proceso.archivado_en.is_(None))
        procesos = query.order_by(models.Proceso.created_at.desc()).limit(limite).all()
        resultado = []
        for proceso in procesos:
            actividad = []
            actividad.extend(tarea.updated_at for tarea in proceso.tareas if tarea.updated_at)
            actividad.extend(documento.created_at for documento in proceso.documentos if documento.created_at)
            actividad.extend(
                fecha
                for (fecha,) in db.query(
                    func.coalesce(models.ConsultaRadicado.finalizacion, models.ConsultaRadicado.inicio)
                ).join(models.Radicado, models.Radicado.id == models.ConsultaRadicado.radicado_id)
                .join(models.ProcesoRadicado, models.ProcesoRadicado.radicado_id == models.Radicado.id)
                .filter(models.ProcesoRadicado.proceso_id == proceso.id)
                .all()
                if fecha
            )
            actividad.extend(
                fecha
                for (fecha,) in db.query(models.EventoAuditoria.created_at).filter(
                    models.EventoAuditoria.tipo_recurso == "proceso",
                    models.EventoAuditoria.recurso_id == str(proceso.id),
                    ~models.EventoAuditoria.accion.endswith(".crear"),
                ).all()
                if fecha
            )
            tareas_activas = [
                tarea for tarea in proceso.tareas
                if tarea.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)
            ]
            tareas_vencidas = [
                tarea for tarea in tareas_activas
                if tarea.fecha_limite and tarea.fecha_limite < datetime.now(timezone.utc).replace(tzinfo=None)
            ]
            documentos_pendientes = sum(
                1 for solicitud in proceso.solicitudes_documento if solicitud.atendida_en is None
            )
            errores_consulta = db.query(models.ConsultaRadicado.id).join(
                models.Radicado, models.Radicado.id == models.ConsultaRadicado.radicado_id
            ).join(
                models.ProcesoRadicado, models.ProcesoRadicado.radicado_id == models.Radicado.id
            ).filter(
                models.ProcesoRadicado.proceso_id == proceso.id,
                models.ConsultaRadicado.estado == "ERROR",
            ).count()
            responsable_activo = bool(
                proceso.abogado and proceso.abogado.estado == models.EstadoUsuario.ACTIVO
            )
            sin_actividad = not actividad
            archived = proceso.archivado_en is not None
            if archived:
                salud = "ARCHIVADO"
            elif tareas_vencidas or errores_consulta or not responsable_activo:
                salud = "RIESGO"
            elif sin_actividad or documentos_pendientes:
                salud = "ATENCION"
            else:
                salud = "NORMAL"
            senales = []
            if sin_actividad:
                senales.append("Sin actividad")
            if tareas_vencidas:
                senales.append(f"{len(tareas_vencidas)} tarea(s) vencida(s)")
            if documentos_pendientes:
                senales.append(f"{documentos_pendientes} documento(s) pendiente(s)")
            if errores_consulta:
                senales.append(f"{errores_consulta} consulta(s) con error")
            if not responsable_activo:
                senales.append("Sin responsable activo")
            resultado.append({
                "id": proceso.id,
                "owner_id": proceso.abogado_id,
                "owner_rol": proceso.abogado.rol.value,
                "nombre": proceso.nombre,
                "descripcion": proceso.descripcion,
                "archivado_en": proceso.archivado_en,
                "abogado": proceso.abogado.nombre_completo,
                "radicados": len(proceso.radicados),
                "clientes": len(proceso.clientes),
                "cliente": proceso.clientes[0].cliente.nombre_completo if proceso.clientes else None,
                "ultima_actividad": max(actividad).isoformat() if actividad else None,
                "salud": salud,
                "senales_salud": senales,
                "tareas_vencidas": len(tareas_vencidas),
                "documentos_pendientes": documentos_pendientes,
                "consultas_con_error": errores_consulta,
                "sin_responsable": not responsable_activo,
                "sin_actividad": sin_actividad,
                "created_at": proceso.created_at,
            })
        return resultado
    if recurso == "radicados":
        query = _filtrar_radicados_por_sector(db.query(models.Radicado), sector)
        return [{"id": r.id, "owner_id": r.creado_por_id, "numero": r.numero, "abogado": r.creador.nombre_completo, "estado_consulta": r.estado_consulta, "actuaciones": len(r.actuaciones), "consultado_en": r.consultado_en} for r in query.order_by(models.Radicado.created_at.desc()).limit(limite).all()]
    if recurso == "tareas":
        query = db.query(models.Tarea).join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id).filter(models.Usuario.rol.in_(roles))
        query = query.filter(or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso.has(models.Proceso.archivado_en.is_(None))))
        return [{"id": t.id, "owner_id": t.usuario_id, "titulo": t.titulo, "descripcion": t.descripcion, "estado": t.estado.value, "prioridad": t.prioridad.value, "abogado": t.usuario.nombre_completo, "cliente": t.cliente_asignado.nombre_completo if t.cliente_asignado else None, "cliente_id": t.cliente_id, "proceso": t.proceso.nombre if t.proceso else None, "proceso_id": t.proceso_id, "radicado_id": t.radicado_id, "fecha_limite": t.fecha_limite} for t in query.order_by(models.Tarea.created_at.desc()).limit(limite).all()]
    if recurso == "documentos":
        query = db.query(models.DocumentoProceso).join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id).join(models.Usuario, models.Usuario.id == models.Proceso.abogado_id).filter(models.Usuario.rol.in_(roles))
        query = query.filter(models.Proceso.archivado_en.is_(None))
        return [{"id": d.id, "owner_id": d.proceso.abogado_id, "nombre_archivo": d.nombre_archivo, "mime_type": d.mime_type, "proceso": d.proceso.nombre, "proceso_id": d.proceso_id, "cliente": d.cliente.nombre_completo, "cliente_id": d.cliente_id, "solicitud_id": d.solicitud_id, "created_at": d.created_at} for d in query.order_by(models.DocumentoProceso.created_at.desc()).limit(limite).all()]
    raise HTTPException(status_code=404, detail="Inventario no disponible.")


@router.post("/inventario/{recurso}", status_code=status.HTTP_201_CREATED)
def crear_recurso_admin(
    recurso: str,
    datos: schemas.AdminResourceCreate,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    owner = _owner_admin(db, datos.owner_id, sector)
    radicado_vinculado_previamente = False
    if recurso == "procesos":
        if not datos.nombre or not datos.nombre.strip():
            raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
        item = models.Proceso(abogado_id=owner.id, nombre=datos.nombre.strip(), descripcion=datos.descripcion)
        action = "crear_proceso"
    elif recurso == "radicados":
        radicado_vinculado_previamente = radicado_vinculado_a_usuario(
            db,
            owner,
            datos.numero or "",
        )
        try:
            item, created = obtener_o_vincular_radicado(db, owner, datos.numero or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        action = "crear_radicado" if created else "vincular_radicado"
    elif recurso == "tareas":
        title = (datos.titulo or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="El título de la tarea es obligatorio.")
        process = None
        if datos.proceso_id is not None:
            process = db.query(models.Proceso).filter(
                models.Proceso.id == datos.proceso_id,
                models.Proceso.abogado_id == owner.id,
                models.Proceso.archivado_en.is_(None),
            ).first()
            if not process:
                raise HTTPException(status_code=400, detail="El proceso no pertenece al responsable seleccionado.")
        radicado = None
        if datos.radicado_id is not None:
            radicado = db.query(models.Radicado).filter(
                models.Radicado.id == datos.radicado_id,
                models.Radicado.ambito_key == ambito_radicado_usuario(owner),
            ).first()
            if not radicado:
                raise HTTPException(status_code=400, detail="El radicado no pertenece al responsable seleccionado.")
        if process and radicado and not db.query(models.ProcesoRadicado).filter_by(
            proceso_id=process.id, radicado_id=radicado.id
        ).first():
            raise HTTPException(status_code=400, detail="El radicado no está asociado al proceso.")
        if datos.cliente_id is not None:
            client = db.query(models.Usuario).filter(
                models.Usuario.id == datos.cliente_id,
                models.Usuario.rol == models.RolUsuario.CLIENTE,
            ).first()
            assigned = process and db.query(models.ProcesoCliente).filter_by(
                proceso_id=process.id, cliente_id=datos.cliente_id
            ).first()
            if not client or (client.creado_por_abogado_id != owner.id and not assigned):
                raise HTTPException(status_code=400, detail="El cliente no pertenece al responsable ni está asignado al proceso.")
        item = models.Tarea(
            usuario_id=owner.id,
            titulo=title,
            descripcion=datos.descripcion,
            estado=datos.estado or models.EstadoTarea.PENDIENTE,
            prioridad=datos.prioridad or models.PrioridadTarea.MEDIA,
            fecha_limite=datos.fecha_limite,
            proceso_id=process.id if process else None,
            radicado_id=radicado.id if radicado else None,
            actuacion_id=datos.actuacion_id,
            cliente_id=datos.cliente_id,
        )
        action = "crear_tarea"
    else:
        raise HTTPException(status_code=405, detail="La creación de documentos requiere una carga autenticada.")

    db.add(item)
    db.flush()
    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.{action}", recurso, item.id)
    db.commit()
    db.refresh(item)
    mensaje = "Registro creado."
    consulta_id = None
    if recurso == "radicados" and (created or not radicado_vinculado_previamente):
        mensaje, consulta_id = iniciar_consulta_nuevo_radicado(db, owner, item)
    return {
        "id": item.id,
        "mensaje": mensaje,
        "sector": sector.upper(),
        "consulta_id": consulta_id,
    }


@router.post("/inventario/documentos/cargar", status_code=status.HTTP_201_CREATED)
def cargar_documento_admin(
    sector: str = Form(...),
    owner_id: int = Form(...),
    proceso_id: int = Form(...),
    cliente_id: int = Form(...),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    owner = _owner_admin(db, owner_id, sector)
    process = db.query(models.Proceso).filter(
        models.Proceso.id == proceso_id,
        models.Proceso.abogado_id == owner.id,
        models.Proceso.archivado_en.is_(None),
    ).first()
    if not process:
        raise HTTPException(status_code=400, detail="El proceso no pertenece al responsable seleccionado.")
    client = db.query(models.Usuario).filter(
        models.Usuario.id == cliente_id,
        models.Usuario.rol == models.RolUsuario.CLIENTE,
    ).first()
    assigned = db.query(models.ProcesoCliente).filter_by(
        proceso_id=process.id,
        cliente_id=cliente_id,
    ).first()
    if not client or (client.creado_por_abogado_id != owner.id and not assigned):
        raise HTTPException(status_code=400, detail="El cliente no pertenece al responsable ni está asignado al proceso.")
    if archivo.content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de documento no permitido.")
    content = archivo.file.read(MAX_DOCUMENT_BYTES + 1)
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="El archivo debe pesar máximo 15 MB.")
    if not document_content_matches_type(archivo.content_type, content):
        raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo.")

    filename = os.path.basename(archivo.filename or "documento").strip()[:255] or "documento"
    extension = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    }[archivo.content_type]
    key = f"procesos/{process.id}/clientes/{client.id}/{uuid4().hex}{extension}"
    solicitud = models.SolicitudDocumento(
        proceso_id=process.id,
        cliente_id=client.id,
        titulo=f"Carga administrativa: {filename}"[:255],
        instrucciones="Documento asociado por administración.",
        atendida_en=datetime.utcnow(),
    )
    db.add(solicitud)
    db.flush()
    try:
        storage.get_r2_client().put_object(
            Bucket=storage.get_r2_bucket(),
            Key=key,
            Body=content,
            ContentType=archivo.content_type,
        )
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="No fue posible guardar el documento.") from exc
    document = models.DocumentoProceso(
        proceso_id=process.id,
        cliente_id=client.id,
        solicitud_id=solicitud.id,
        nombre_archivo=filename,
        ruta_archivo=key,
        mime_type=archivo.content_type,
    )
    db.add(document)
    db.flush()
    registrar_evento_auditoria(
        db,
        admin,
        f"admin.inventario.{sector.lower()}.crear_documento",
        "documento",
        document.id,
    )
    db.commit()
    db.refresh(document)
    return {"id": document.id, "mensaje": "Documento cargado.", "sector": sector.upper()}


@router.patch("/inventario/{recurso}/{item_id}")
def actualizar_recurso_admin(
    recurso: str,
    item_id: int,
    datos: schemas.AdminResourceUpdate,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    item = _recurso_admin_por_id(db, recurso, item_id, sector)
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado en el ámbito seleccionado.")
    values = datos.model_dump(exclude_unset=True)
    if recurso == "procesos":
        if "owner_id" in values:
            owner = _owner_admin(db, values["owner_id"], sector)
            if owner.rol != item.abogado.rol:
                raise HTTPException(status_code=400, detail="La reasignación debe conservar el sector y tipo de responsable del proceso.")
            item.abogado_id = owner.id
            db.query(models.ProcesoColaborador).filter_by(
                proceso_id=item.id, abogado_id=owner.id
            ).delete(synchronize_session=False)
        if "nombre" in values:
            if not values["nombre"] or not values["nombre"].strip():
                raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
            item.nombre = values["nombre"].strip()
        if "descripcion" in values:
            item.descripcion = values["descripcion"]
    elif recurso == "radicados":
        if "numero" in values:
            numero = normalizar_numero_radicado(values["numero"] or "")
            if len(numero) != 23:
                raise HTTPException(status_code=400, detail="El radicado debe tener exactamente 23 dígitos.")
            duplicate = db.query(models.Radicado).filter(
                models.Radicado.fuente == item.fuente,
                models.Radicado.ambito_key == item.ambito_key,
                models.Radicado.numero_normalizado == numero,
                models.Radicado.id != item.id,
            ).first()
            if duplicate:
                raise HTTPException(status_code=409, detail="Ya existe una ficha de este radicado en el ámbito seleccionado; vincula esa ficha en lugar de duplicarla.")
            item.numero = numero
            item.numero_normalizado = numero
    elif recurso == "tareas":
        if "titulo" in values:
            if not values["titulo"] or not values["titulo"].strip():
                raise HTTPException(status_code=400, detail="El título de la tarea es obligatorio.")
            item.titulo = values["titulo"].strip()
        if "descripcion" in values: item.descripcion = values["descripcion"]
        if "estado" in values: item.estado = values["estado"]
        if "prioridad" in values: item.prioridad = values["prioridad"]
        if "fecha_limite" in values: item.fecha_limite = values["fecha_limite"]
    elif recurso == "documentos":
        if "nombre_archivo" in values:
            if not values["nombre_archivo"] or not values["nombre_archivo"].strip():
                raise HTTPException(status_code=400, detail="El nombre del archivo es obligatorio.")
            item.nombre_archivo = values["nombre_archivo"].strip()
    else:
        raise HTTPException(status_code=404, detail="Recurso no disponible.")

    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.actualizar", recurso, item.id)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "mensaje": "Registro actualizado.", "sector": sector.upper()}


@router.post("/inventario/documentos/{item_id}/url-temporal")
def emitir_url_temporal_documento_admin(
    item_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    documento = _recurso_admin_por_id(db, "documentos", item_id, sector)
    if not documento:
        raise HTTPException(
            status_code=404,
            detail="Documento no encontrado en el ámbito seleccionado.",
        )
    expires_in = 15 * 60
    client = storage.get_r2_client()
    bucket = storage.get_r2_bucket()
    try:
        client.head_object(Bucket=bucket, Key=documento.ruta_archivo)
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": documento.ruta_archivo},
            ExpiresIn=expires_in,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "NotFound", "404"}:
            raise HTTPException(status_code=404, detail="El archivo ya no existe en R2.") from exc
        raise HTTPException(status_code=502, detail="No fue posible generar el enlace temporal.") from exc
    except (BotoCoreError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible generar el enlace temporal.") from exc

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    registrar_evento_auditoria(
        db,
        admin,
        f"admin.inventario.{sector.lower()}.emitir_url_temporal",
        "documento",
        documento.id,
    )
    db.commit()
    return {
        "url": url,
        "expires_at": expires_at.isoformat(),
        "expires_in": expires_in,
        "nombre_archivo": documento.nombre_archivo,
    }


@router.delete("/inventario/{recurso}/{item_id}")
def eliminar_recurso_admin(
    recurso: str,
    item_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    item = _recurso_admin_por_id(db, recurso, item_id, sector)
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado en el ámbito seleccionado.")
    if recurso == "procesos":
        if item.archivado_en is not None:
            raise HTTPException(status_code=409, detail="El proceso ya está archivado.")
        item.archivado_en = datetime.now(timezone.utc)
        action = "archivar"
    elif recurso == "radicados":
        db.delete(item)
        action = "eliminar"
    elif recurso == "tareas":
        db.delete(item)
        action = "eliminar"
    elif recurso == "documentos":
        try:
            storage.get_r2_client().delete_object(Bucket=storage.get_r2_bucket(), Key=item.ruta_archivo)
        except (BotoCoreError, ClientError, RuntimeError) as exc:
            raise HTTPException(status_code=502, detail="No fue posible eliminar el archivo de almacenamiento.") from exc
        db.delete(item)
        action = "eliminar"
    else:
        raise HTTPException(status_code=404, detail="Recurso no disponible.")

    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.{action}", recurso, item_id)
    db.commit()
    return {"mensaje": "Proceso archivado." if recurso == "procesos" else "Registro eliminado."}


@router.patch("/inventario/procesos/{item_id}/restaurar")
def restaurar_proceso_admin(
    item_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    proceso = _recurso_admin_por_id(db, "procesos", item_id, sector)
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado en el ámbito seleccionado.")
    if proceso.archivado_en is None:
        raise HTTPException(status_code=409, detail="El proceso ya está activo.")
    proceso.archivado_en = None
    registrar_evento_auditoria(db, admin, f"admin.inventario.{sector.lower()}.restaurar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Proceso restaurado."}


@router.post("/radicados/consultar")
def consultar_todos_radicados_admin(
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    raise HTTPException(
        status_code=410,
        detail="Este endpoint legacy fue deshabilitado. Usa el launcher ADMIN de Workflows.",
    )


@router.post("/radicados/{radicado_id}/consultar")
def consultar_radicado_admin(
    radicado_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    raise HTTPException(
        status_code=410,
        detail="Este endpoint legacy fue deshabilitado. Usa el launcher ADMIN de Workflows.",
    )


def _serializar_configuracion_consultas(configuracion: models.ConfiguracionConsultas) -> dict:
    dias = sorted(set(configuracion.dias_habilitados or []))
    proxima = None
    if configuracion.activa and dias:
        zona_colombia = ZoneInfo("America/Bogota")
        ahora = datetime.now(zona_colombia)
        for desplazamiento in range(8):
            fecha = (ahora + timedelta(days=desplazamiento)).date()
            if fecha.weekday() not in dias:
                continue
            for hora in (12, 17):
                candidata = datetime(
                    fecha.year,
                    fecha.month,
                    fecha.day,
                    hora,
                    tzinfo=zona_colombia,
                )
                if candidata > ahora:
                    proxima = candidata
                    break
            if proxima:
                break
    return {
        "activa": configuracion.activa,
        "dias_habilitados": dias,
        "horas_colombia": ["12:00", "17:00"],
        "proxima_ejecucion": proxima,
        "updated_at": configuracion.updated_at,
    }


@router.get("/consultas/configuracion", response_model=schemas.ConfiguracionConsultasOut)
def obtener_configuracion_consultas(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).first()
    if configuracion is None:
        configuracion = models.ConfiguracionConsultas(id=1)
        db.add(configuracion)
        db.commit()
        db.refresh(configuracion)
    return _serializar_configuracion_consultas(configuracion)


@router.get("/consultas/radicados")
def buscar_radicados_consulta_manual(
    q: str = "",
    limite: int = 25,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    query = db.query(models.Radicado)
    texto = q.strip()
    if texto:
        query = query.filter(models.Radicado.numero.ilike(f"%{texto}%"))
    radicados = (
        query.order_by(models.Radicado.created_at.desc(), models.Radicado.id.desc())
        .limit(min(max(limite, 1), 100))
        .all()
    )
    return [
        {"id": radicado.id, "numero": radicado.numero, "ambito": radicado.ambito_key}
        for radicado in radicados
    ]


@router.put("/consultas/configuracion", response_model=schemas.ConfiguracionConsultasOut)
def actualizar_configuracion_consultas(
    datos: schemas.ConfiguracionConsultasUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    dias = sorted(set(datos.dias_habilitados))
    if any(dia < 0 or dia > 6 for dia in dias):
        raise HTTPException(status_code=400, detail="Los días deben estar entre 0 (lunes) y 6 (domingo).")
    configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).with_for_update().first()
    if configuracion is None:
        configuracion = models.ConfiguracionConsultas(id=1)
        db.add(configuracion)
    configuracion.activa = datos.activa
    configuracion.dias_habilitados = dias
    configuracion.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.consultas.configuracion.actualizar", "configuracion_consultas", 1)
    db.commit()
    db.refresh(configuracion)
    return _serializar_configuracion_consultas(configuracion)


@router.get("/consultas/ejecuciones")
def listar_ejecuciones_consultas(
    limite: int = 20,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    limite = min(max(limite, 1), 100)
    ejecuciones = (
        db.query(models.EjecucionBarrido)
        .order_by(models.EjecucionBarrido.inicio.desc())
        .limit(limite)
        .all()
    )
    return [
        {
            "id": ejecucion.id,
            "tipo": ejecucion.tipo,
            "estado": ejecucion.estado,
            "inicio": ejecucion.inicio,
            "finalizacion": ejecucion.finalizacion,
            "total_radicados": ejecucion.total_radicados,
            "procesados": ejecucion.procesados,
            "errores": ejecucion.errores,
            "actuaciones_nuevas": ejecucion.actuaciones_nuevas,
        }
        for ejecucion in ejecuciones
    ]


@router.get("/agenda/tareas")
def obtener_agenda_tareas_firma(
    mes: str | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    abogado_id: int | None = None,
    estado: str | None = None,
    limite: int = 500,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    zona = ZoneInfo("America/Bogota")
    if mes:
        try:
            inicio_local = datetime.strptime(mes, "%Y-%m").date().replace(day=1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="mes debe tener formato YYYY-MM.") from exc
        if inicio_local.month == 12:
            fin_local = inicio_local.replace(year=inicio_local.year + 1, month=1)
        else:
            fin_local = inicio_local.replace(month=inicio_local.month + 1)
    elif fecha_desde and fecha_hasta:
        try:
            inicio_local = datetime.fromisoformat(fecha_desde).date()
            fin_local = datetime.fromisoformat(fecha_hasta).date() + timedelta(days=1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Usa fechas ISO YYYY-MM-DD.") from exc
    elif fecha_desde or fecha_hasta:
        raise HTTPException(status_code=400, detail="Indica ambas fechas del rango.")
    else:
        hoy_local = datetime.now(zona).date()
        inicio_local = hoy_local.replace(day=1)
        fin_local = inicio_local.replace(year=inicio_local.year + 1, month=1) if inicio_local.month == 12 else inicio_local.replace(month=inicio_local.month + 1)

    if fin_local <= inicio_local:
        raise HTTPException(status_code=400, detail="El rango de fechas no es válido.")
    inicio_utc = datetime.combine(inicio_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)
    fin_utc = datetime.combine(fin_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)

    query = (
        db.query(models.Tarea)
        .join(models.Usuario, models.Usuario.id == models.Tarea.usuario_id)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
            models.Tarea.fecha_limite >= inicio_utc,
            models.Tarea.fecha_limite < fin_utc,
            or_(
                models.Tarea.proceso_id.is_(None),
                models.Tarea.proceso.has(and_(
                    models.Proceso.archivado_en.is_(None),
                    models.Proceso.abogado.has(models.Usuario.rol.in_((
                        models.RolUsuario.ABOGADO_ADMIN,
                        models.RolUsuario.ADMIN,
                    ))),
                )),
            ),
            or_(
                models.Tarea.radicado_id.is_(None),
                models.Tarea.radicado.has(models.Radicado.ambito_key == "FIRMA"),
            ),
        )
    )
    if abogado_id is not None:
        query = query.filter(models.Tarea.usuario_id == abogado_id)
    if estado:
        try:
            estado_tarea = models.EstadoTarea(estado.upper())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Estado de tarea no válido.") from exc
        query = query.filter(models.Tarea.estado == estado_tarea)

    tareas = query.order_by(models.Tarea.fecha_limite.asc(), models.Tarea.id.asc()).limit(min(max(limite, 1), 1000)).all()
    responsables = (
        db.query(models.Usuario.id, models.Usuario.nombre_completo)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
            models.Usuario.estado == models.EstadoUsuario.ACTIVO,
        )
        .order_by(models.Usuario.nombre_completo.asc())
        .all()
    )
    return {
        "tareas": [
            {
                "id": tarea.id,
                "titulo": tarea.titulo,
                "descripcion": tarea.descripcion,
                "estado": tarea.estado.value,
                "prioridad": tarea.prioridad.value,
                "fecha_limite": tarea.fecha_limite,
                "responsable_id": tarea.usuario_id,
                "responsable": tarea.usuario.nombre_completo,
                "cliente_id": tarea.cliente_id,
                "cliente": (
                    tarea.cliente_asignado.nombre_completo
                    if tarea.cliente_asignado
                    and tarea.proceso
                    and tarea.cliente_asignado.rol == models.RolUsuario.CLIENTE
                    and any(link.cliente_id == tarea.cliente_id for link in tarea.proceso.clientes)
                    else None
                ),
                "proceso_id": tarea.proceso_id,
                "proceso": tarea.proceso.nombre if tarea.proceso else None,
                "radicado_id": tarea.radicado_id,
                "radicado": tarea.radicado.numero if tarea.radicado else None,
            }
            for tarea in tareas
        ],
        "responsables": [{"id": responsable.id, "nombre": responsable.nombre_completo} for responsable in responsables],
    }


@router.get("/consultas/ejecuciones/{ejecucion_id}")
def detalle_ejecucion_consultas(
    ejecucion_id: str,
    limite: int = 250,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    limite = min(max(limite, 1), 500)
    ejecucion = db.query(models.EjecucionBarrido).filter_by(id=ejecucion_id).first()
    if not ejecucion:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada.")

    resultados = (
        db.query(models.EjecucionRadicado, models.Radicado.numero)
        .join(models.Radicado, models.Radicado.id == models.EjecucionRadicado.radicado_id)
        .filter(models.EjecucionRadicado.ejecucion_id == ejecucion.id)
        .order_by(models.EjecucionRadicado.id.asc())
        .limit(limite)
        .all()
    )
    return {
        "ejecucion": {
            "id": ejecucion.id,
            "tipo": ejecucion.tipo,
            "estado": ejecucion.estado,
            "inicio": ejecucion.inicio,
            "finalizacion": ejecucion.finalizacion,
            "total_radicados": ejecucion.total_radicados,
            "procesados": ejecucion.procesados,
            "errores": ejecucion.errores,
            "actuaciones_nuevas": ejecucion.actuaciones_nuevas,
        },
        "radicados": [
            {
                "id": resultado.EjecucionRadicado.id,
                "radicado_id": resultado.EjecucionRadicado.radicado_id,
                "numero": resultado.numero,
                "consulta_id": resultado.EjecucionRadicado.consulta_id,
                "estado": resultado.EjecucionRadicado.estado,
                "inicio": resultado.EjecucionRadicado.inicio,
                "finalizacion": resultado.EjecucionRadicado.finalizacion,
                "actuaciones_nuevas": resultado.EjecucionRadicado.actuaciones_nuevas,
                "error": resultado.EjecucionRadicado.error,
            }
            for resultado in resultados
        ],
    }


def _estado_integraciones_admin() -> dict:
    settings = get_integration_settings()
    smtp_configurado = bool(settings["smtp_host"] and settings["smtp_from"])
    whatsapp_configurado = bool(
        str(settings["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and settings["whatsapp_token"]
        and settings["whatsapp_token"] != "TU_TOKEN_AQUI"
    )
    return {
        "smtp_host": settings["smtp_host"] or "",
        "smtp_port": settings["smtp_port"],
        "smtp_from": settings["smtp_from"] or "",
        "smtp_starttls": bool(settings["smtp_starttls"]),
        "smtp_user": settings["smtp_user"] or "",
        "smtp_password_configurada": bool(settings["smtp_password"]),
        "whatsapp_api_url": settings["whatsapp_api_url"] or "",
        "whatsapp_token_configurado": bool(settings["whatsapp_token"]),
        "smtp_configurado": smtp_configurado,
        "whatsapp_configurado": whatsapp_configurado,
    }


@router.get("/integraciones/configuracion")
def obtener_configuracion_integraciones_admin(
    admin: models.Usuario = Depends(verificar_admin),
):
    return _estado_integraciones_admin()


@router.put("/integraciones/configuracion")
def actualizar_configuracion_integraciones_admin(
    datos: schemas.ConfiguracionIntegracionesUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if datos.whatsapp_api_url and not datos.whatsapp_api_url.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="La URL de WhatsApp debe usar HTTP o HTTPS.")
    if datos.borrar_smtp_password and datos.smtp_password:
        raise HTTPException(status_code=400, detail="No puedes guardar y borrar la clave SMTP en la misma solicitud.")
    if datos.borrar_whatsapp_token and datos.whatsapp_token:
        raise HTTPException(status_code=400, detail="No puedes guardar y borrar el token de WhatsApp en la misma solicitud.")

    config = db.query(models.ConfiguracionIntegraciones).filter_by(id=1).with_for_update().first()
    if config is None:
        config = models.ConfiguracionIntegraciones(id=1)
        db.add(config)
    for field in ("smtp_host", "smtp_port", "smtp_from", "smtp_starttls", "smtp_user"):
        value = getattr(datos, field)
        if value is not None:
            setattr(config, field, value.strip() if isinstance(value, str) else value)
    if datos.whatsapp_api_url is not None:
        config.whatsapp_api_url_encrypted = encrypt_secret(datos.whatsapp_api_url.strip())
    if datos.smtp_password is not None:
        config.smtp_password_encrypted = encrypt_secret(datos.smtp_password)
    elif datos.borrar_smtp_password:
        config.smtp_password_encrypted = encrypt_secret("")
    if datos.whatsapp_token is not None:
        config.whatsapp_token_encrypted = encrypt_secret(datos.whatsapp_token)
    elif datos.borrar_whatsapp_token:
        config.whatsapp_token_encrypted = encrypt_secret("")

    config.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.integraciones.configuracion.actualizar", "configuracion_integraciones", 1)
    db.commit()
    return _estado_integraciones_admin()


@router.get("/diagnosticos/configuracion")
def obtener_estado_configuracion_integraciones(
    admin: models.Usuario = Depends(verificar_admin),
):
    settings = get_integration_settings()
    smtp_configurado = bool(settings["smtp_host"] and settings["smtp_from"])
    whatsapp_configurado = bool(
        str(settings["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and settings["whatsapp_token"]
        and settings["whatsapp_token"] != "TU_TOKEN_AQUI"
    )
    workflow_configurado = bool(
        workflow_frontend_url()
        and os.getenv("WORKFLOW_SERVICE_TOKEN")
    )
    return {
        "integraciones": {
            "RAMA": {"configurada": True, "estado": "PUBLICA"},
            "WORKFLOW": {"configurada": workflow_configurado, "estado": "CONFIGURADA" if workflow_configurado else "FALTAN_VARIABLES"},
            "SMTP": {"configurada": smtp_configurado, "estado": "CONFIGURADA" if smtp_configurado else "FALTAN_VARIABLES"},
            "WHATSAPP": {"configurada": whatsapp_configurado, "estado": "CONFIGURADA" if whatsapp_configurado else "FALTAN_VARIABLES"},
        }
    }


@router.post("/diagnosticos/conexion")
def probar_conexion_integracion(
    datos: schemas.DiagnosticoIntegracion,
    admin: models.Usuario = Depends(verificar_admin),
):
    if datos.integracion == "RAMA":
        try:
            with urlopen(Request(API_BASE_URL), timeout=8) as response:
                codigo = response.status
        except HTTPError as exc:
            codigo = exc.code
            if codigo >= 500:
                return {"integracion": "RAMA", "estado": "FALLO", "codigo_http": codigo}
            return {
                "integracion": "RAMA",
                "estado": "ALCANZABLE",
                "codigo_http": codigo,
                "detalle": "El host respondió; la URL base no es un endpoint de consulta.",
            }
        except (URLError, TimeoutError, OSError):
            return {"integracion": "RAMA", "estado": "FALLO", "detalle": "No fue posible conectar con la API pública."}
        return {"integracion": "RAMA", "estado": "CONECTADA", "codigo_http": codigo}

    if datos.integracion == "WORKFLOW":
        base_url = workflow_frontend_url()
        headers = workflow_service_headers()
        if not base_url or "Authorization" not in headers:
            return {"integracion": "WORKFLOW", "estado": "FALTAN_VARIABLES"}
        try:
            response = requests.post(
                urljoin(base_url.rstrip("/") + "/", "workflow-internal/diagnosticos"),
                headers=headers,
                json={},
                timeout=10,
            )
        except requests.RequestException:
            return {"integracion": "WORKFLOW", "estado": "FALLO", "detalle": "No fue posible contactar el servicio Workflow."}
        if not response.ok:
            if response.status_code == 401:
                code = workflow_401_reason(response)
                return {
                    "integracion": "WORKFLOW",
                    "estado": "FALLO",
                    "codigo_http": 401,
                    "causa": code,
                    "launcher_host": urlsplit(base_url).hostname or "unknown",
                    "content_type": response.headers.get("content-type", "unknown"),
                }
            return {"integracion": "WORKFLOW", "estado": "FALLO", "codigo_http": response.status_code}
        try:
            resultado = response.json()
        except requests.RequestException:
            return {"integracion": "WORKFLOW", "estado": "FALLO", "detalle": "El servicio Workflow respondió un formato no válido."}
        return {"integracion": "WORKFLOW", "estado": "ACEPTADO", "workflow_run_id": resultado.get("workflow_run_id")}

    if datos.integracion == "SMTP":
        settings = get_integration_settings()
        host = settings["smtp_host"]
        remitente = settings["smtp_from"]
        if not host or not remitente:
            return {"integracion": "SMTP", "estado": "FALTAN_VARIABLES"}
        try:
            with smtplib.SMTP(host, int(settings["smtp_port"] or 587), timeout=8) as servidor:
                servidor.ehlo()
                if settings["smtp_starttls"]:
                    servidor.starttls()
                    servidor.ehlo()
        except (OSError, smtplib.SMTPException, ValueError):
            return {"integracion": "SMTP", "estado": "FALLO", "detalle": "No fue posible establecer la conexión SMTP."}
        return {"integracion": "SMTP", "estado": "CONECTADO", "detalle": "Conexión verificada; no se envió correo."}

    settings = get_integration_settings()
    configurado = bool(
        str(settings["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and settings["whatsapp_token"]
        and settings["whatsapp_token"] != "TU_TOKEN_AQUI"
    )
    return {
        "integracion": "WHATSAPP",
        "estado": "CONFIGURADA_SIN_ENVIAR" if configurado else "FALTAN_VARIABLES",
        "detalle": "Esta comprobación no envía un mensaje.",
    }


@router.post("/diagnosticos/envio")
def enviar_mensaje_prueba_integracion(
    datos: schemas.DiagnosticoEnvioPrueba,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if not datos.confirmar_envio:
        raise HTTPException(status_code=400, detail="Confirma explícitamente el envío real de prueba.")

    destinatario = datos.destinatario.strip()
    if datos.canal == "EMAIL":
        try:
            destinatario = validate_email(destinatario, check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise HTTPException(status_code=400, detail="El correo de prueba no es válido.") from exc
    else:
        digitos = "".join(filter(str.isdigit, destinatario))
        if not 8 <= len(digitos) <= 15:
            raise HTTPException(status_code=400, detail="El teléfono de prueba debe tener entre 8 y 15 dígitos.")

    registrar_evento_auditoria(
        db,
        admin,
        "admin.integracion.envio_prueba",
        "integracion",
        datos.canal,
    )
    db.commit()
    try:
        enviado = (
            enviar_correo(destinatario, "Prueba de integración", "Mensaje de prueba solicitado por un administrador.")
            if datos.canal == "EMAIL"
            else enviar_mensaje_whatsapp(destinatario, "Mensaje de prueba solicitado por un administrador.")
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="El proveedor no pudo completar el envío de prueba.") from exc
    if not enviado:
        raise HTTPException(status_code=502, detail="El proveedor no confirmó el envío de prueba.")
    return {"estado": "ENVIADO", "canal": datos.canal, "destinatario": destinatario}


# ============================================================
# USUARIOS
# ============================================================

@router.get(
    "/usuarios",
    response_model=list[schemas.UsuarioOut],
)
def listar_usuarios(
    incluir_administradores: bool = False,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    query = db.query(models.Usuario)
    if not incluir_administradores:
        query = query.filter(models.Usuario.rol != models.RolUsuario.ADMIN)
    usuarios = query.order_by(models.Usuario.created_at.desc()).all()

    return usuarios


@router.post("/usuarios", response_model=schemas.UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario_admin(
    datos: schemas.UsuarioAdminCreate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    email = str(datos.email).lower()
    nombre = datos.nombre_completo.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    if datos.rol == models.RolUsuario.ADMIN:
        raise HTTPException(status_code=400, detail="No se crean administradores de plataforma desde esta pantalla.")
    if db.query(models.Usuario).filter(models.Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    plan_id = datos.plan_id
    abogado_id = datos.creado_por_abogado_id
    if datos.rol == models.RolUsuario.ABOGADO:
        if plan_id is None or not db.query(models.Plan).filter(models.Plan.id == plan_id, models.Plan.activo == True).first():
            raise HTTPException(status_code=400, detail="El plan seleccionado no está disponible.")
        abogado_id = None
    elif datos.rol == models.RolUsuario.ABOGADO_ADMIN:
        plan_id = None
        abogado_id = None
    elif datos.rol == models.RolUsuario.CLIENTE:
        plan_id = None
        abogado = db.query(models.Usuario).filter(
            models.Usuario.id == abogado_id,
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
        ).first()
        if not abogado:
            raise HTTPException(status_code=400, detail="Selecciona el abogado administrador responsable del cliente.")
    usuario = models.Usuario(
        email=email, nombre_completo=nombre, whatsapp_numero=datos.whatsapp_numero.strip(),
        password_hash=security.hash_password(datos.password_temporal), rol=datos.rol,
        estado=models.EstadoUsuario.ACTIVO, plan_id=plan_id,
        creado_por_abogado_id=abogado_id, debe_cambiar_password=True,
        notificaciones_email=True, notificaciones_whatsapp=False,
        canal_notificacion_cliente="EMAIL" if datos.rol == models.RolUsuario.CLIENTE else None,
    )
    db.add(usuario)
    db.flush()
    registrar_evento_auditoria(db, admin, "admin.usuario.crear", "usuario", usuario.id)
    db.commit(); db.refresh(usuario)
    return usuario


@router.patch("/usuarios/estado-masivo")
def cambiar_estado_usuarios_masivo(datos: schemas.AccionMasivaUsuarios, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    ids = list(set(datos.usuario_ids))
    if not ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un usuario.")
    objetivos = db.query(models.Usuario.id).filter(
        models.Usuario.id.in_(ids), models.Usuario.rol != models.RolUsuario.ADMIN
    ).all()
    total = db.query(models.Usuario).filter(
        models.Usuario.id.in_(ids), models.Usuario.rol != models.RolUsuario.ADMIN
    ).update({models.Usuario.estado: datos.estado}, synchronize_session=False)
    for (usuario_id,) in objetivos:
        registrar_evento_auditoria(db, admin, f"admin.usuario.estado.{datos.estado.value}", "usuario", usuario_id)
    db.commit()
    return {"mensaje": f"{total} usuario(s) actualizado(s).", "total": total}


@router.patch("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar_usuario_admin(
    usuario_id: int, datos: schemas.UsuarioAdminUpdate,
    db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id, models.Usuario.rol != models.RolUsuario.ADMIN).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if datos.rol is not None and datos.rol != usuario.rol:
        if datos.rol == models.RolUsuario.ADMIN:
            raise HTTPException(status_code=400, detail="No se puede asignar el rol administrador desde esta pantalla.")
        has_processes = db.query(models.Proceso.id).filter(models.Proceso.abogado_id == usuario.id).first()
        has_collaborations = db.query(models.ProcesoColaborador.proceso_id).filter(models.ProcesoColaborador.abogado_id == usuario.id).first()
        has_client_processes = db.query(models.ProcesoCliente.proceso_id).filter(models.ProcesoCliente.cliente_id == usuario.id).first()
        has_tasks = db.query(models.Tarea.id).filter(or_(models.Tarea.usuario_id == usuario.id, models.Tarea.cliente_id == usuario.id)).first()
        has_documents = db.query(models.DocumentoProceso.id).filter(models.DocumentoProceso.cliente_id == usuario.id).first()
        has_document_requests = db.query(models.SolicitudDocumento.id).filter(models.SolicitudDocumento.cliente_id == usuario.id).first()
        has_profile_requests = db.query(models.SolicitudEdicionPerfilCliente.id).filter(models.SolicitudEdicionPerfilCliente.cliente_id == usuario.id).first()
        if any((has_processes, has_collaborations, has_client_processes, has_tasks, has_documents, has_document_requests, has_profile_requests)) or usuario.solicitud_registro:
            raise HTTPException(status_code=400, detail="No se puede cambiar el rol porque la cuenta ya tiene información asociada.")
        if usuario.estado != models.EstadoUsuario.ACTIVO:
            raise HTTPException(status_code=400, detail="Solo se puede cambiar el rol de una cuenta activa.")
        if datos.rol == models.RolUsuario.ABOGADO:
            selected_plan = datos.plan_id or usuario.plan_id
            if not selected_plan or not db.query(models.Plan).filter(models.Plan.id == selected_plan, models.Plan.activo.is_(True)).first():
                raise HTTPException(status_code=400, detail="Selecciona un plan SaaS activo para este abogado.")
            usuario.plan_id = selected_plan
            usuario.creado_por_abogado_id = None
        elif datos.rol == models.RolUsuario.ABOGADO_ADMIN:
            usuario.plan_id = None
            usuario.creado_por_abogado_id = None
        elif datos.rol == models.RolUsuario.CLIENTE:
            owner_id = datos.creado_por_abogado_id or usuario.creado_por_abogado_id
            owner = db.query(models.Usuario).filter(
                models.Usuario.id == owner_id,
                models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
                models.Usuario.estado == models.EstadoUsuario.ACTIVO,
            ).first()
            if not owner:
                raise HTTPException(status_code=400, detail="Selecciona un abogado activo de la firma como responsable.")
            usuario.plan_id = None
            usuario.creado_por_abogado_id = owner.id
        usuario.rol = datos.rol
    if datos.nombre_completo is not None:
        if not datos.nombre_completo.strip():
            raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
        usuario.nombre_completo = datos.nombre_completo.strip()
    if datos.whatsapp_numero is not None: usuario.whatsapp_numero = datos.whatsapp_numero.strip()
    if datos.plan_id is not None:
        if usuario.rol != models.RolUsuario.ABOGADO:
            raise HTTPException(status_code=400, detail="Solo las cuentas SaaS tienen plan.")
        if not db.query(models.Plan).filter(models.Plan.id == datos.plan_id).first():
            raise HTTPException(status_code=400, detail="Plan no encontrado.")
        usuario.plan_id = datos.plan_id
    if datos.creado_por_abogado_id is not None:
        if usuario.rol != models.RolUsuario.CLIENTE or not db.query(models.Usuario).filter(models.Usuario.id == datos.creado_por_abogado_id, models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN).first():
            raise HTTPException(status_code=400, detail="El abogado responsable no es válido.")
        usuario.creado_por_abogado_id = datos.creado_por_abogado_id
    registrar_evento_auditoria(db, admin, "admin.usuario.actualizar", "usuario", usuario.id)
    db.commit(); db.refresh(usuario)
    return usuario


@router.patch("/usuarios/{usuario_id}/forzar-cambio-password")
def forzar_cambio_password_admin(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    usuario = db.query(models.Usuario).filter(
        models.Usuario.id == usuario_id,
        models.Usuario.rol != models.RolUsuario.ADMIN,
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    usuario.debe_cambiar_password = True
    registrar_evento_auditoria(db, admin, "admin.usuario.forzar_cambio_password", "usuario", usuario.id)
    db.commit()
    return {"mensaje": "El usuario deberá cambiar su contraseña en el próximo ingreso."}


@router.post("/solicitudes/accion-masiva")
def procesar_solicitudes_masivo(datos: schemas.AccionMasivaSolicitudes, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    ids = list(set(datos.solicitud_ids))
    accion = datos.accion.upper()
    if not ids or accion not in {"APROBAR", "RECHAZAR"}:
        raise HTTPException(status_code=400, detail="Acción o solicitudes inválidas.")
    solicitudes = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.id.in_(ids)).all()
    if accion == "APROBAR":
        plan = db.query(models.Plan).filter(models.Plan.id == datos.plan_id, models.Plan.activo == True).first()
        if not plan:
            raise HTTPException(status_code=400, detail="Selecciona un plan activo.")
        for solicitud in solicitudes:
            solicitud.usuario.estado = models.EstadoUsuario.ACTIVO
            solicitud.usuario.plan_id = plan.id
    else:
        for solicitud in solicitudes:
            solicitud.usuario.estado = models.EstadoUsuario.RECHAZADO
    for solicitud in solicitudes:
        registrar_evento_auditoria(
            db,
            admin,
            f"admin.solicitud.{accion.lower()}",
            "solicitud_registro",
            solicitud.id,
        )
    db.commit()
    return {"mensaje": f"{len(solicitudes)} solicitud(es) procesada(s)."}


# ============================================================
# PLANES - LISTAR
# ============================================================

@router.get(
    "/planes",
    response_model=list[schemas.PlanOut],
)
def listar_planes(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    planes = (
        db.query(models.Plan)
        .order_by(models.Plan.id.asc())
        .all()
    )

    return planes


@router.patch("/planes/estado-masivo")
def cambiar_estado_planes_masivo(
    datos: schemas.AccionMasivaPlanes,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    ids = list(set(datos.plan_ids))
    if not ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un plan.")
    objetivos = db.query(models.Plan.id).filter(models.Plan.id.in_(ids)).all()
    total = db.query(models.Plan).filter(models.Plan.id.in_(ids)).update(
        {models.Plan.activo: datos.activo}, synchronize_session=False
    )
    for (plan_id,) in objetivos:
        registrar_evento_auditoria(
            db,
            admin,
            f"admin.plan.estado.{str(datos.activo).lower()}",
            "plan",
            plan_id,
        )
    db.commit()
    return {"mensaje": f"{total} plan(es) actualizado(s).", "total": total}


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


# ============================================================
# PLANES - CREAR
# ============================================================

@router.post(
    "/planes",
    response_model=schemas.PlanOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_plan(
    datos: schemas.PlanCreate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    nombre = datos.nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del plan es obligatorio.",
        )

    if datos.limite_radicados < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El límite de radicados debe ser mayor que cero.",
        )

    if datos.precio_mensual < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El precio mensual no puede ser negativo.",
        )

    _validar_capacidad_actuaciones(datos.limite_ultimas_actuaciones)

    plan_existente = (
        db.query(models.Plan)
        .filter(models.Plan.nombre.ilike(nombre))
        .first()
    )

    if plan_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un plan con ese nombre.",
        )

    nuevo_plan = models.Plan(
        nombre=nombre,
        limite_radicados=datos.limite_radicados,
        precio_mensual=datos.precio_mensual,
        limite_ultimas_actuaciones=datos.limite_ultimas_actuaciones,
        notificaciones_whatsapp_procesos=datos.notificaciones_whatsapp_procesos,
        notificaciones_whatsapp_tareas=datos.notificaciones_whatsapp_tareas,
        activo=True,
    )

    db.add(nuevo_plan)
    db.flush()
    registrar_evento_auditoria(db, admin, "admin.plan.crear", "plan", nuevo_plan.id)
    db.commit()
    db.refresh(nuevo_plan)

    return nuevo_plan


# ============================================================
# PLANES - EDITAR
# ============================================================

@router.put(
    "/planes/{plan_id}",
    response_model=schemas.PlanOut,
)
def actualizar_plan(
    plan_id: int,
    datos: schemas.PlanUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plan = (
        db.query(models.Plan)
        .filter(models.Plan.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan no encontrado.",
        )

    if datos.nombre is not None:
        nombre = datos.nombre.strip()

        if not nombre:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre del plan no puede estar vacío.",
            )

        otro_plan = (
            db.query(models.Plan)
            .filter(
                models.Plan.nombre.ilike(nombre),
                models.Plan.id != plan_id,
            )
            .first()
        )

        if otro_plan:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe otro plan con ese nombre.",
            )

        plan.nombre = nombre

    if datos.limite_radicados is not None:
        if datos.limite_radicados < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El límite de radicados debe ser mayor que cero.",
            )

        plan.limite_radicados = datos.limite_radicados

    if datos.precio_mensual is not None:
        if datos.precio_mensual < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El precio mensual no puede ser negativo.",
            )

        plan.precio_mensual = datos.precio_mensual

    if datos.activo is not None:
        plan.activo = datos.activo

    campos_enviados = getattr(datos, "model_fields_set", getattr(datos, "__fields_set__", set()))
    if "limite_ultimas_actuaciones" in campos_enviados:
        _validar_capacidad_actuaciones(datos.limite_ultimas_actuaciones)
        plan.limite_ultimas_actuaciones = datos.limite_ultimas_actuaciones

    if datos.notificaciones_whatsapp_procesos is not None:
        plan.notificaciones_whatsapp_procesos = datos.notificaciones_whatsapp_procesos

    if datos.notificaciones_whatsapp_tareas is not None:
        plan.notificaciones_whatsapp_tareas = datos.notificaciones_whatsapp_tareas

    registrar_evento_auditoria(db, admin, "admin.plan.actualizar", "plan", plan.id)
    db.commit()
    db.refresh(plan)

    return plan


# ============================================================
# PLANES - ACTIVAR / DESACTIVAR
# ============================================================

@router.patch(
    "/planes/{plan_id}/estado",
    response_model=schemas.PlanOut,
)
def cambiar_estado_plan(
    plan_id: int,
    activo: bool,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plan = (
        db.query(models.Plan)
        .filter(models.Plan.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan no encontrado.",
        )

    plan.activo = activo

    registrar_evento_auditoria(db, admin, f"admin.plan.estado.{str(activo).lower()}", "plan", plan.id)
    db.commit()
    db.refresh(plan)

    return plan


# ============================================================
# PLANES - ELIMINAR
# ============================================================

@router.delete(
    "/planes/{plan_id}",
)
def eliminar_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plan = (
        db.query(models.Plan)
        .filter(models.Plan.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan no encontrado.",
        )

    usuarios_asignados = (
        db.query(models.Usuario)
        .filter(models.Usuario.plan_id == plan_id)
        .count()
    )

    if usuarios_asignados > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede eliminar este plan porque "
                f"tiene {usuarios_asignados} usuario(s) asignado(s). "
                "Desactívelo en lugar de eliminarlo."
            ),
        )

    db.delete(plan)
    registrar_evento_auditoria(db, admin, "admin.plan.eliminar", "plan", plan_id)
    db.commit()

    return {
        "mensaje": "Plan eliminado correctamente."
    }

@router.get("/usuarios/{usuario_id}")
def obtener_usuario_admin(
    usuario_id: int,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    procesos_query = db.query(models.Proceso)
    if usuario.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ABOGADO):
        procesos_query = procesos_query.filter(models.Proceso.abogado_id == usuario.id)
        colaboraciones = db.query(models.ProcesoColaborador.proceso_id).filter(
            models.ProcesoColaborador.abogado_id == usuario.id
        ).all()
        colaboration_ids = [row[0] for row in colaboraciones]
        if colaboration_ids:
            procesos_query = db.query(models.Proceso).filter(
                or_(models.Proceso.abogado_id == usuario.id, models.Proceso.id.in_(colaboration_ids))
            )
    elif usuario.rol == models.RolUsuario.CLIENTE:
        procesos_query = procesos_query.join(
            models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.Proceso.id
        ).filter(models.ProcesoCliente.cliente_id == usuario.id)
    else:
        procesos_query = procesos_query.filter(models.Proceso.id == -1)
    procesos = procesos_query.order_by(models.Proceso.created_at.desc()).limit(100).all()
    proceso_ids = [proceso.id for proceso in procesos]

    tareas = db.query(models.Tarea).filter(or_(
        models.Tarea.usuario_id == usuario.id,
        models.Tarea.cliente_id == usuario.id,
    )).order_by(models.Tarea.created_at.desc()).limit(100).all()

    documentos_query = db.query(models.DocumentoProceso).filter(
        models.DocumentoProceso.cliente_id == usuario.id
    )
    if proceso_ids:
        documentos_query = db.query(models.DocumentoProceso).filter(or_(
            models.DocumentoProceso.cliente_id == usuario.id,
            models.DocumentoProceso.proceso_id.in_(proceso_ids),
        ))
    documentos = documentos_query.order_by(models.DocumentoProceso.created_at.desc()).limit(100).all()

    solicitudes = []
    if usuario.solicitud_registro:
        solicitud = usuario.solicitud_registro
        solicitudes.append({
            "id": solicitud.id, "tipo": "Registro profesional", "estado": usuario.estado.value,
            "fecha": solicitud.fecha_solicitud, "href": "/gestion-procesos/admin/solicitudes",
        })
    solicitudes_perfil = db.query(models.SolicitudEdicionPerfilCliente).filter(
        models.SolicitudEdicionPerfilCliente.cliente_id == usuario.id
    ).order_by(models.SolicitudEdicionPerfilCliente.solicitada_en.desc()).limit(50).all()
    solicitudes.extend({
        "id": solicitud.id, "tipo": "Edición de perfil", "estado": solicitud.estado,
        "fecha": solicitud.solicitada_en, "href": "/gestion-procesos/admin/solicitudes-perfil",
    } for solicitud in solicitudes_perfil)
    solicitudes_documento_query = db.query(models.SolicitudDocumento).filter(
        models.SolicitudDocumento.cliente_id == usuario.id
    )
    if proceso_ids:
        solicitudes_documento_query = db.query(models.SolicitudDocumento).filter(or_(
            models.SolicitudDocumento.cliente_id == usuario.id,
            models.SolicitudDocumento.proceso_id.in_(proceso_ids),
        ))
    for solicitud in solicitudes_documento_query.order_by(models.SolicitudDocumento.created_at.desc()).limit(50).all():
        solicitudes.append({
            "id": solicitud.id, "tipo": f"Documento: {solicitud.titulo}",
            "estado": "Atendida" if solicitud.atendida_en else "Pendiente",
            "fecha": solicitud.created_at, "href": "/gestion-procesos/admin/documentos",
        })

    activity_rows = db.query(models.EventoAuditoria).filter(
        models.EventoAuditoria.actor_id == usuario.id
    ).order_by(models.EventoAuditoria.created_at.desc(), models.EventoAuditoria.id.desc()).limit(30).all()
    actividad = []
    for evento in activity_rows:
        descripcion, recurso = _dashboard_activity_description(evento.accion, evento.tipo_recurso)
        actividad.append({
            "id": evento.id, "accion": evento.accion, "descripcion": descripcion,
            "recurso": recurso, "fecha": evento.created_at,
            "href": _dashboard_activity_href(evento.tipo_recurso, evento.recurso_id),
        })

    return {
        "id": usuario.id,
        "nombre_completo": usuario.nombre_completo,
        "email": usuario.email,
        "whatsapp_numero": usuario.whatsapp_numero,
        "rol": usuario.rol.value,
        "estado": usuario.estado.value,
        "debe_cambiar_password": usuario.debe_cambiar_password,
        "created_at": usuario.created_at,
        "ultimo_acceso": usuario.ultimo_acceso,
        "plan": {"id": usuario.plan.id, "nombre": usuario.plan.nombre} if usuario.plan else None,
        "responsable": {
            "id": usuario.creado_por_abogado.id,
            "nombre": usuario.creado_por_abogado.nombre_completo,
        } if usuario.creado_por_abogado else None,
        "procesos": [{
            "id": proceso.id, "nombre": proceso.nombre, "estado": "Archivado" if proceso.archivado_en else "Activo",
            "abogado": proceso.abogado.nombre_completo if proceso.abogado else None,
            "href": "/gestion-procesos/admin/procesos",
        } for proceso in procesos],
        "tareas": [{
            "id": tarea.id, "titulo": tarea.titulo, "estado": tarea.estado.value,
            "fecha_limite": tarea.fecha_limite, "proceso": tarea.proceso.nombre if tarea.proceso else None,
            "href": "/gestion-procesos/admin/tareas",
        } for tarea in tareas],
        "documentos": [{
            "id": documento.id, "nombre": documento.nombre_archivo,
            "fecha": documento.created_at, "proceso": documento.proceso.nombre if documento.proceso else None,
            "href": "/gestion-procesos/admin/documentos",
        } for documento in documentos],
        "solicitudes": solicitudes,
        "actividad": actividad,
        "totales": {
            "procesos": len(procesos), "tareas": len(tareas),
            "documentos": len(documentos), "solicitudes": len(solicitudes),
        },
    }


@router.patch("/usuarios/{usuario_id}/plan")
def cambiar_plan_usuario(
    usuario_id: int,
    plan_id: int,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.id == usuario_id,
            models.Usuario.rol == models.RolUsuario.ABOGADO,
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    plan = (
        db.query(models.Plan)
        .filter(
            models.Plan.id == plan_id,
            models.Plan.activo == True,
        )
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=400,
            detail="El plan no existe o está inactivo.",
        )

    usuario.plan_id = plan.id

    registrar_evento_auditoria(db, usuario_actual, "admin.usuario.plan", "usuario", usuario.id)
    db.commit()
    db.refresh(usuario)

    return {
        "mensaje": "Plan actualizado correctamente.",
        "plan": {
            "id": plan.id,
            "nombre": plan.nombre,
            "limite_radicados": plan.limite_radicados,
            "precio_mensual": plan.precio_mensual,
            "limite_ultimas_actuaciones": plan.limite_ultimas_actuaciones,
            "notificaciones_whatsapp_procesos": plan.notificaciones_whatsapp_procesos,
            "notificaciones_whatsapp_tareas": plan.notificaciones_whatsapp_tareas,
            "activo": plan.activo,
        },
    }


@router.patch("/usuarios/{usuario_id}/estado")
def cambiar_estado_usuario(
    usuario_id: int,
    estado: models.EstadoUsuario,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.id == usuario_id,
            models.Usuario.rol != models.RolUsuario.ADMIN,
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    if usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION:
        raise HTTPException(status_code=409, detail="Revisa la solicitud de registro para decidir el estado de esta cuenta.")
    if estado == models.EstadoUsuario.PENDIENTE_APROBACION:
        raise HTTPException(status_code=400, detail="Usa el flujo de revisión de solicitudes para dejar una cuenta pendiente.")
    if estado not in (models.EstadoUsuario.ACTIVO, models.EstadoUsuario.SUSPENDIDO, models.EstadoUsuario.RECHAZADO):
        raise HTTPException(status_code=400, detail="Estado de cuenta no permitido.")

    usuario.estado = estado

    registrar_evento_auditoria(db, usuario_actual, f"admin.usuario.estado.{estado.value}", "usuario", usuario.id)
    db.commit()
    db.refresh(usuario)

    return {
        "mensaje": "Estado del usuario actualizado correctamente.",
        "estado": usuario.estado.value,
    }


@router.delete("/usuarios/{usuario_id}")
def eliminar_usuario_admin(
    usuario_id: int,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.rol == models.RolUsuario.ADMIN:
        raise HTTPException(status_code=403, detail="Las cuentas administradoras de plataforma no se eliminan desde este módulo.")

    referencias = {
        "cuentas que tienen esta cuenta como responsable": db.query(models.Usuario.id).filter(
            models.Usuario.creado_por_abogado_id == usuario_id
        ).first(),
        "radicados creados o vinculados": db.query(models.Radicado.id).filter(
            or_(models.Radicado.creado_por_id == usuario_id, models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario_id))
        ).first(),
        "solicitudes de registro": db.query(models.SolicitudRegistro.id).filter(
            models.SolicitudRegistro.usuario_id == usuario_id
        ).first(),
        "solicitudes de perfil": db.query(models.SolicitudEdicionPerfilCliente.id).filter(
            models.SolicitudEdicionPerfilCliente.cliente_id == usuario_id
        ).first(),
        "procesos como abogado": db.query(models.Proceso.id).filter(
            models.Proceso.abogado_id == usuario_id
        ).first(),
        "colaboraciones o procesos como cliente": db.query(models.ProcesoColaborador.proceso_id).filter(
            models.ProcesoColaborador.abogado_id == usuario_id
        ).first() or db.query(models.ProcesoCliente.proceso_id).filter(
            models.ProcesoCliente.cliente_id == usuario_id
        ).first(),
        "tareas o subtareas": db.query(models.Tarea.id).filter(
            or_(models.Tarea.usuario_id == usuario_id, models.Tarea.cliente_id == usuario_id)
        ).first() or db.query(models.Subtarea.id).filter(models.Subtarea.cliente_id == usuario_id).first(),
        "solicitudes o documentos": db.query(models.SolicitudDocumento.id).filter(
            models.SolicitudDocumento.cliente_id == usuario_id
        ).first() or db.query(models.DocumentoProceso.id).filter(
            models.DocumentoProceso.cliente_id == usuario_id
        ).first(),
        "notificaciones o entregas": db.query(models.NotificacionProceso.id).filter(
            or_(models.NotificacionProceso.abogado_id == usuario_id, models.NotificacionProceso.cliente_id == usuario_id)
        ).first() or db.query(models.EntregaNotificacion.id).filter(
            models.EntregaNotificacion.usuario_id == usuario_id
        ).first() or db.query(models.EntregaNotificacionActuacion.id).filter(
            models.EntregaNotificacionActuacion.usuario_id == usuario_id
        ).first(),
    }
    vinculadas = [label for label, record in referencias.items() if record]
    if vinculadas:
        detalle = ", ".join(vinculadas)
        raise HTTPException(
            status_code=409,
            detail=f"No se puede eliminar esta cuenta porque conserva historial: {detalle}. Suspéndela para mantener esos datos.",
        )

    registrar_evento_auditoria(db, usuario_actual, "admin.usuario.eliminar", "usuario", usuario.id)
    db.delete(usuario)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="La cuenta conserva registros relacionados y no se eliminó. Suspéndela para proteger el historial.",
        ) from error
    return {"mensaje": "Cuenta eliminada. Los registros de auditoría se conservaron."}
