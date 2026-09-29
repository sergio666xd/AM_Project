"""Procesos de abogados, acceso de clientes y colaboración documental."""

import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.orm import Session
from urllib.parse import quote

from app import models, schemas, security, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.document_validation import (
    ALLOWED_DOCUMENT_TYPES,
    MAX_DOCUMENT_BYTES,
    document_content_matches_type as _document_content_matches_type,
)
from app.tasks import tarea_enviar_email, tarea_enviar_whatsapp
from app.firm_access import (
    has_firm_wide_access,
    is_process_manager,
    lawyer_process_ids,
    lawyer_scope_id,
    require_process_access,
    require_process_manager,
    require_roles,
)
from app.notification_policy import plan_whatsapp_habilitado, whatsapp_habilitado

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])
def _abogado(usuario: models.Usuario) -> None:
    require_roles(usuario, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="realizar esta operación")


def _require_proceso_access(
    usuario: models.Usuario,
    proceso: models.Proceso,
    db: Session,
) -> None:
    require_process_access(
        usuario,
        proceso.abogado_id,
        process_id=proceso.id,
        db=db,
    )


def _proceso_abogado(
    proceso_id: int,
    usuario: models.Usuario,
    db: Session,
    incluir_archivado: bool = False,
) -> models.Proceso:
    query = db.query(models.Proceso).filter(models.Proceso.id == proceso_id)
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        if incluir_archivado or usuario.rol != models.RolUsuario.ABOGADO_ADMIN:
            query = query.filter(models.Proceso.abogado_id == responsible_lawyer_id)
        else:
            query = query.filter(
                models.Proceso.id.in_(lawyer_process_ids(db, usuario))
            )
    if incluir_archivado:
        query = query.filter(models.Proceso.archivado_en.is_not(None))
    else:
        query = query.filter(models.Proceso.archivado_en.is_(None))
    proceso = query.first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    _require_proceso_access(usuario, proceso, db)
    return proceso


def _cliente_asignado(proceso: models.Proceso, cliente_id: int, db: Session) -> models.Usuario:
    cliente = (
        db.query(models.Usuario)
        .join(models.ProcesoCliente, models.ProcesoCliente.cliente_id == models.Usuario.id)
        .filter(
            models.ProcesoCliente.proceso_id == proceso.id,
            models.Usuario.id == cliente_id,
            models.Usuario.rol == models.RolUsuario.CLIENTE,
        )
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=400, detail="El cliente no está asignado a este proceso.")
    return cliente


def _abogado_puede_gestionar_cliente(
    abogado: models.Usuario,
    cliente: models.Usuario,
    db: Session,
) -> bool:
    if abogado.rol == models.RolUsuario.ADMIN:
        return True
    if abogado.rol not in (models.RolUsuario.ABOGADO, models.RolUsuario.ABOGADO_ADMIN):
        return False
    if cliente.creado_por_abogado_id == abogado.id:
        return True
    return db.query(models.ProcesoCliente).join(
        models.Proceso,
        models.Proceso.id == models.ProcesoCliente.proceso_id,
    ).filter(
        models.ProcesoCliente.cliente_id == cliente.id,
        models.Proceso.id.in_(lawyer_process_ids(db, abogado)),
    ).first() is not None


def _serializar_solicitud_perfil(solicitud: models.SolicitudEdicionPerfilCliente) -> dict:
    return {
        "id": solicitud.id,
        "cliente_id": solicitud.cliente_id,
        "cliente_nombre": solicitud.cliente.nombre_completo,
        "email_actual": solicitud.cliente.email,
        "nombre_completo": solicitud.nombre_completo_solicitado,
        "email": solicitud.email_solicitado,
        "whatsapp_numero": solicitud.whatsapp_numero_solicitado,
        "estado": solicitud.estado,
        "solicitada_en": solicitud.solicitada_en,
        "revisada_en": solicitud.revisada_en,
        "revisada_por": solicitud.revisada_por.nombre_completo if solicitud.revisada_por else None,
        "comentario_revision": solicitud.comentario_revision,
    }


def _equipo_proceso(proceso: models.Proceso) -> dict:
    return {
        "admite_colaboradores": proceso.abogado.rol == models.RolUsuario.ABOGADO_ADMIN,
        "responsable": {
            "id": proceso.abogado.id,
            "nombre_completo": proceso.abogado.nombre_completo,
        },
        "colaboradores": [
            {
                "id": enlace.abogado.id,
                "nombre_completo": enlace.abogado.nombre_completo,
            }
            for enlace in sorted(
                proceso.colaboradores,
                key=lambda item: item.abogado.nombre_completo.casefold(),
            )
            if enlace.abogado and enlace.abogado.rol == models.RolUsuario.ABOGADO_ADMIN
        ],
    }


def _notificar(
    usuario: models.Usuario,
    asunto: str,
    cuerpo: str,
    emisor: models.Usuario | None = None,
    feature_plan: str | None = None,
) -> None:
    if usuario.notificaciones_email:
        tarea_enviar_email.delay(usuario.email, asunto, cuerpo)
    if whatsapp_habilitado(usuario) and (
        emisor is None or feature_plan is None or plan_whatsapp_habilitado(emisor, feature_plan)
    ):
        tarea_enviar_whatsapp.delay(usuario.whatsapp_numero, cuerpo)


