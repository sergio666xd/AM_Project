import os
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas, security, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.document_validation import (
    ALLOWED_DOCUMENT_TYPES,
    MAX_DOCUMENT_BYTES,
    document_content_matches_type,
)
from app.security import obtener_usuario_actual
from app.firm_access import require_roles
from app.site_content import PUBLIC_CONTENT_PAGES
from app.tasks import tarea_consultar_radicado
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
        return db.query(models.Radicado).join(models.Usuario, models.Usuario.id == models.Radicado.usuario_id).filter(models.Usuario.rol.in_(roles))
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

@router.get("/contenido")
def listar_contenido_publico_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    saved = {
        page.slug: page
        for page in db.query(models.ContenidoPagina).all()
    }
    return [
        {
            "slug": slug,
            "nombre": label,
            "contenido": saved[slug].contenido if slug in saved else None,
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
    return {"slug": page.slug, "contenido": page.contenido, "updated_at": page.updated_at}

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


@router.get("/auditoria")
def listar_eventos_auditoria(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    eventos = (
        db.query(models.EventoAuditoria)
        .order_by(models.EventoAuditoria.created_at.desc(), models.EventoAuditoria.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": evento.id,
            "actor_id": evento.actor_id,
            "accion": evento.accion,
            "tipo_recurso": evento.tipo_recurso,
            "recurso_id": evento.recurso_id,
            "created_at": evento.created_at,
        }
        for evento in eventos
    ]


# ============================================================
# DASHBOARD
# ============================================================

@router.get("/dashboard")
def obtener_dashboard_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    total_usuarios = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO
        )
        .count()
    )

    usuarios_activos = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol != models.RolUsuario.ADMIN,
            models.Usuario.estado == models.EstadoUsuario.ACTIVO,
        )
        .count()
    )

    usuarios_pendientes = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO,
            models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION,
        )
        .count()
    )

    usuarios_rechazados = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO,
            models.Usuario.estado == models.EstadoUsuario.RECHAZADO,
        )
        .count()
    )

    total_radicados = db.query(models.Radicado).count()

    total_planes = db.query(models.Plan).count()

    planes_activos = (
        db.query(models.Plan)
        .filter(models.Plan.activo == True)
        .count()
    )

    return {
        "usuarios": {
            "total": total_usuarios,
            "activos": usuarios_activos,
            "pendientes": usuarios_pendientes,
            "rechazados": usuarios_rechazados,
        },
        "radicados": {
            "total": total_radicados,
        },
        "planes": {
            "total": total_planes,
            "activos": planes_activos,
        },
    }


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
            "motor_local": "Celery + Redis",
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
        return [{"id": p.id, "owner_id": p.abogado_id, "owner_rol": p.abogado.rol.value, "nombre": p.nombre, "descripcion": p.descripcion, "archivado_en": p.archivado_en, "abogado": p.abogado.nombre_completo, "radicados": len(p.radicados), "clientes": len(p.clientes), "created_at": p.created_at} for p in query.order_by(models.Proceso.created_at.desc()).limit(limite).all()]
    if recurso == "radicados":
        query = db.query(models.Radicado).join(models.Usuario, models.Usuario.id == models.Radicado.usuario_id).filter(models.Usuario.rol.in_(roles))
        return [{"id": r.id, "owner_id": r.usuario_id, "numero": r.numero, "abogado": r.usuario.nombre_completo, "estado_consulta": r.estado_consulta, "actuaciones": len(r.actuaciones), "consultado_en": r.consultado_en} for r in query.order_by(models.Radicado.created_at.desc()).limit(limite).all()]
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
    if recurso == "procesos":
        if not datos.nombre or not datos.nombre.strip():
            raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
        item = models.Proceso(abogado_id=owner.id, nombre=datos.nombre.strip(), descripcion=datos.descripcion)
        action = "crear_proceso"
    elif recurso == "radicados":
        numero = (datos.numero or "").strip()
        if not numero.isdigit() or len(numero) != 23:
            raise HTTPException(status_code=400, detail="El radicado debe tener exactamente 23 dígitos.")
        if db.query(models.Radicado).filter(models.Radicado.numero == numero).first():
            raise HTTPException(status_code=409, detail="El radicado ya existe.")
        item = models.Radicado(usuario_id=owner.id, numero=numero, estado_consulta="sin consultar")
        action = "crear_radicado"
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
                models.Radicado.usuario_id == owner.id,
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
    return {"id": item.id, "mensaje": "Registro creado.", "sector": sector.upper()}


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
            numero = (values["numero"] or "").strip()
            if not numero.isdigit() or len(numero) != 23:
                raise HTTPException(status_code=400, detail="El radicado debe tener exactamente 23 dígitos.")
            duplicate = db.query(models.Radicado).filter(
                models.Radicado.numero == numero, models.Radicado.id != item.id
            ).first()
            if duplicate:
                raise HTTPException(status_code=409, detail="El radicado ya existe.")
            item.numero = numero
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