@router.post("/abogados", status_code=status.HTTP_201_CREATED)
def crear_abogado_admin(datos: schemas.AbogadoAdminCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["ADMIN"], action="crear abogados administradores")
    if db.query(models.Usuario).filter(models.Usuario.email == str(datos.email).lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    abogado = models.Usuario(email=str(datos.email).lower(), nombre_completo=datos.nombre_completo.strip(), whatsapp_numero=datos.whatsapp_numero.strip(), password_hash=security.hash_password(datos.password_temporal), rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO, debe_cambiar_password=True, notificaciones_email=True, notificaciones_whatsapp=False)
    db.add(abogado); db.flush()
    registrar_evento_auditoria(db, usuario, "abogado.crear", "usuario", abogado.id)
    db.commit(); db.refresh(abogado)
    _notificar(abogado, "Acceso de abogado administrador", "Su acceso fue creado. Cambie la contraseña temporal al ingresar.")
    return {"id": abogado.id, "email": abogado.email, "debe_cambiar_password": True}


@router.post("/clientes", status_code=status.HTTP_201_CREATED)
def crear_cliente(datos: schemas.ClienteCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if db.query(models.Usuario).filter(models.Usuario.email == str(datos.email).lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    cliente = models.Usuario(email=str(datos.email).lower(), nombre_completo=datos.nombre_completo.strip(), whatsapp_numero=datos.whatsapp_numero.strip(), password_hash=security.hash_password(datos.password_temporal), rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO, creado_por_abogado_id=usuario.id, debe_cambiar_password=True, notificaciones_email=True, notificaciones_whatsapp=False)
    db.add(cliente); db.flush()
    registrar_evento_auditoria(db, usuario, "cliente.crear", "usuario", cliente.id)
    db.commit(); db.refresh(cliente)
    _notificar(cliente, "Acceso a sus procesos", f"{usuario.nombre_completo} creó su acceso. Use la contraseña temporal entregada y cámbiela al ingresar.")
    return {"id": cliente.id, "email": cliente.email, "debe_cambiar_password": True}


@router.get("/clientes")
def listar_clientes(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.CLIENTE)
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        assigned_clients = (
            db.query(models.ProcesoCliente.cliente_id)
            .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
            .filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
        )
        query = query.filter(
            or_(
                models.Usuario.creado_por_abogado_id == responsible_lawyer_id,
                models.Usuario.id.in_(assigned_clients),
            )
        )
    return [{"id": c.id, "nombre_completo": c.nombre_completo, "email": c.email, "whatsapp_numero": c.whatsapp_numero} for c in query.order_by(models.Usuario.nombre_completo).all()]


@router.get("/clientes/solicitud-edicion-perfil")
def listar_mis_solicitudes_edicion_perfil(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(usuario, ["CLIENTE"], action="consultar tus solicitudes de edición")
    solicitudes = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
        cliente_id=usuario.id
    ).order_by(models.SolicitudEdicionPerfilCliente.solicitada_en.desc()).all()
    return [_serializar_solicitud_perfil(item) for item in solicitudes]


@router.post("/clientes/solicitud-edicion-perfil", status_code=status.HTTP_201_CREATED)
def solicitar_edicion_perfil_cliente(
    datos: schemas.SolicitudEdicionPerfilClienteCreate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(usuario, ["CLIENTE"], action="solicitar la edición de tus datos")
    nombre = datos.nombre_completo.strip()
    email = str(datos.email).strip().lower()
    whatsapp = datos.whatsapp_numero.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
    if (nombre, email, whatsapp) == (
        usuario.nombre_completo,
        usuario.email.lower(),
        usuario.whatsapp_numero,
    ):
        raise HTTPException(status_code=400, detail="No hay cambios para solicitar.")
    pending = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
        cliente_id=usuario.id,
        estado="PENDIENTE",
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="Ya tienes una solicitud pendiente de revisión.")
    duplicate = db.query(models.Usuario).filter(
        models.Usuario.email == email,
        models.Usuario.id != usuario.id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Ese correo ya está asociado a otra cuenta.")
    solicitud = models.SolicitudEdicionPerfilCliente(
        cliente_id=usuario.id,
        email_solicitado=email,
        nombre_completo_solicitado=nombre,
        whatsapp_numero_solicitado=whatsapp,
    )
    db.add(solicitud)
    db.flush()
    registrar_evento_auditoria(
        db, usuario, "cliente.solicitud_perfil.crear", "solicitud_edicion_perfil", solicitud.id
    )
    db.commit()
    db.refresh(solicitud)
    return _serializar_solicitud_perfil(solicitud)


@router.get("/solicitudes-edicion-perfil")
def listar_solicitudes_edicion_perfil_pendientes(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(
        usuario,
        ["ADMIN", "ABOGADO", "ABOGADO_ADMIN"],
        action="revisar solicitudes de edición de clientes",
    )
    query = db.query(models.SolicitudEdicionPerfilCliente).filter_by(estado="PENDIENTE")
    if usuario.rol != models.RolUsuario.ADMIN:
        allowed_clients = db.query(models.Usuario.id).filter(
            models.Usuario.creado_por_abogado_id == usuario.id
        )
        assigned_clients = db.query(models.ProcesoCliente.cliente_id).filter(
            models.ProcesoCliente.proceso_id.in_(lawyer_process_ids(db, usuario))
        )
        query = query.filter(
            or_(
                models.SolicitudEdicionPerfilCliente.cliente_id.in_(allowed_clients),
                models.SolicitudEdicionPerfilCliente.cliente_id.in_(assigned_clients),
            )
        )
    return [
        _serializar_solicitud_perfil(item)
        for item in query.order_by(models.SolicitudEdicionPerfilCliente.solicitada_en.asc()).all()
    ]


@router.patch("/solicitudes-edicion-perfil/{solicitud_id}")
def revisar_solicitud_edicion_perfil(
    solicitud_id: int,
    datos: schemas.SolicitudEdicionPerfilClienteRevision,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(
        usuario,
        ["ADMIN", "ABOGADO", "ABOGADO_ADMIN"],
        action="revisar solicitudes de edición de clientes",
    )
    solicitud = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
        id=solicitud_id,
        estado="PENDIENTE",
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud pendiente no encontrada.")
    if not _abogado_puede_gestionar_cliente(usuario, solicitud.cliente, db):
        raise HTTPException(status_code=404, detail="Solicitud pendiente no encontrada.")
    if datos.decision == "APROBAR":
        duplicate = db.query(models.Usuario).filter(
            models.Usuario.email == solicitud.email_solicitado,
            models.Usuario.id != solicitud.cliente_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="El correo solicitado ya pertenece a otra cuenta.")
        solicitud.cliente.email = solicitud.email_solicitado
        solicitud.cliente.nombre_completo = solicitud.nombre_completo_solicitado
        solicitud.cliente.whatsapp_numero = solicitud.whatsapp_numero_solicitado
        solicitud.estado = "APROBADA"
        accion = "cliente.solicitud_perfil.aprobar"
    else:
        solicitud.estado = "RECHAZADA"
        accion = "cliente.solicitud_perfil.rechazar"
    solicitud.revisada_por_id = usuario.id
    solicitud.revisada_en = datetime.utcnow()
    solicitud.comentario_revision = (datos.comentario or "").strip() or None
    registrar_evento_auditoria(
        db, usuario, accion, "solicitud_edicion_perfil", solicitud.id
    )
    db.commit()
    db.refresh(solicitud)
    return {"mensaje": "Solicitud revisada.", "solicitud": _serializar_solicitud_perfil(solicitud)}


@router.get("/clientes/{cliente_id}")
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    cliente = db.query(models.Usuario).filter(models.Usuario.id == cliente_id, models.Usuario.rol == models.RolUsuario.CLIENTE).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        assigned_client = (
            db.query(models.ProcesoCliente.proceso_id)
            .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
            .filter(
                models.ProcesoCliente.cliente_id == cliente.id,
                models.Proceso.id.in_(lawyer_process_ids(db, usuario)),
            )
            .first()
        )
        if cliente.creado_por_abogado_id != responsible_lawyer_id and not assigned_client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    procesos_query = db.query(models.Proceso).join(models.ProcesoCliente).filter(
        models.ProcesoCliente.cliente_id == cliente.id,
        models.Proceso.archivado_en.is_(None),
    )
    tareas_query = db.query(models.Tarea).filter(models.Tarea.cliente_id == cliente.id)
    active_processes = (
        db.query(models.Proceso.id).filter(models.Proceso.archivado_en.is_(None))
        if responsible_lawyer_id is None
        else lawyer_process_ids(db, usuario)
    )
    tareas_query = tareas_query.filter(
        or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso_id.in_(active_processes))
    )
    solicitudes_query = db.query(models.SolicitudDocumento).join(models.Proceso).filter(
        models.SolicitudDocumento.cliente_id == cliente.id,
        models.Proceso.archivado_en.is_(None),
    )
    if responsible_lawyer_id is not None:
        assigned_processes = lawyer_process_ids(db, usuario)
        procesos_query = procesos_query.filter(models.Proceso.id.in_(assigned_processes))
        tareas_query = tareas_query.filter(
            or_(models.Tarea.usuario_id == responsible_lawyer_id, models.Tarea.proceso_id.in_(assigned_processes))
        )
        solicitudes_query = solicitudes_query.filter(models.Proceso.abogado_id == responsible_lawyer_id)
    procesos = procesos_query.all()
    tareas = tareas_query.order_by(models.Tarea.created_at.desc()).all()
    solicitudes = solicitudes_query.order_by(models.SolicitudDocumento.created_at.desc()).all()
    return {"id": cliente.id, "nombre_completo": cliente.nombre_completo, "email": cliente.email, "whatsapp_numero": cliente.whatsapp_numero, "notificaciones_email": cliente.notificaciones_email, "notificaciones_whatsapp": cliente.notificaciones_whatsapp, "procesos": [{"id": p.id, "nombre": p.nombre} for p in procesos], "tareas": [{"id": t.id, "titulo": t.titulo, "estado": t.estado.value, "fecha_limite": t.fecha_limite} for t in tareas], "solicitudes_documento": [{"id": s.id, "titulo": s.titulo, "atendida_en": s.atendida_en, "proceso": s.proceso.nombre} for s in solicitudes]}


@router.put("/clientes/{cliente_id}")
def actualizar_cliente(cliente_id: int, datos: schemas.ClienteUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    cliente_query = db.query(models.Usuario).filter(models.Usuario.id == cliente_id, models.Usuario.rol == models.RolUsuario.CLIENTE)
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        assigned_clients = (
            db.query(models.ProcesoCliente.cliente_id)
            .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
            .filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
        )
        cliente_query = cliente_query.filter(
            or_(
                models.Usuario.creado_por_abogado_id == responsible_lawyer_id,
                models.Usuario.id.in_(assigned_clients),
            )
        )
    cliente = cliente_query.first()
    if not cliente: raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    cliente.nombre_completo = datos.nombre_completo.strip(); cliente.whatsapp_numero = datos.whatsapp_numero.strip()
    registrar_evento_auditoria(db, usuario, "cliente.actualizar", "usuario", cliente.id)
    db.commit(); db.refresh(cliente)
    return {"id": cliente.id, "mensaje": "Cliente actualizado."}


@router.get("/documentos")
def listar_documentos_despacho(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    if usuario.rol == models.RolUsuario.CLIENTE:
        solicitudes_query = (
            db.query(models.SolicitudDocumento)
            .join(models.Proceso, models.Proceso.id == models.SolicitudDocumento.proceso_id)
            .join(
                models.ProcesoCliente,
                models.ProcesoCliente.proceso_id == models.SolicitudDocumento.proceso_id,
            )
            .filter(
                models.SolicitudDocumento.cliente_id == usuario.id,
                models.ProcesoCliente.cliente_id == usuario.id,
                models.Proceso.archivado_en.is_(None),
            )
        )
        documentos_query = (
            db.query(models.DocumentoProceso)
            .join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id)
            .join(
                models.ProcesoCliente,
                models.ProcesoCliente.proceso_id == models.DocumentoProceso.proceso_id,
            )
            .filter(
                models.DocumentoProceso.cliente_id == usuario.id,
                models.ProcesoCliente.cliente_id == usuario.id,
                models.Proceso.archivado_en.is_(None),
            )
        )
    else:
        _abogado(usuario)
        solicitudes_query = db.query(models.SolicitudDocumento).join(models.Proceso).filter(
            models.Proceso.archivado_en.is_(None)
        )
        documentos_query = db.query(models.DocumentoProceso).join(models.Proceso).filter(
            models.Proceso.archivado_en.is_(None)
        )
        responsible_lawyer_id = lawyer_scope_id(usuario)
        if responsible_lawyer_id is not None:
            assigned_processes = lawyer_process_ids(db, usuario)
            solicitudes_query = solicitudes_query.filter(
                models.Proceso.id.in_(assigned_processes)
            )
            documentos_query = documentos_query.filter(
                models.Proceso.id.in_(assigned_processes)
            )
    solicitudes = solicitudes_query.order_by(models.SolicitudDocumento.created_at.desc()).all()
    documentos = documentos_query.order_by(models.DocumentoProceso.created_at.desc()).all()
    return {"solicitudes": [{"id": s.id, "proceso": s.proceso.nombre, "cliente": s.cliente.nombre_completo, "titulo": s.titulo, "instrucciones": s.instrucciones, "atendida_en": s.atendida_en, "created_at": s.created_at} for s in solicitudes], "documentos": [{"id": d.id, "proceso": d.proceso.nombre, "cliente": d.cliente.nombre_completo, "nombre_archivo": d.nombre_archivo, "mime_type": d.mime_type, "created_at": d.created_at} for d in documentos]}


@router.get("/documentos/{documento_id}/archivo")
def descargar_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    query = (
        db.query(models.DocumentoProceso)
        .join(models.Proceso, models.Proceso.id == models.DocumentoProceso.proceso_id)
        .filter(
            models.DocumentoProceso.id == documento_id,
            models.Proceso.archivado_en.is_(None),
        )
    )
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if usuario.rol == models.RolUsuario.CLIENTE:
        query = query.join(
            models.ProcesoCliente,
            models.ProcesoCliente.proceso_id == models.DocumentoProceso.proceso_id,
        ).filter(
            models.DocumentoProceso.cliente_id == usuario.id,
            models.ProcesoCliente.cliente_id == usuario.id,
        )
    else:
        _abogado(usuario)
        if responsible_lawyer_id is not None:
            query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))

    documento = query.first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

    try:
        objeto = storage.get_r2_client().get_object(
            Bucket=storage.get_r2_bucket(),
            Key=documento.ruta_archivo,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible descargar el documento.") from exc

    registrar_evento_auditoria(db, usuario, "documento.descargar", "documento_proceso", documento.id)
    db.commit()
    nombre_archivo = quote(documento.nombre_archivo, safe="")
    return StreamingResponse(
        objeto["Body"],
        media_type=documento.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{nombre_archivo}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/notificaciones")
def listar_notificaciones_despacho(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.NotificacionProceso).join(models.Proceso).filter(
        models.Proceso.archivado_en.is_(None)
    )
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        query = query.filter(
            models.Proceso.id.in_(lawyer_process_ids(db, usuario))
        )
    filas = query.order_by(models.NotificacionProceso.created_at.desc()).all()
    return [{"id": n.id, "proceso": db.query(models.Proceso.nombre).filter(models.Proceso.id == n.proceso_id).scalar(), "cliente": db.query(models.Usuario.nombre_completo).filter(models.Usuario.id == n.cliente_id).scalar(), "comentarios": n.comentarios, "asunto": n.asunto, "cuerpo": n.cuerpo, "created_at": n.created_at} for n in filas]


@router.post("/procesos", status_code=status.HTTP_201_CREATED)
def crear_proceso(datos: schemas.ProcesoCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if not datos.nombre.strip(): raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
    proceso = models.Proceso(abogado_id=usuario.id, nombre=datos.nombre.strip(), descripcion=datos.descripcion)
    db.add(proceso); db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.crear", "proceso", proceso.id)
    db.commit(); db.refresh(proceso)
    return {"id": proceso.id, "nombre": proceso.nombre, "descripcion": proceso.descripcion}


@router.put("/procesos/{proceso_id}")
def actualizar_proceso(proceso_id: int, datos: schemas.ProcesoUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="editar el proceso")
    if datos.nombre is not None:
        if not datos.nombre.strip(): raise HTTPException(status_code=400, detail="El nombre del proceso es obligatorio.")
        proceso.nombre = datos.nombre.strip()
    if datos.descripcion is not None: proceso.descripcion = datos.descripcion
    registrar_evento_auditoria(db, usuario, "proceso.actualizar", "proceso", proceso.id)
    db.commit(); db.refresh(proceso)
    return {"id": proceso.id, "nombre": proceso.nombre, "descripcion": proceso.descripcion}


@router.get("/procesos")
def listar_procesos(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    if usuario.rol == models.RolUsuario.CLIENTE:
        procesos = db.query(models.Proceso).join(models.ProcesoCliente).filter(
            models.ProcesoCliente.cliente_id == usuario.id,
            models.Proceso.archivado_en.is_(None),
        ).all()
    else:
        _abogado(usuario); query = db.query(models.Proceso)
        query = query.filter(models.Proceso.archivado_en.is_(None))
        responsible_lawyer_id = lawyer_scope_id(usuario)
        procesos = (
            query
            if responsible_lawyer_id is None
            else query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
        ).all()
    return [
        {
            "id": proceso.id,
            "nombre": proceso.nombre,
            "descripcion": proceso.descripcion,
            **_equipo_proceso(proceso),
            "soy_responsable": usuario.rol == models.RolUsuario.ADMIN or usuario.id == proceso.abogado_id,
            "radicados": [
                {
                    "id": enlace.radicado.id,
                    "numero": enlace.radicado.numero,
                    "estado_consulta": enlace.radicado.estado_consulta,
                    "actuaciones": [
                        {
                            "id": actuacion.id,
                            "fecha_actuacion": actuacion.fecha_actuacion,
                            "actuacion": actuacion.actuacion,
                            **(
                                {"anotacion": actuacion.anotacion}
                                if usuario.rol != models.RolUsuario.CLIENTE
                                else {}
                            ),
                        }
                        for actuacion in sorted(enlace.radicado.actuaciones, key=lambda item: item.orden)
                    ],
                }
                for enlace in proceso.radicados
                if enlace.radicado
            ],
        }
        for proceso in procesos
    ]


@router.get("/procesos/archivados")
def listar_procesos_archivados(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    query = db.query(models.Proceso).filter(models.Proceso.archivado_en.is_not(None))
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        query = query.filter(models.Proceso.abogado_id == responsible_lawyer_id)
    return [
        {
            "id": proceso.id,
            "nombre": proceso.nombre,
            "descripcion": proceso.descripcion,
            "archivado_en": proceso.archivado_en,
            "radicados": [
                {
                    "id": enlace.radicado.id,
                    "numero": enlace.radicado.numero,
                    "actuaciones": [{"id": actuacion.id} for actuacion in enlace.radicado.actuaciones],
                }
                for enlace in proceso.radicados
                if enlace.radicado
            ],
            "radicados_count": len(proceso.radicados),
            "clientes_count": len(proceso.clientes),
        }
        for proceso in query.order_by(models.Proceso.archivado_en.desc()).all()
    ]


@router.get("/procesos/{proceso_id}")
def obtener_proceso_detalle(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    tareas = (
        db.query(models.Tarea)
        .filter(
            models.Tarea.proceso_id == proceso.id,
        )
        .order_by(models.Tarea.created_at.desc())
        .all()
    )
    tareas = [
        tarea for tarea in tareas
        if tarea.cliente_id is None
        or (tarea.cliente_asignado is not None and tarea.cliente_asignado.rol == models.RolUsuario.CLIENTE)
    ]
    notificaciones = (
        db.query(models.NotificacionProceso, models.Usuario.nombre_completo)
        .join(models.Usuario, models.Usuario.id == models.NotificacionProceso.cliente_id)
        .filter(models.NotificacionProceso.proceso_id == proceso.id)
        .order_by(models.NotificacionProceso.created_at.desc())
        .limit(10)
        .all()
    )
    puede_gestionar_equipo = is_process_manager(usuario, proceso.abogado_id)
    abogados_disponibles = []
    if puede_gestionar_equipo and proceso.abogado.rol == models.RolUsuario.ABOGADO_ADMIN:
        assigned_ids = {enlace.abogado_id for enlace in proceso.colaboradores}
        abogados_disponibles = [
            {"id": abogado.id, "nombre_completo": abogado.nombre_completo}
            for abogado in db.query(models.Usuario)
            .filter(
                models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
                models.Usuario.estado == models.EstadoUsuario.ACTIVO,
                models.Usuario.id != proceso.abogado_id,
            )
            .order_by(models.Usuario.nombre_completo)
            .all()
            if abogado.id not in assigned_ids
        ]
    return {
        "id": proceso.id, "nombre": proceso.nombre, "descripcion": proceso.descripcion,
        **_equipo_proceso(proceso),
        "soy_responsable": usuario.rol == models.RolUsuario.ADMIN or usuario.id == proceso.abogado_id,
        "puede_gestionar_equipo": puede_gestionar_equipo,
        "abogados_disponibles": abogados_disponibles,
        "radicados": [{"id": enlace.radicado.id, "numero": enlace.radicado.numero, "estado_consulta": enlace.radicado.estado_consulta, "actuaciones": [{"id": a.id, "fecha_actuacion": a.fecha_actuacion, "actuacion": a.actuacion, "anotacion": a.anotacion} for a in sorted(enlace.radicado.actuaciones, key=lambda a: a.orden)]} for enlace in proceso.radicados if enlace.radicado],
        "clientes": [{"id": enlace.cliente.id, "nombre_completo": enlace.cliente.nombre_completo, "email": enlace.cliente.email, "whatsapp_numero": enlace.cliente.whatsapp_numero} for enlace in proceso.clientes if enlace.cliente and enlace.cliente.rol == models.RolUsuario.CLIENTE],
        "tareas": [{"id": t.id, "titulo": t.titulo, "estado": t.estado.value, "prioridad": t.prioridad.value, "cliente_id": t.cliente_id, "fecha_limite": t.fecha_limite} for t in tareas],
        "solicitudes_documento": [{"id": s.id, "titulo": s.titulo, "instrucciones": s.instrucciones, "cliente_id": s.cliente_id, "cliente": s.cliente.nombre_completo, "atendida_en": s.atendida_en, "created_at": s.created_at} for s in proceso.solicitudes_documento if s.cliente and s.cliente.rol == models.RolUsuario.CLIENTE],
        "documentos": [{"id": d.id, "nombre_archivo": d.nombre_archivo, "cliente": d.cliente.nombre_completo, "mime_type": d.mime_type, "created_at": d.created_at} for d in proceso.documentos if d.cliente and d.cliente.rol == models.RolUsuario.CLIENTE],
        "notificaciones": [
            {
                "id": notificacion.id,
                "cliente": nombre_cliente,
                "asunto": notificacion.asunto,
                "cuerpo": notificacion.cuerpo,
                "created_at": notificacion.created_at,
            }
            for notificacion, nombre_cliente in notificaciones
        ],
    }


@router.post("/procesos/{proceso_id}/colaboradores", status_code=status.HTTP_201_CREATED)
def asignar_colaborador_proceso(
    proceso_id: int,
    datos: schemas.ProcesoColaboradorCreate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="gestionar el equipo del proceso")
    if proceso.abogado.rol != models.RolUsuario.ABOGADO_ADMIN:
        raise HTTPException(status_code=400, detail="Los procesos SaaS individuales no admiten colaboradores.")
    if datos.abogado_id == proceso.abogado_id:
        raise HTTPException(status_code=400, detail="El responsable ya pertenece al equipo del proceso.")
    abogado = db.query(models.Usuario).filter(
        models.Usuario.id == datos.abogado_id,
        models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
        models.Usuario.estado == models.EstadoUsuario.ACTIVO,
    ).first()
    if not abogado:
        raise HTTPException(status_code=404, detail="Solo se pueden asignar abogados activos de la firma.")
    if db.query(models.ProcesoColaborador).filter_by(
        proceso_id=proceso.id, abogado_id=abogado.id
    ).first():
        raise HTTPException(status_code=409, detail="El abogado ya está asignado al proceso.")
    db.add(models.ProcesoColaborador(
        proceso_id=proceso.id,
        abogado_id=abogado.id,
        asignado_por_id=usuario.id,
    ))
    registrar_evento_auditoria(db, usuario, "proceso.colaborador.asignar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": f"{abogado.nombre_completo} fue asignado al proceso."}


@router.delete("/procesos/{proceso_id}/colaboradores/{abogado_id}")
def retirar_colaborador_proceso(
    proceso_id: int,
    abogado_id: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="gestionar el equipo del proceso")
    colaboracion = db.query(models.ProcesoColaborador).filter_by(
        proceso_id=proceso.id, abogado_id=abogado_id
    ).first()
    if not colaboracion:
        raise HTTPException(status_code=404, detail="El abogado no está asignado al proceso.")
    registrar_evento_auditoria(db, usuario, "proceso.colaborador.retirar", "proceso", proceso.id)
    db.delete(colaboracion)
    db.commit()
    return {"mensaje": "Acceso del colaborador retirado."}


@router.delete("/procesos/{proceso_id}")
def eliminar_proceso(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    require_process_manager(usuario, proceso.abogado_id, action="archivar el proceso")
    proceso.archivado_en = datetime.now(timezone.utc)
    registrar_evento_auditoria(db, usuario, "proceso.archivar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Proceso archivado. Puedes restaurarlo desde la lista de archivados."}


@router.patch("/procesos/{proceso_id}/restaurar")
def restaurar_proceso(
    proceso_id: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db, incluir_archivado=True)
    require_process_manager(usuario, proceso.abogado_id, action="restaurar el proceso")
    proceso.archivado_en = None
    registrar_evento_auditoria(db, usuario, "proceso.restaurar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Proceso restaurado."}


@router.delete("/procesos/{proceso_id}/clientes/{cliente_id}")
def retirar_cliente(proceso_id: int, cliente_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    enlace = db.query(models.ProcesoCliente).filter_by(proceso_id=proceso.id, cliente_id=cliente_id).first()
    if not enlace: raise HTTPException(status_code=404, detail="El cliente no está asignado al proceso.")
    registrar_evento_auditoria(db, usuario, "proceso.cliente.retirar", "proceso_cliente", f"{proceso.id}:{cliente_id}")
    db.delete(enlace); db.commit()
    return {"mensaje": "Cliente retirado del proceso."}


@router.delete("/procesos/{proceso_id}/radicados/{radicado_id}")
def retirar_radicado(proceso_id: int, radicado_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    enlace = db.query(models.ProcesoRadicado).filter_by(proceso_id=proceso.id, radicado_id=radicado_id).first()
    if not enlace: raise HTTPException(status_code=404, detail="El radicado no está asociado al proceso.")
    registrar_evento_auditoria(db, usuario, "proceso.radicado.retirar", "proceso_radicado", f"{proceso.id}:{radicado_id}")
    db.delete(enlace); db.commit()
    return {"mensaje": "Radicado retirado del proceso."}


@router.post("/procesos/{proceso_id}/radicados/{radicado_id}")
def asignar_radicado(proceso_id: int, radicado_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    if not proceso.abogado:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    radicado_query = db.query(models.Radicado).filter(models.Radicado.id == radicado_id)
    if proceso.abogado.rol == models.RolUsuario.ABOGADO:
        radicado_query = radicado_query.filter(models.Radicado.usuario_id == proceso.abogado_id)
    elif proceso.abogado.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
        radicado_query = radicado_query.join(
            models.Usuario, models.Usuario.id == models.Radicado.usuario_id
        ).filter(models.Usuario.rol.in_((models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN)))
    else:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    radicado = radicado_query.first()
    if not radicado: raise HTTPException(status_code=404, detail="Radicado no encontrado en la firma.")
    if not db.query(models.ProcesoRadicado).filter_by(proceso_id=proceso.id, radicado_id=radicado.id).first():
        db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
        registrar_evento_auditoria(db, usuario, "proceso.radicado.asignar", "proceso_radicado", f"{proceso.id}:{radicado.id}")
        db.commit()
    return {"mensaje": "Radicado asignado al proceso."}


@router.post("/procesos/{proceso_id}/radicados", status_code=status.HTTP_201_CREATED)
def crear_y_asignar_radicado(
    proceso_id: int,
    datos: schemas.RadicadoCreate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    """Crea el radicado del abogado y lo vincula al proceso de forma atómica."""
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    numero = datos.numero.strip()
    if not numero.isdigit() or len(numero) != 23:
        raise HTTPException(status_code=400, detail="El radicado debe tener exactamente 23 dígitos.")
    if db.query(models.Radicado).filter(models.Radicado.numero == numero).first():
        raise HTTPException(status_code=400, detail="Este radicado ya existe en la firma.")
    radicado = models.Radicado(numero=numero, usuario_id=proceso.abogado_id, estado_consulta="sin consultar")
    db.add(radicado); db.flush()
    db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
    registrar_evento_auditoria(db, usuario, "radicado.crear_en_proceso", "radicado", radicado.id)
    db.commit(); db.refresh(radicado)
    return {"id": radicado.id, "numero": radicado.numero, "mensaje": "Radicado creado y asociado al proceso."}


@router.post("/procesos/{proceso_id}/clientes/{cliente_id}")
def asignar_cliente(proceso_id: int, cliente_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db)
    if not proceso.abogado:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    cliente_query = db.query(models.Usuario).filter(
        models.Usuario.id == cliente_id,
        models.Usuario.rol == models.RolUsuario.CLIENTE,
    )
    if proceso.abogado.rol == models.RolUsuario.ABOGADO:
        cliente_query = cliente_query.filter(
            models.Usuario.creado_por_abogado_id == proceso.abogado_id
        )
    elif proceso.abogado.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
        firm_lawyer_ids = db.query(models.Usuario.id).filter(
            models.Usuario.rol.in_((models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN))
        )
        cliente_query = cliente_query.filter(
            models.Usuario.creado_por_abogado_id.in_(firm_lawyer_ids)
        )
    else:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    cliente = cliente_query.first()
    if not cliente: raise HTTPException(status_code=404, detail="Cliente no disponible para este abogado.")
    if not db.query(models.ProcesoCliente).filter_by(proceso_id=proceso.id, cliente_id=cliente.id).first():
        db.add(models.ProcesoCliente(proceso_id=proceso.id, cliente_id=cliente.id))
        registrar_evento_auditoria(db, usuario, "proceso.cliente.asignar", "proceso_cliente", f"{proceso.id}:{cliente.id}")
        db.commit()
    return {"mensaje": "Cliente asignado al proceso."}


@router.post("/procesos/{proceso_id}/actuaciones/{actuacion_id}/notificar")
def notificar_actuacion(proceso_id: int, actuacion_id: int, datos: schemas.NotificacionActuacionCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db); cliente = _cliente_asignado(proceso, datos.cliente_id, db)
    actuacion = db.query(models.Actuacion).join(models.ProcesoRadicado).filter(models.Actuacion.id == actuacion_id, models.ProcesoRadicado.proceso_id == proceso.id, models.ProcesoRadicado.radicado_id == models.Actuacion.radicado_id).first()
    if not actuacion: raise HTTPException(status_code=404, detail="La actuación no corresponde al proceso.")
    cuerpo = f"El abogado {usuario.nombre_completo} le notifica de esta actuación en el proceso {proceso.nombre} con N° radicado {actuacion.radicado_rel.numero}.\n\nActuación: {actuacion.actuacion}\nComentarios del abogado: {datos.comentarios}"
    asunto = f"Actualización del proceso {proceso.nombre}"
    _notificar(cliente, asunto, cuerpo, usuario, "notificaciones_whatsapp_procesos")
    db.add(models.NotificacionProceso(
        abogado_id=usuario.id, proceso_id=proceso.id, cliente_id=cliente.id,
        actuacion_id=actuacion.id, comentarios=datos.comentarios,
        asunto=asunto, cuerpo=cuerpo,
    ))
    db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.notificacion.enviar", "proceso", proceso.id)
    db.commit()
    return {"mensaje": "Notificación enviada según las preferencias del cliente."}


@router.post("/procesos/{proceso_id}/solicitudes-documento", status_code=status.HTTP_201_CREATED)
def solicitar_documento(proceso_id: int, datos: schemas.SolicitudDocumentoCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db); cliente = _cliente_asignado(proceso, datos.cliente_id, db)
    solicitud = models.SolicitudDocumento(proceso_id=proceso.id, cliente_id=datos.cliente_id, titulo=datos.titulo.strip(), instrucciones=datos.instrucciones)
    db.add(solicitud); db.flush()
    registrar_evento_auditoria(db, usuario, "documento.solicitar", "solicitud_documento", solicitud.id)
    db.commit(); db.refresh(solicitud)
    _notificar(
        cliente,
        f"Documento solicitado: {proceso.nombre}",
        f"{usuario.nombre_completo} le solicitó: {solicitud.titulo}. {solicitud.instrucciones or ''}",
        usuario,
        "notificaciones_whatsapp_procesos",
    )
    return {"id": solicitud.id, "mensaje": "Solicitud enviada al cliente."}


@router.post("/solicitudes-documento/{solicitud_id}/archivo", status_code=status.HTTP_201_CREATED)
def cargar_documento_cliente(solicitud_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    if usuario.rol != models.RolUsuario.CLIENTE: raise HTTPException(status_code=403, detail="Solo el cliente puede cargar este documento.")
    solicitud = (
        db.query(models.SolicitudDocumento)
        .join(models.Proceso)
        .join(
            models.ProcesoCliente,
            models.ProcesoCliente.proceso_id == models.SolicitudDocumento.proceso_id,
        )
        .filter(
            models.SolicitudDocumento.id == solicitud_id,
            models.SolicitudDocumento.cliente_id == usuario.id,
            models.ProcesoCliente.cliente_id == usuario.id,
            models.Proceso.archivado_en.is_(None),
        )
        .first()
    )
    if not solicitud or solicitud.atendida_en: raise HTTPException(status_code=404, detail="Solicitud de documento no disponible.")
    if archivo.content_type not in ALLOWED_DOCUMENT_TYPES: raise HTTPException(status_code=400, detail="Tipo de documento no permitido.")
    contenido = archivo.file.read(MAX_DOCUMENT_BYTES + 1)
    if not contenido or len(contenido) > MAX_DOCUMENT_BYTES: raise HTTPException(status_code=400, detail="El archivo debe pesar máximo 15 MB.")
    if not _document_content_matches_type(archivo.content_type, contenido): raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo.")
    extension = os.path.splitext(archivo.filename or "")[1].lower(); clave = f"procesos/{solicitud.proceso_id}/clientes/{usuario.id}/{uuid4().hex}{extension}"
    cliente_r2 = storage.get_r2_client()
    bucket = storage.get_r2_bucket()
    try: cliente_r2.put_object(Bucket=bucket, Key=clave, Body=contenido, ContentType=archivo.content_type)
    except (BotoCoreError, ClientError) as exc: raise HTTPException(status_code=502, detail="No fue posible guardar el documento.") from exc
    try:
        documento = models.DocumentoProceso(proceso_id=solicitud.proceso_id, cliente_id=usuario.id, solicitud_id=solicitud.id, nombre_archivo=archivo.filename or "documento", ruta_archivo=clave, mime_type=archivo.content_type)
        solicitud.atendida_en = datetime.utcnow()
        db.add(documento)
        db.flush()
        registrar_evento_auditoria(db, usuario, "documento.cargar", "documento_proceso", documento.id)
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            logger.exception("No se pudo revertir la transacción de carga documental.")
        try:
            cliente_r2.delete_object(Bucket=bucket, Key=clave)
        except Exception:
            logger.exception("No se pudo limpiar el objeto R2 tras fallar la transacción documental.")
        raise
    db.refresh(documento)
    return {"id": documento.id, "nombre_archivo": documento.nombre_archivo}