def _encolar_consulta_radicado_admin(
    db: Session,
    admin: models.Usuario,
    radicado: models.Radicado,
) -> bool:
    consulta = models.ConsultaRadicado(
        radicado_id=radicado.id,
        tipo="MANUAL",
        estado="ENCOLADA",
        inicio=datetime.utcnow(),
    )
    db.add(consulta)
    db.commit()
    db.refresh(consulta)
    try:
        task = tarea_consultar_radicado.delay(radicado.id, "MANUAL", consulta.id)
        consulta.task_id = task.id
        registrar_evento_auditoria(
            db, admin, "admin.radicado.consulta.iniciar", "radicado", radicado.id
        )
        encolada = True
    except Exception as exc:
        consulta.estado = "ERROR"
        consulta.finalizacion = datetime.utcnow()
        consulta.error = str(exc)
        registrar_evento_auditoria(
            db, admin, "admin.radicado.consulta.error", "radicado", radicado.id
        )
        encolada = False
    db.commit()
    return encolada


@router.post("/radicados/consultar")
def consultar_todos_radicados_admin(
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    radicados = _query_inventario_admin(db, "radicados", sector).all()
    queued = sum(_encolar_consulta_radicado_admin(db, admin, item) for item in radicados)
    return {
        "total": len(radicados),
        "encoladas": queued,
        "errores": len(radicados) - queued,
        "mensaje": f"{queued} de {len(radicados)} consultas encoladas.",
    }


@router.post("/radicados/{radicado_id}/consultar")
def consultar_radicado_admin(
    radicado_id: int,
    sector: str,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    radicado = _query_inventario_admin(db, "radicados", sector).filter(
        models.Radicado.id == radicado_id
    ).first()
    if not radicado:
        raise HTTPException(
            status_code=404,
            detail="Radicado no encontrado en el ámbito seleccionado.",
        )
    if not _encolar_consulta_radicado_admin(db, admin, radicado):
        raise HTTPException(
            status_code=503,
            detail="No fue posible encolar la consulta del radicado.",
        )
    return {"mensaje": f"Consulta del radicado {radicado.numero} encolada."}


# ============================================================
# USUARIOS
# ============================================================

@router.get(
    "/usuarios",
    response_model=list[schemas.UsuarioOut],
)
def listar_usuarios(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    usuarios = (
        db.query(models.Usuario)
        .filter(models.Usuario.rol != models.RolUsuario.ADMIN)
        .order_by(models.Usuario.created_at.desc())
        .all()
    )

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
    )
    db.add(usuario)
    db.flush()
    registrar_evento_auditoria(db, admin, "admin.usuario.crear", "usuario", usuario.id)
    db.commit(); db.refresh(usuario)
    return usuario


@router.patch("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar_usuario_admin(
    usuario_id: int, datos: schemas.UsuarioAdminUpdate,
    db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id, models.Usuario.rol != models.RolUsuario.ADMIN).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
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


@router.patch("/usuarios/estado-masivo")
def cambiar_estado_usuarios_masivo(datos: schemas.AccionMasivaUsuarios, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    ids = list(set(datos.usuario_ids))
    if not ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un usuario.")
    objetivos = db.query(models.Usuario.id).filter(
        models.Usuario.id.in_(ids), models.Usuario.rol != models.RolUsuario.ADMIN
    ).all()
    total = db.query(models.Usuario).filter(models.Usuario.id.in_(ids), models.Usuario.rol != models.RolUsuario.ADMIN).update({models.Usuario.estado: datos.estado}, synchronize_session=False)
    for (usuario_id,) in objetivos:
        registrar_evento_auditoria(db, admin, f"admin.usuario.estado.{datos.estado.value}", "usuario", usuario_id)
    db.commit()
    return {"mensaje": f"{total} usuario(s) actualizado(s).", "total": total}


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

    radicados = (
    db.query(models.Radicado)
    .filter(models.Radicado.usuario_id == usuario.id)
    .order_by(models.Radicado.created_at.desc())
    .all()
    )

    return {
        "id": usuario.id,
        "email": usuario.email,
        "nombre_completo": usuario.nombre_completo,
        "whatsapp_numero": usuario.whatsapp_numero,
        "rol": usuario.rol,
        "estado": usuario.estado,
        "created_at": usuario.created_at,

        "plan": (
            {
                "id": usuario.plan.id,
                "nombre": usuario.plan.nombre,
                "limite_radicados": usuario.plan.limite_radicados,
                "precio_mensual": usuario.plan.precio_mensual,
                "limite_ultimas_actuaciones": usuario.plan.limite_ultimas_actuaciones,
                "notificaciones_whatsapp_procesos": usuario.plan.notificaciones_whatsapp_procesos,
                "notificaciones_whatsapp_tareas": usuario.plan.notificaciones_whatsapp_tareas,
                "activo": getattr(usuario.plan, "activo", True),
            }
            if usuario.plan
            else None
        ),

        "total_radicados": len(radicados),

        "radicados": [
            {
                "id": radicado.id,
                "numero": radicado.numero,
                "estado_consulta": radicado.estado_consulta,
                "despacho_departamento": radicado.despacho_departamento,
                "demandante": radicado.demandante,
                "demandado": radicado.demandado,
                "consultado_en": radicado.consultado_en,
                "alerta_enviada": radicado.alerta_enviada,
                "detalle_pendiente": radicado.detalle_pendiente,
                "created_at": radicado.created_at,
                "total_actuaciones": len(radicado.actuaciones),
            }
            for radicado in radicados
        ],
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
            models.Usuario.rol == models.RolUsuario.ABOGADO,
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    usuario.estado = estado

    registrar_evento_auditoria(db, usuario_actual, f"admin.usuario.estado.{estado.value}", "usuario", usuario.id)
    db.commit()
    db.refresh(usuario)

    return {
        "mensaje": "Estado del usuario actualizado correctamente.",
        "estado": usuario.estado,
    }
