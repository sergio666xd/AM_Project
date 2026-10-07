"""Procesos de abogados, acceso de clientes y colaboración documental."""

import logging
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

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
from app.notification_service import emitir_notificacion_workflow
from app.workflow_service import public_site_url
from app.radicados import (
    ambito_radicado_usuario,
    iniciar_consulta_nuevo_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
)
from app.firm_access import (
    has_firm_wide_access,
    is_process_manager,
    lawyer_process_ids,
    lawyer_scope_id,
    require_process_access,
    require_process_manager,
    require_roles,
)

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


def _timeline_proceso(proceso: models.Proceso, db: Session, cliente_id: int | None = None) -> list[dict]:
    items: list[dict] = [{"id": f"proceso:{proceso.id}", "tipo": "PROCESO", "titulo": "Proceso creado",
                          "descripcion": proceso.nombre, "actor": proceso.abogado.nombre_completo if proceso.abogado else None,
                          "recurso": "Proceso", "recurso_id": proceso.id, "visibilidad": "INTERNA", "fecha": proceso.created_at}]
    if cliente_id is None:
        for audit in db.query(models.EventoAuditoria).filter_by(tipo_recurso="proceso", recurso_id=str(proceso.id)).all():
            if audit.accion == "proceso.crear":
                continue
            actor = db.query(models.Usuario).filter_by(id=audit.actor_id).first() if audit.actor_id else None
            items.append({"id": f"auditoria:{audit.id}", "tipo": "PROCESO", "titulo": "Proceso actualizado",
                          "descripcion": audit.accion.replace(".", " "), "actor": actor.nombre_completo if actor else None,
                          "recurso": "Proceso", "recurso_id": proceso.id, "visibilidad": "INTERNA", "fecha": audit.created_at})
    radicado_ids = [enlace.radicado_id for enlace in proceso.radicados]
    for tarea in db.query(models.Tarea).filter(models.Tarea.proceso_id == proceso.id).all():
        if cliente_id is not None and tarea.cliente_id != cliente_id:
            continue
        items.append({"id": f"tarea:{tarea.id}", "tipo": "TAREA", "titulo": tarea.titulo,
                      "descripcion": "Tarea asignada al cliente" if tarea.cliente_id else "Tarea interna del proceso",
                      "actor": tarea.usuario.nombre_completo if tarea.usuario else None,
                      "recurso": "Tarea", "recurso_id": tarea.id,
                      "visibilidad": "CLIENTE" if tarea.cliente_id else "INTERNA", "fecha": tarea.created_at})
    events_query = db.query(models.EventoAgenda).filter(models.EventoAgenda.proceso_id == proceso.id)
    if cliente_id is not None:
        events_query = events_query.filter(models.EventoAgenda.cliente_id == cliente_id)
    for event in events_query.all():
        items.append({"id": f"evento:{event.id}", "tipo": event.tipo, "titulo": event.titulo,
                      "descripcion": event.descripcion or "Evento de agenda programado", "actor": event.responsable.nombre_completo if event.responsable else None,
                      "recurso": "Agenda", "recurso_id": event.id,
                      "visibilidad": "CLIENTE" if event.cliente_id else "INTERNA", "fecha": event.fecha_inicio})
    for solicitud in db.query(models.SolicitudDocumento).filter(models.SolicitudDocumento.proceso_id == proceso.id).all():
        if cliente_id is not None and solicitud.cliente_id != cliente_id:
            continue
        items.append({"id": f"solicitud:{solicitud.id}", "tipo": "DOCUMENTO", "titulo": solicitud.titulo,
                      "descripcion": "Solicitud documental atendida" if solicitud.atendida_en else "Documento solicitado al cliente",
                      "actor": None, "recurso": "Solicitud de documento", "recurso_id": solicitud.id,
                      "visibilidad": "CLIENTE", "fecha": solicitud.atendida_en or solicitud.created_at})
    docs_query = db.query(models.DocumentoProceso).filter(models.DocumentoProceso.proceso_id == proceso.id)
    if cliente_id is not None:
        docs_query = docs_query.filter(models.DocumentoProceso.cliente_id == cliente_id)
    for documento in docs_query.all():
        items.append({"id": f"documento:{documento.id}", "tipo": "DOCUMENTO", "titulo": documento.nombre_archivo,
                      "descripcion": "Documento recibido" if documento.cliente_id else "Documento incorporado al proceso",
                      "actor": documento.cliente.nombre_completo if documento.cliente else None,
                      "recurso": "Documento", "recurso_id": documento.id,
                      "visibilidad": "CLIENTE" if documento.cliente_id else "INTERNA", "fecha": documento.created_at})
    if radicado_ids:
        actuaciones = db.query(models.Actuacion).filter(models.Actuacion.radicado_id.in_(radicado_ids)).all()
        for actuacion in actuaciones:
            try:
                fecha = datetime.fromisoformat(actuacion.fecha_registro or actuacion.fecha_actuacion)
            except (TypeError, ValueError):
                continue
            if fecha.tzinfo is not None:
                fecha = fecha.astimezone(timezone.utc).replace(tzinfo=None)
            items.append({"id": f"actuacion:{actuacion.id}", "tipo": "ACTUACION", "titulo": actuacion.actuacion or "Actuación judicial",
                          "descripcion": actuacion.anotacion or "Nueva actuación registrada en el radicado",
                          "actor": "Rama Judicial", "recurso": "Actuación", "recurso_id": actuacion.id,
                          "visibilidad": "CLIENTE", "fecha": fecha})
    communications_query = db.query(models.ComunicacionProceso).filter(models.ComunicacionProceso.proceso_id == proceso.id)
    if cliente_id is not None:
        communications_query = communications_query.filter(
            models.ComunicacionProceso.visibilidad == "CLIENTE",
            models.ComunicacionProceso.cliente_id == cliente_id,
        )
    for communication in communications_query.all():
        items.append({"id": f"comunicacion:{communication.id}", "tipo": "COMUNICACION", "titulo": communication.asunto,
                      "descripcion": communication.contenido, "actor": communication.actor.nombre_completo if communication.actor else None,
                      "recurso": "Comunicación" if communication.visibilidad == "CLIENTE" else "Nota interna",
                      "recurso_id": communication.id, "visibilidad": communication.visibilidad,
                      "canal": communication.canal, "cliente": communication.cliente.nombre_completo if communication.cliente else None,
                      "fecha": communication.created_at})
    if cliente_id is None:
        for notice in db.query(models.NotificacionProceso).filter(models.NotificacionProceso.proceso_id == proceso.id).all():
            cliente = db.query(models.Usuario).filter_by(id=notice.cliente_id).first()
            actor = db.query(models.Usuario).filter_by(id=notice.abogado_id).first()
            items.append({"id": f"aviso:{notice.id}", "tipo": "COMUNICACION", "titulo": notice.asunto,
                          "descripcion": notice.cuerpo, "actor": actor.nombre_completo if actor else None,
                          "recurso": "Aviso al cliente", "recurso_id": notice.id, "visibilidad": "CLIENTE",
                          "cliente": cliente.nombre_completo if cliente else None, "fecha": notice.created_at})
    else:
        for notice in db.query(models.NotificacionProceso).filter_by(proceso_id=proceso.id, cliente_id=cliente_id).all():
            items.append({"id": f"aviso:{notice.id}", "tipo": "COMUNICACION", "titulo": notice.asunto,
                          "descripcion": notice.cuerpo, "actor": None, "recurso": "Aviso al cliente",
                          "recurso_id": notice.id, "visibilidad": "CLIENTE", "fecha": notice.created_at})
    return sorted(items, key=lambda item: item["fecha"] or datetime.min, reverse=True)


def _serializar_evento_firma(evento: models.EventoAgenda) -> dict:
    return {"id": evento.id, "titulo": evento.titulo, "descripcion": evento.descripcion, "tipo": evento.tipo,
            "estado": evento.estado, "fecha_inicio": evento.fecha_inicio, "fecha_fin": evento.fecha_fin,
            "responsable_id": evento.responsable_id, "responsable": evento.responsable.nombre_completo if evento.responsable else None,
            "proceso_id": evento.proceso_id, "proceso": evento.proceso.nombre if evento.proceso else None,
            "cliente_id": evento.cliente_id, "cliente": evento.cliente.nombre_completo if evento.cliente else None}


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
    db: Session,
    usuario: models.Usuario,
    asunto: str,
    cuerpo: str,
    tipo: str,
    origen: str,
    emisor: models.Usuario | None = None,
    incluir_email: bool = True,
) -> None:
    emitir_notificacion_workflow(
        db,
        usuario,
        tipo,
        origen,
        asunto,
        cuerpo,
        emisor=emisor,
        incluir_email=incluir_email,
    )


def _notificar_clientes_proceso(
    db: Session,
    proceso: models.Proceso,
    actor: models.Usuario,
    asunto: str,
    accion: str,
    detalle: str,
    ancla: str,
    tipo: str = "RESUMENES",
    cliente: models.Usuario | None = None,
) -> None:
    destinatarios = [cliente] if cliente else [
        link.cliente for link in proceso.clientes
        if link.cliente and link.cliente.rol == models.RolUsuario.CLIENTE
        and link.cliente.estado == models.EstadoUsuario.ACTIVO
    ]
    for destinatario in destinatarios:
        cuerpo = (
            f"Hola {destinatario.nombre_completo},\n\n"
            f"{actor.nombre_completo} {accion} en el proceso {proceso.nombre}.\n\n"
            f"Proceso: {proceso.nombre}\n"
            f"Fecha y hora: {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}\n"
            f"Detalle: {detalle}\n\n"
            f"Este mensaje resume un cambio relacionado con tu expediente.\n\n"
            f"Abrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}"
        )
        _notificar(db, destinatario, asunto, cuerpo, tipo,
                   f"ACCION_PROCESO:{proceso.id}:{uuid4().hex}", emisor=actor)


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
    _notificar(
        db,
        abogado,
        "Acceso de abogado administrador",
        "Su acceso fue creado. Cambie la contraseña temporal al ingresar.",
        "ACCESO",
        f"USUARIO:{abogado.id}:ACCESO",
        emisor=usuario,
    )
    return {"id": abogado.id, "email": abogado.email, "debe_cambiar_password": True}


@router.post("/clientes", status_code=status.HTTP_201_CREATED)
def crear_cliente(datos: schemas.ClienteCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if db.query(models.Usuario).filter(models.Usuario.email == str(datos.email).lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    if datos.canal_envio == "WHATSAPP" and not datos.whatsapp_numero.strip():
        raise HTTPException(status_code=400, detail="Ingresa un número de WhatsApp para enviar las credenciales por ese canal.")
    cliente = models.Usuario(email=str(datos.email).lower(), nombre_completo=datos.nombre_completo.strip(), whatsapp_numero=datos.whatsapp_numero.strip(), password_hash=security.hash_password(datos.password_temporal), rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO, creado_por_abogado_id=usuario.id, debe_cambiar_password=True, notificaciones_email=True, notificaciones_whatsapp=False, canal_notificacion_cliente=datos.canal_envio)
    db.add(cliente); db.flush()
    registrar_evento_auditoria(db, usuario, "cliente.crear", "usuario", cliente.id)
    db.commit(); db.refresh(cliente)
    _notificar(
        db,
        cliente,
        "Acceso a sus procesos",
        f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} creó tu acceso al portal de gestión de procesos.\n\nTus credenciales temporales son:\nUsuario: {cliente.email}\nContraseña temporal: {datos.password_temporal}\n\nAl iniciar sesión tendrás que cambiar esta contraseña. No compartas estas credenciales.\n\nCanal elegido para futuras notificaciones: {datos.canal_envio}.\n\nAbrir enlace: Ingresar al portal | {public_site_url()}/gestion-procesos/auth/login",
        "ACCESO",
        f"USUARIO:{cliente.id}:ACCESO",
        emisor=usuario,
        incluir_email=False,
    )
    return {"id": cliente.id, "email": cliente.email, "debe_cambiar_password": True, "canal_envio": datos.canal_envio, "mensaje": "Cliente creado y credenciales programadas para envío."}


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
    process_names = {p.id: p.nombre for p in procesos}
    tareas = tareas_query.order_by(models.Tarea.created_at.desc()).all()
    solicitudes = solicitudes_query.order_by(models.SolicitudDocumento.created_at.desc()).all()
    process_ids = [p.id for p in procesos]
    comunicaciones_query = db.query(models.ComunicacionProceso).filter(
        models.ComunicacionProceso.proceso_id.in_(process_ids or [-1]),
        or_(
            models.ComunicacionProceso.visibilidad == "INTERNA",
            (models.ComunicacionProceso.visibilidad == "CLIENTE")
            & (models.ComunicacionProceso.cliente_id == cliente.id),
        ),
    )
    comunicaciones = comunicaciones_query.order_by(models.ComunicacionProceso.created_at.desc()).limit(50).all()
    avisos_query = db.query(models.NotificacionProceso).filter(models.NotificacionProceso.cliente_id == cliente.id)
    avisos_query = avisos_query.filter(models.NotificacionProceso.proceso_id.in_(process_ids or [-1]))
    avisos = avisos_query.order_by(models.NotificacionProceso.created_at.desc()).limit(50).all()
    actividad = [
        {"tipo": "comunicacion", "titulo": item.asunto, "descripcion": item.contenido,
         "fecha": item.created_at, "visibilidad": item.visibilidad,
         "proceso_id": item.proceso_id, "proceso": item.proceso.nombre,
         "actor": item.actor.nombre_completo if item.actor else "Equipo jurídico"}
        for item in comunicaciones
    ]
    actividad.extend(
        {"tipo": "tarea", "titulo": t.titulo, "descripcion": f"Tarea {t.estado.value.lower()}.",
         "fecha": t.created_at, "visibilidad": "INTERNA", "proceso_id": t.proceso_id,
         "proceso": t.proceso.nombre if t.proceso else None, "actor": None}
        for t in tareas[:20]
    )
    actividad.extend(
        {"tipo": "documento", "titulo": s.titulo,
         "descripcion": "Documento recibido" if s.atendida_en else "Solicitud de documento pendiente",
         "fecha": s.atendida_en or s.created_at, "visibilidad": "CLIENTE",
         "proceso_id": s.proceso_id, "proceso": s.proceso.nombre, "actor": None}
        for s in solicitudes[:20]
    )
    actividad.extend(
        {"tipo": "comunicacion", "titulo": aviso.asunto, "descripcion": aviso.cuerpo,
         "fecha": aviso.created_at, "visibilidad": "CLIENTE", "proceso_id": aviso.proceso_id,
         "proceso": process_names.get(aviso.proceso_id),
         "actor": (db.query(models.Usuario.nombre_completo).filter_by(id=aviso.abogado_id).scalar() or "Equipo jurídico")}
        for aviso in avisos
    )
    actividad.sort(key=lambda item: item["fecha"] or datetime.min, reverse=True)
    ultimo_contacto = max(
        [item.created_at for item in comunicaciones + avisos if item.created_at],
        default=None,
    )
    return {
        "id": cliente.id, "nombre_completo": cliente.nombre_completo, "email": cliente.email,
        "whatsapp_numero": cliente.whatsapp_numero, "canal_notificacion_cliente": cliente.canal_notificacion_cliente,
        "estado_relacion": "ACTIVO" if procesos else "SIN_PROCESOS",
        "ultimo_contacto": ultimo_contacto,
        "procesos": [{"id": p.id, "nombre": p.nombre} for p in procesos],
        "tareas": [{"id": t.id, "titulo": t.titulo, "estado": t.estado.value, "fecha_limite": t.fecha_limite, "proceso_id": t.proceso_id} for t in tareas],
        "solicitudes_documento": [{"id": s.id, "titulo": s.titulo, "atendida_en": s.atendida_en, "proceso": s.proceso.nombre, "created_at": s.created_at} for s in solicitudes],
        "actividad": [{**item, "fecha": item["fecha"].isoformat() if item["fecha"] else None} for item in actividad[:50]],
        "comunicaciones": [{"id": f"comunicacion:{item.id}", "asunto": item.asunto, "contenido": item.contenido,
            "visibilidad": item.visibilidad, "canal": item.canal, "created_at": item.created_at,
            "proceso_id": item.proceso_id, "proceso": item.proceso.nombre,
            "actor": item.actor.nombre_completo if item.actor else "Equipo jurídico"} for item in comunicaciones]
            + [{"id": f"aviso:{item.id}", "asunto": item.asunto, "contenido": item.cuerpo,
               "visibilidad": "CLIENTE", "canal": "NOTIFICACION", "created_at": item.created_at,
               "proceso_id": item.proceso_id, "proceso": process_names.get(item.proceso_id),
               "actor": db.query(models.Usuario.nombre_completo).filter_by(id=item.abogado_id).scalar() or "Equipo jurídico"} for item in avisos],
    }


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
    return {"solicitudes": [{"id": s.id, "proceso": s.proceso.nombre, "proceso_id": s.proceso_id, "cliente": s.cliente.nombre_completo, "cliente_id": s.cliente_id, "titulo": s.titulo, "instrucciones": s.instrucciones, "atendida_en": s.atendida_en, "fecha_limite": s.fecha_limite, "created_at": s.created_at} for s in solicitudes], "documentos": [{"id": d.id, "proceso": d.proceso.nombre, "proceso_id": d.proceso_id, "cliente": d.cliente.nombre_completo, "cliente_id": d.cliente_id, "solicitud_id": d.solicitud_id, "nombre_archivo": d.nombre_archivo, "mime_type": d.mime_type, "estado_revision": d.estado_revision, "comentario_revision": d.comentario_revision, "created_at": d.created_at} for d in documentos]}


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


@router.patch("/documentos/{documento_id}/revision")
def revisar_documento(documento_id: int, datos: schemas.DocumentoRevisionUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.DocumentoProceso).join(models.Proceso).filter(
        models.DocumentoProceso.id == documento_id, models.Proceso.archivado_en.is_(None)
    )
    if usuario.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
    documento = query.first()
    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    documento.estado_revision = datos.estado_revision
    documento.comentario_revision = datos.comentario_revision.strip() or None
    documento.revisado_por_id = usuario.id
    documento.revisado_en = datetime.utcnow()
    if datos.estado_revision == "REQUIERE_CORRECCION":
        documento.solicitud.atendida_en = None
    elif datos.estado_revision in {"APROBADO", "RECHAZADO"}:
        documento.solicitud.atendida_en = documento.solicitud.atendida_en or datetime.utcnow()
    registrar_evento_auditoria(db, usuario, "documento.revisar", "documento_proceso", documento.id)
    db.commit()
    cliente = documento.cliente
    if cliente and cliente.estado == models.EstadoUsuario.ACTIVO:
        _notificar(
            db, cliente, f"Documento revisado: {documento.nombre_archivo}",
            f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} revis? el documento {documento.nombre_archivo} del proceso {documento.proceso.nombre}.\n\nEstado: {documento.estado_revision}\nComentario: {documento.comentario_revision or 'Sin comentarios adicionales'}\nFecha de revisi?n: {documento.revisado_en.strftime('%d/%m/%Y %H:%M UTC')}\n\nAbrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{documento.proceso_id}",
            "DOCUMENTOS", f"REVISION_DOCUMENTO:{documento.id}:{documento.estado_revision}", emisor=usuario,
        )
    return {"id": documento.id, "estado_revision": documento.estado_revision, "comentario_revision": documento.comentario_revision, "mensaje": "Revisión guardada."}


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


def _notificaciones_abogado(db: Session, usuario: models.Usuario) -> list[dict]:
    _abogado(usuario)
    process_ids = {row[0] for row in lawyer_process_ids(db, usuario).all()} if usuario.rol != models.RolUsuario.ADMIN else {
        row[0] for row in db.query(models.Proceso.id).filter(models.Proceso.archivado_en.is_(None)).all()
    }
    items: list[dict] = []
    if process_ids:
        for process_id in process_ids:
            process = db.query(models.Proceso).filter_by(id=process_id).first()
            if process:
                recent = db.query(models.EventoAuditoria.created_at).filter_by(tipo_recurso="proceso", recurso_id=str(process_id)).order_by(models.EventoAuditoria.created_at.desc()).first()
                last_activity = recent[0] if recent else process.created_at
                if last_activity and last_activity < datetime.utcnow() - timedelta(days=30):
                    items.append({"id": f"proceso-inactivo:{process_id}", "categoria": "proceso", "tipo": "SIN_ACTIVIDAD",
                                  "titulo": process.nombre, "descripcion": "El proceso no registra actividad reciente",
                                  "fecha": last_activity, "href": f"/gestion-procesos/abogado/procesos/{process_id}#actividad",
                                  "proceso_id": process_id, "leida": False})
        tasks = db.query(models.Tarea).filter(
            models.Tarea.proceso_id.in_(process_ids),
            models.Tarea.estado.in_((models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)),
            models.Tarea.fecha_limite.is_not(None),
        ).all()
        for task in tasks:
            due = task.fecha_limite
            overdue = due < datetime.utcnow()
            items.append({"id": f"tarea:{task.id}", "categoria": "tarea", "tipo": "VENCIMIENTO" if overdue else "TAREA",
                          "titulo": task.titulo, "descripcion": "La tarea está vencida" if overdue else "Tarea próxima a vencer",
                          "fecha": due, "href": f"/gestion-procesos/abogado/procesos/{task.proceso_id}#tareas",
                          "proceso_id": task.proceso_id, "leida": False})
        requests = db.query(models.SolicitudDocumento).filter(
            models.SolicitudDocumento.proceso_id.in_(process_ids), models.SolicitudDocumento.atendida_en.is_(None)
        ).all()
        for request in requests:
            items.append({"id": f"documento:{request.id}", "categoria": "documento", "tipo": "SOLICITUD",
                          "titulo": request.titulo, "descripcion": "Documento pendiente de entrega por el cliente",
                          "fecha": request.created_at, "href": f"/gestion-procesos/abogado/procesos/{request.proceso_id}#documentos",
                          "proceso_id": request.proceso_id, "leida": False})
        review_documents = db.query(models.DocumentoProceso).filter(
            models.DocumentoProceso.proceso_id.in_(process_ids),
            models.DocumentoProceso.estado_revision.in_(("RECIBIDO", "EN_REVISION", "REQUIERE_CORRECCION")),
        ).all()
        for document in review_documents:
            items.append({"id": f"revision-documento:{document.id}", "categoria": "documento", "tipo": document.estado_revision,
                          "titulo": document.nombre_archivo, "descripcion": f"Documento de {document.cliente.nombre_completo} pendiente de revisión",
                          "fecha": document.created_at, "href": f"/gestion-procesos/abogado/procesos/{document.proceso_id}#documentos",
                          "proceso_id": document.proceso_id, "leida": False})
        upcoming_events = db.query(models.EventoAgenda).filter(
            models.EventoAgenda.proceso_id.in_(process_ids), models.EventoAgenda.estado == "PROGRAMADO",
            models.EventoAgenda.fecha_inicio >= datetime.utcnow(),
            models.EventoAgenda.fecha_inicio <= datetime.utcnow() + timedelta(days=7),
        ).all()
        for event in upcoming_events:
            items.append({"id": f"evento:{event.id}", "categoria": "proceso", "tipo": "EVENTO_PROXIMO",
                          "titulo": event.titulo, "descripcion": f"{event.tipo.lower().replace('_', ' ')} próximo",
                          "fecha": event.fecha_inicio, "href": f"/gestion-procesos/abogado/procesos/{event.proceso_id}#agenda",
                          "proceso_id": event.proceso_id, "leida": False})
        notices = db.query(models.NotificacionProceso).filter(models.NotificacionProceso.proceso_id.in_(process_ids)).all()
        for notice in notices:
            items.append({"id": f"aviso-proceso:{notice.id}", "categoria": "proceso", "tipo": "AVISO_CLIENTE",
                          "titulo": notice.asunto, "descripcion": f"Comunicación enviada a {db.query(models.Usuario.nombre_completo).filter_by(id=notice.cliente_id).scalar() or 'cliente'}",
                          "fecha": notice.created_at, "href": f"/gestion-procesos/abogado/procesos/{notice.proceso_id}#comunicaciones",
                          "proceso_id": notice.proceso_id, "leida": False})
        process_rad_ids = [row[0] for row in db.query(models.ProcesoRadicado.radicado_id).filter(models.ProcesoRadicado.proceso_id.in_(process_ids)).all()]
        if process_rad_ids:
            failed = db.query(models.Radicado).filter(models.Radicado.id.in_(process_rad_ids), models.Radicado.estado_consulta == "ERROR").all()
            for radicado in failed:
                process_id = next((row.proceso_id for row in db.query(models.ProcesoRadicado).filter_by(radicado_id=radicado.id).all() if row.proceso_id in process_ids), None)
                items.append({"id": f"radicado:{radicado.id}", "categoria": "radicado", "tipo": "ERROR_CONSULTA",
                              "titulo": radicado.numero, "descripcion": "La última consulta judicial del radicado reportó un error",
                              "fecha": datetime.utcnow(), "href": f"/gestion-procesos/abogado/procesos/{process_id}#radicados",
                              "proceso_id": process_id, "leida": False})
        allowed_clients = db.query(models.ProcesoCliente.cliente_id).filter(models.ProcesoCliente.proceso_id.in_(process_ids))
        profile_requests = db.query(models.SolicitudEdicionPerfilCliente).filter(
            models.SolicitudEdicionPerfilCliente.estado == "PENDIENTE",
            models.SolicitudEdicionPerfilCliente.cliente_id.in_(allowed_clients),
        ).all()
        for request in profile_requests:
            client_process = db.query(models.ProcesoCliente.proceso_id).filter_by(cliente_id=request.cliente_id).first()
            if client_process:
                items.append({"id": f"cliente:{request.id}", "categoria": "solicitud", "tipo": "PERFIL_CLIENTE",
                              "titulo": request.cliente.nombre_completo, "descripcion": "El cliente solicitó actualizar sus datos",
                              "fecha": request.solicitada_en, "href": "/gestion-procesos/abogado/solicitudes-perfil",
                              "proceso_id": client_process[0], "leida": False})
    read = {item.notificacion_id for item in db.query(models.LecturaNotificacionAbogado).filter_by(usuario_id=usuario.id).all()}
    for item in items:
        item["leida"] = item["id"] in read
        item["proceso"] = db.query(models.Proceso.nombre).filter_by(id=item["proceso_id"]).scalar() if item.get("proceso_id") else None
    return sorted(items, key=lambda item: item["fecha"] or datetime.min, reverse=True)[:500]


@router.get("/notificaciones/centro")
def centro_notificaciones_abogado(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    return _notificaciones_abogado(db, usuario)


@router.post("/notificaciones/leer")
def leer_notificaciones_abogado(datos: schemas.NotificacionesAbogadoLeidasUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    current_ids = {item["id"] for item in _notificaciones_abogado(db, usuario)}
    ids = list(dict.fromkeys(item for item in datos.ids if item in current_ids))
    existing = {item.notificacion_id for item in db.query(models.LecturaNotificacionAbogado).filter_by(usuario_id=usuario.id).all()}
    db.add_all(models.LecturaNotificacionAbogado(usuario_id=usuario.id, notificacion_id=item) for item in ids if item not in existing)
    db.commit()
    return {"leidas": len(ids)}


@router.post("/notificaciones/leer-todas")
def leer_todas_notificaciones_abogado(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    current_ids = {item["id"] for item in _notificaciones_abogado(db, usuario)}
    existing = {item.notificacion_id for item in db.query(models.LecturaNotificacionAbogado).filter_by(usuario_id=usuario.id).all()}
    nuevos = current_ids - existing
    db.add_all(models.LecturaNotificacionAbogado(usuario_id=usuario.id, notificacion_id=item) for item in nuevos)
    db.commit()
    return {"leidas": len(nuevos)}


@router.get("/dashboard")
def dashboard_abogado(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    procesos = listar_procesos(db=db, usuario=usuario)
    tasks_query = db.query(models.Tarea)
    if usuario.rol != models.RolUsuario.ADMIN:
        tasks_query = tasks_query.filter(models.Tarea.proceso_id.in_(lawyer_process_ids(db, usuario)))
    tasks = tasks_query.all()
    today = datetime.utcnow()
    active_tasks = [task for task in tasks if task.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)]
    overdue = [task for task in active_tasks if task.fecha_limite and task.fecha_limite < today]
    upcoming = [task for task in active_tasks if task.fecha_limite and today <= task.fecha_limite <= today + timedelta(days=7)]
    agenda_query = db.query(models.EventoAgenda).join(models.Proceso).filter(
        models.EventoAgenda.estado == "PROGRAMADO",
        models.EventoAgenda.fecha_inicio >= today,
        models.EventoAgenda.fecha_inicio <= today + timedelta(days=7),
        models.Proceso.archivado_en.is_(None),
    )
    if usuario.rol != models.RolUsuario.ADMIN:
        agenda_query = agenda_query.filter(models.EventoAgenda.proceso_id.in_(lawyer_process_ids(db, usuario)))
    upcoming_events = agenda_query.order_by(models.EventoAgenda.fecha_inicio.asc()).all()
    pending_documents = sum(item["documentos_pendientes"] for item in procesos)
    notices = _notificaciones_abogado(db, usuario)
    attention = []
    for task in sorted(overdue + upcoming, key=lambda item: item.fecha_limite or datetime.max)[:12]:
        attention.append({"tipo": "TAREA", "titulo": task.titulo, "descripcion": "Vencida" if task in overdue else "Próxima a vencer",
                          "fecha": task.fecha_limite, "href": f"/gestion-procesos/abogado/procesos/{task.proceso_id}#tareas" if task.proceso_id else "/gestion-procesos/abogado/tareas"})
    for event in upcoming_events[:12]:
        attention.append({"tipo": "EVENTO", "titulo": event.titulo,
                          "descripcion": f"{event.tipo.lower().replace('_', ' ')} programado",
                          "fecha": event.fecha_inicio,
                          "href": f"/gestion-procesos/abogado/procesos/{event.proceso_id}#agenda"})
    for process in procesos:
        if process["riesgo"]:
            attention.append({"tipo": "PROCESO", "titulo": process["nombre"], "descripcion": "Requiere atención por tareas vencidas o documentos pendientes",
                              "fecha": process["ultima_actividad"], "href": f"/gestion-procesos/abogado/procesos/{process['id']}"})
        if process.get("inactivo"):
            attention.append({"tipo": "PROCESO", "titulo": process["nombre"], "descripcion": "Sin actividad en los últimos 30 días",
                              "fecha": process["ultima_actividad"], "href": f"/gestion-procesos/abogado/procesos/{process['id']}#actividad"})
    return {
        "resumen": {"procesos_activos": len(procesos), "tareas_pendientes": len(active_tasks), "tareas_vencidas": len(overdue),
                    "documentos_pendientes": pending_documents, "solicitudes_clientes": sum(1 for item in notices if item["categoria"] in {"documento", "solicitud"}),
                    "consultas_con_error": sum(1 for item in notices if item["categoria"] == "radicado"), "proximos_eventos": len(upcoming) + len(upcoming_events),
                    "procesos_sin_actividad": sum(1 for item in procesos if item.get("inactivo")),
                    "procesos_sin_responsable": sum(1 for item in procesos if not item.get("responsable_asignado"))},
        "atencion": attention[:30],
        "actividad_reciente": sorted([
            {**item, "proceso_id": process["id"], "proceso": process["nombre"], "href": f"/gestion-procesos/abogado/procesos/{process['id']}#actividad"}
            for process in procesos[:12]
            for item in _timeline_proceso(db.query(models.Proceso).filter_by(id=process["id"]).first(), db)[:8]
        ], key=lambda item: item.get("fecha") or datetime.min, reverse=True)[:30],
        "acciones": [
            {"label": "Nuevo proceso", "href": "/gestion-procesos/abogado/procesos?nuevo=1"},
            {"label": "Nuevo cliente", "href": "/gestion-procesos/abogado/clientes?nuevo=1"},
            {"label": "Agregar radicado", "href": "/gestion-procesos/abogado/radicados?nuevo=1"},
            {"label": "Crear tarea", "href": "/gestion-procesos/abogado/tareas?nuevo=1"},
            {"label": "Solicitar documento", "href": "/gestion-procesos/abogado/documentos?nuevo=1"},
            {"label": "Agendar evento", "href": "/gestion-procesos/abogado/agenda?nuevo=1"},
        ],
    }


@router.get("/agenda/eventos")
def listar_eventos_agenda_abogado(fecha_desde: str | None = None, fecha_hasta: str | None = None,
                                  proceso_id: int | None = None, db: Session = Depends(get_db),
                                  usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.EventoAgenda).join(models.Proceso).filter(models.Proceso.archivado_en.is_(None))
    if usuario.rol != models.RolUsuario.ADMIN:
        query = query.filter(models.EventoAgenda.proceso_id.in_(lawyer_process_ids(db, usuario)))
    if proceso_id is not None:
        _proceso_abogado(proceso_id, usuario, db)
        query = query.filter(models.EventoAgenda.proceso_id == proceso_id)
    if bool(fecha_desde) != bool(fecha_hasta):
        raise HTTPException(status_code=400, detail="Indica las dos fechas del rango.")
    if fecha_desde and fecha_hasta:
        try:
            desde_local = datetime.fromisoformat(fecha_desde).date()
            hasta_local = datetime.fromisoformat(fecha_hasta).date() + timedelta(days=1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Usa fechas ISO YYYY-MM-DD.") from exc
        zona = ZoneInfo("America/Bogota")
        desde = datetime.combine(desde_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)
        hasta = datetime.combine(hasta_local, datetime.min.time(), tzinfo=zona).astimezone(timezone.utc).replace(tzinfo=None)
        query = query.filter(models.EventoAgenda.fecha_inicio >= desde, models.EventoAgenda.fecha_inicio < hasta)
    return [_serializar_evento_firma(item) for item in query.order_by(models.EventoAgenda.fecha_inicio.asc()).limit(500).all()]


@router.post("/agenda/eventos", status_code=status.HTTP_201_CREATED)
def crear_evento_agenda_abogado(datos: schemas.EventoAgendaCreate, db: Session = Depends(get_db),
                                usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if datos.proceso_id is None:
        raise HTTPException(status_code=400, detail="Asocia el evento a un proceso.")
    proceso = _proceso_abogado(datos.proceso_id, usuario, db)
    cliente = _cliente_asignado(proceso, datos.cliente_id, db) if datos.cliente_id else None
    responsable_id = datos.responsable_id or usuario.id
    responsible_allowed = responsable_id == proceso.abogado_id or responsable_id == usuario.id or any(link.abogado_id == responsable_id for link in proceso.colaboradores)
    responsable = db.query(models.Usuario).filter_by(id=responsable_id, estado=models.EstadoUsuario.ACTIVO).first()
    if not responsable or responsable.rol not in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN) or not responsible_allowed:
        raise HTTPException(status_code=400, detail="El responsable debe estar activo y pertenecer al equipo del proceso.")
    inicio = datos.fecha_inicio.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_inicio.tzinfo else datos.fecha_inicio
    fin = datos.fecha_fin.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_fin and datos.fecha_fin.tzinfo else datos.fecha_fin
    if fin and fin < inicio:
        raise HTTPException(status_code=400, detail="La fecha final debe ser posterior al inicio.")
    evento = models.EventoAgenda(titulo=datos.titulo.strip(), descripcion=datos.descripcion, tipo=datos.tipo, estado=datos.estado,
                                 fecha_inicio=inicio, fecha_fin=fin, responsable_id=responsable_id, proceso_id=proceso.id,
                                 cliente_id=cliente.id if cliente else None, creado_por_id=usuario.id)
    db.add(evento); db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.evento_agenda.crear", "proceso", proceso.id)
    db.commit(); db.refresh(evento)
    if cliente:
        _notificar(db, cliente, f"Evento programado: {evento.titulo}",
                   f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} program? un evento relacionado con el proceso {proceso.nombre}.\n\nEvento: {evento.titulo}\nTipo: {evento.tipo}\nEstado: {evento.estado}\nInicio: {evento.fecha_inicio.strftime('%d/%m/%Y %H:%M UTC')}\nFin: {evento.fecha_fin.strftime('%d/%m/%Y %H:%M UTC') if evento.fecha_fin else 'No indicado'}\nResponsable: {responsable.nombre_completo}\nDetalle: {evento.descripcion or 'Sin detalles adicionales'}\n\nAbrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}",
                   "RESUMENES", f"EVENTO_AGENDA:{evento.id}:CREADO", emisor=usuario)
    return _serializar_evento_firma(evento)


@router.patch("/agenda/eventos/{evento_id}")
def actualizar_evento_agenda_abogado(evento_id: int, datos: schemas.EventoAgendaUpdate, db: Session = Depends(get_db),
                                     usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    evento = db.query(models.EventoAgenda).filter_by(id=evento_id).first()
    if not evento or not evento.proceso_id:
        raise HTTPException(status_code=404, detail="Evento no encontrado.")
    proceso = _proceso_abogado(evento.proceso_id, usuario, db)
    cliente = _cliente_asignado(proceso, datos.cliente_id, db) if datos.cliente_id else None
    responsable_id = datos.responsable_id or usuario.id
    responsible_allowed = responsable_id == proceso.abogado_id or responsable_id == usuario.id or any(link.abogado_id == responsable_id for link in proceso.colaboradores)
    responsable = db.query(models.Usuario).filter_by(id=responsable_id, estado=models.EstadoUsuario.ACTIVO).first()
    if not responsable or responsable.rol not in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN) or not responsible_allowed:
        raise HTTPException(status_code=400, detail="El responsable debe estar activo y pertenecer al equipo del proceso.")
    inicio = datos.fecha_inicio.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_inicio.tzinfo else datos.fecha_inicio
    fin = datos.fecha_fin.astimezone(timezone.utc).replace(tzinfo=None) if datos.fecha_fin and datos.fecha_fin.tzinfo else datos.fecha_fin
    if fin and fin < inicio:
        raise HTTPException(status_code=400, detail="La fecha final debe ser posterior al inicio.")
    cliente_anterior = evento.cliente
    for field in ("titulo", "descripcion", "tipo", "estado"):
        setattr(evento, field, getattr(datos, field))
    evento.fecha_inicio = inicio; evento.fecha_fin = fin; evento.responsable_id = responsable_id
    evento.cliente_id = cliente.id if cliente else None
    registrar_evento_auditoria(db, usuario, "proceso.evento_agenda.actualizar", "proceso", proceso.id)
    db.commit(); db.refresh(evento)
    destinatario = cliente or cliente_anterior
    if destinatario:
        _notificar(db, destinatario, f"Evento actualizado: {evento.titulo}",
                   f"Hola {destinatario.nombre_completo},\n\n{usuario.nombre_completo} actualiz? el evento relacionado con el proceso {proceso.nombre}.\n\nEvento: {evento.titulo}\nTipo: {evento.tipo}\nEstado: {evento.estado}\nInicio: {evento.fecha_inicio.strftime('%d/%m/%Y %H:%M UTC')}\nFin: {evento.fecha_fin.strftime('%d/%m/%Y %H:%M UTC') if evento.fecha_fin else 'No indicado'}\nResponsable: {evento.responsable.nombre_completo if evento.responsable else 'No asignado'}\nDetalle: {evento.descripcion or 'Sin detalles adicionales'}\n\nAbrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}",
                   "RESUMENES", f"EVENTO_AGENDA:{evento.id}:ACTUALIZADO:{evento.fecha_inicio.isoformat()}", emisor=usuario)
    return _serializar_evento_firma(evento)


@router.delete("/agenda/eventos/{evento_id}")
def eliminar_evento_agenda_abogado(evento_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    evento = db.query(models.EventoAgenda).filter_by(id=evento_id).first()
    if not evento or not evento.proceso_id:
        raise HTTPException(status_code=404, detail="Evento no encontrado.")
    proceso = _proceso_abogado(evento.proceso_id, usuario, db)
    cliente = evento.cliente
    if cliente and cliente.estado == models.EstadoUsuario.ACTIVO:
        _notificar(db, cliente, f"Evento cancelado: {evento.titulo}",
                   f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} cancel? el evento relacionado con el proceso {proceso.nombre}.\n\nEvento: {evento.titulo}\nFecha prevista: {evento.fecha_inicio.strftime('%d/%m/%Y %H:%M UTC')}\nResponsable: {evento.responsable.nombre_completo if evento.responsable else 'No asignado'}\n\nAbrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}",
                   "RESUMENES", f"EVENTO_AGENDA:{evento.id}:ELIMINADO", emisor=usuario)
    registrar_evento_auditoria(db, usuario, "proceso.evento_agenda.eliminar", "proceso", proceso.id)
    db.delete(evento); db.commit()
    return {"mensaje": "Evento eliminado de la agenda."}


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
    _notificar_clientes_proceso(db, proceso, usuario, f"Actualización del proceso {proceso.nombre}",
                                "actualizó la información general", datos.nombre or datos.descripcion or "Se actualizaron los datos generales del expediente.",
                                "#resumen")
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
    result = []
    for proceso in procesos:
        item = {
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
        if usuario.rol != models.RolUsuario.CLIENTE:
            tareas = db.query(models.Tarea).filter_by(proceso_id=proceso.id).all()
            solicitudes = db.query(models.SolicitudDocumento).filter_by(proceso_id=proceso.id).all()
            documentos = db.query(models.DocumentoProceso).filter_by(proceso_id=proceso.id).all()
            pendientes = [task for task in tareas if task.estado in (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)]
            vencidas = [task for task in pendientes if task.fecha_limite and task.fecha_limite < datetime.utcnow()]
            solicitudes_pendientes = [request for request in solicitudes if request.atendida_en is None]
            fechas = [proceso.created_at]
            fechas.extend(item.updated_at for item in tareas if item.updated_at)
            fechas.extend(item.created_at for item in solicitudes if item.created_at)
            fechas.extend(item.created_at for item in documentos if item.created_at)
            fechas.extend(item.created_at for item in proceso.colaboradores if item.created_at)
            ultima_actividad = max(fechas) if fechas else None
            proxima = min((task.fecha_limite for task in pendientes if task.fecha_limite and task.fecha_limite >= datetime.utcnow()), default=None)
            item.update({
                "responsable": {"id": proceso.abogado.id, "nombre_completo": proceso.abogado.nombre_completo},
                "clientes": [{"id": link.cliente.id, "nombre_completo": link.cliente.nombre_completo} for link in proceso.clientes if link.cliente],
                "tareas_pendientes": len(pendientes),
                "tareas_vencidas": len(vencidas),
                "documentos_pendientes": len(solicitudes_pendientes),
                "proxima_actividad": proxima,
                "ultima_actividad": ultima_actividad,
                "estado_atencion": "ATENCION" if vencidas or solicitudes_pendientes else "ACTIVO",
                "riesgo": bool(vencidas or solicitudes_pendientes),
                "responsable_asignado": proceso.abogado_id is not None,
                "inactivo": bool(ultima_actividad and ultima_actividad < datetime.utcnow() - timedelta(days=30)),
            })
        result.append(item)
    return result


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
        "tareas": [{"id": t.id, "titulo": t.titulo, "descripcion": t.descripcion, "estado": t.estado.value, "prioridad": t.prioridad.value, "cliente_id": t.cliente_id, "fecha_limite": t.fecha_limite, "radicado_id": t.radicado_id, "actuacion_id": t.actuacion_id, "responsable": t.usuario.nombre_completo if t.usuario else None} for t in tareas],
        "solicitudes_documento": [{"id": s.id, "titulo": s.titulo, "instrucciones": s.instrucciones, "cliente_id": s.cliente_id, "cliente": s.cliente.nombre_completo, "atendida_en": s.atendida_en, "created_at": s.created_at} for s in proceso.solicitudes_documento if s.cliente and s.cliente.rol == models.RolUsuario.CLIENTE],
        "documentos": [{"id": d.id, "solicitud_id": d.solicitud_id, "nombre_archivo": d.nombre_archivo, "cliente": d.cliente.nombre_completo, "cliente_id": d.cliente_id, "mime_type": d.mime_type, "estado_revision": d.estado_revision, "comentario_revision": d.comentario_revision, "created_at": d.created_at} for d in proceso.documentos if d.cliente and d.cliente.rol == models.RolUsuario.CLIENTE],
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
        "comunicaciones": [
            {"id": item.id, "asunto": item.asunto, "contenido": item.contenido, "visibilidad": item.visibilidad,
             "canal": item.canal, "cliente_id": item.cliente_id, "cliente": item.cliente.nombre_completo if item.cliente else None,
             "actor": item.actor.nombre_completo if item.actor else None, "created_at": item.created_at}
            for item in db.query(models.ComunicacionProceso).filter_by(proceso_id=proceso.id).order_by(models.ComunicacionProceso.created_at.desc()).limit(100).all()
        ],
        "timeline": _timeline_proceso(proceso, db),
        "eventos": [_serializar_evento_firma(event) for event in db.query(models.EventoAgenda).filter_by(proceso_id=proceso.id).order_by(models.EventoAgenda.fecha_inicio.asc()).all()],
    }


@router.get("/cliente/procesos/{proceso_id}/timeline")
def timeline_proceso_cliente(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="consultar actividad del proceso")
    proceso = db.query(models.Proceso).join(models.ProcesoCliente).filter(
        models.Proceso.id == proceso_id,
        models.ProcesoCliente.cliente_id == usuario.id,
        models.Proceso.archivado_en.is_(None),
    ).first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    return _timeline_proceso(proceso, db, cliente_id=usuario.id)


@router.get("/procesos/{proceso_id}/comunicaciones")
def listar_comunicaciones_proceso(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    return [{"id": item.id, "asunto": item.asunto, "contenido": item.contenido, "visibilidad": item.visibilidad,
             "canal": item.canal, "cliente_id": item.cliente_id, "cliente": item.cliente.nombre_completo if item.cliente else None,
             "actor": item.actor.nombre_completo if item.actor else None, "created_at": item.created_at}
            for item in db.query(models.ComunicacionProceso).filter_by(proceso_id=proceso.id).order_by(models.ComunicacionProceso.created_at.desc()).all()]


@router.post("/procesos/{proceso_id}/comunicaciones", status_code=status.HTTP_201_CREATED)
def crear_comunicacion_proceso(proceso_id: int, datos: schemas.ComunicacionProcesoCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    proceso = _proceso_abogado(proceso_id, usuario, db)
    cliente = _cliente_asignado(proceso, datos.cliente_id, db) if datos.visibilidad == "CLIENTE" and datos.cliente_id else None
    if datos.visibilidad == "CLIENTE" and cliente is None:
        raise HTTPException(status_code=400, detail="Selecciona el cliente asignado al que corresponde la comunicación.")
    if datos.visibilidad == "INTERNA" and datos.cliente_id is not None:
        raise HTTPException(status_code=400, detail="Una nota interna no puede asociarse a un cliente.")
    item = models.ComunicacionProceso(proceso_id=proceso.id, actor_id=usuario.id, cliente_id=cliente.id if cliente else None,
                                      visibilidad=datos.visibilidad, canal=datos.canal, asunto=datos.asunto.strip(), contenido=datos.contenido.strip())
    db.add(item)
    db.flush()
    registrar_evento_auditoria(db, usuario, "proceso.comunicacion.registrar", "proceso", proceso.id)
    db.commit()
    db.refresh(item)
    if cliente:
        cuerpo = f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} registro una comunicacion para el proceso {proceso.nombre}.\n\nAsunto: {item.asunto}\nFecha: {item.created_at.strftime('%d/%m/%Y %H:%M UTC')}\nDetalle: {item.contenido}\n\nAbrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}"
        _notificar(db, cliente, f"Nueva comunicacion: {item.asunto}", cuerpo,
                   "RESUMENES", f"COMUNICACION_PROCESO:{item.id}", emisor=usuario)
    return {"id": item.id, "mensaje": "Comunicación registrada en el expediente."}


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
    try:
        scope_key = ambito_radicado_usuario(proceso.abogado)
    except ValueError:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    radicado = db.query(models.Radicado).filter(
        models.Radicado.id == radicado_id,
        models.Radicado.ambito_key == scope_key,
    ).first()
    if not radicado: raise HTTPException(status_code=404, detail="Radicado no encontrado en la firma.")
    vinculado_previamente = radicado_vinculado_a_usuario(
        db,
        proceso.abogado,
        radicado.numero,
    )
    if not db.query(models.ProcesoRadicado).filter_by(proceso_id=proceso.id, radicado_id=radicado.id).first():
        try:
            obtener_o_vincular_radicado(db, proceso.abogado, radicado.numero)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Radicado no disponible en el ámbito del proceso.") from exc
        db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
        registrar_evento_auditoria(db, usuario, "proceso.radicado.asignar", "proceso_radicado", f"{proceso.id}:{radicado.id}")
        db.commit()
        _notificar_clientes_proceso(
            db, proceso, usuario, f"Radicado asociado: {radicado.numero}",
            "asoció un radicado judicial", f"Radicado: {radicado.numero}\nProceso: {proceso.nombre}\nEstado de consulta: {radicado.estado_consulta}",
            "radicados", tipo="ACTUACIONES",
        )
        if not vinculado_previamente:
            mensaje_consulta, consulta_id = iniciar_consulta_nuevo_radicado(
                db,
                proceso.abogado,
                radicado,
            )
            return {
                "mensaje": f"Radicado asignado al proceso. {mensaje_consulta}",
                "consulta_id": consulta_id,
            }
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
    vinculado_previamente = radicado_vinculado_a_usuario(
        db,
        proceso.abogado,
        numero,
    )
    try:
        radicado, created = obtener_o_vincular_radicado(db, proceso.abogado, numero)
        if usuario.id != proceso.abogado_id:
            obtener_o_vincular_radicado(db, usuario, numero)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not db.query(models.ProcesoRadicado).filter_by(
        proceso_id=proceso.id, radicado_id=radicado.id
    ).first():
        db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
    action = "radicado.crear_en_proceso" if created else "radicado.vincular_en_proceso"
    registrar_evento_auditoria(db, usuario, action, "radicado", radicado.id)
    db.commit(); db.refresh(radicado)
    _notificar_clientes_proceso(
        db, proceso, usuario, f"Radicado asociado: {radicado.numero}",
        "asoció un radicado judicial", f"Radicado: {radicado.numero}\nProceso: {proceso.nombre}\nEstado de consulta: {radicado.estado_consulta}",
        "radicados", tipo="ACTUACIONES",
    )
    mensaje = "Radicado creado y asociado al proceso."
    consulta_id = None
    if created or not vinculado_previamente:
        mensaje_consulta, consulta_id = iniciar_consulta_nuevo_radicado(
            db,
            proceso.abogado,
            radicado,
        )
        mensaje = f"{mensaje} {mensaje_consulta}"
    return {
        "id": radicado.id,
        "numero": radicado.numero,
        "mensaje": mensaje,
        "consulta_id": consulta_id,
    }


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
        _notificar_clientes_proceso(
            db, proceso, usuario, f"Proceso asignado: {proceso.nombre}",
            "te dio acceso al siguiente proceso", f"Proceso: {proceso.nombre}\nResponsable: {proceso.abogado.nombre_completo}\nDescripción: {proceso.descripcion or 'Sin descripción'}",
            "resumen", tipo="RESUMENES", cliente=cliente,
        )
    return {"mensaje": "Cliente asignado al proceso."}


@router.post("/procesos/{proceso_id}/actuaciones/{actuacion_id}/notificar")
def notificar_actuacion(proceso_id: int, actuacion_id: int, datos: schemas.NotificacionActuacionCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario); proceso = _proceso_abogado(proceso_id, usuario, db); cliente = _cliente_asignado(proceso, datos.cliente_id, db)
    actuacion = db.query(models.Actuacion).join(models.ProcesoRadicado).filter(models.Actuacion.id == actuacion_id, models.ProcesoRadicado.proceso_id == proceso.id, models.ProcesoRadicado.radicado_id == models.Actuacion.radicado_id).first()
    if not actuacion: raise HTTPException(status_code=404, detail="La actuación no corresponde al proceso.")
    cuerpo = (f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} le notifica una actuacion del proceso {proceso.nombre}.\n\n"
              f"Radicado: {actuacion.radicado_rel.numero}\nFecha: {actuacion.fecha_actuacion or 'No informada'}\n"
              f"Actuacion: {actuacion.actuacion}\nAnotacion: {actuacion.anotacion or 'Sin anotacion'}\n"
              f"Comentarios del abogado: {datos.comentarios}\n\n"
              f"Abrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}")
    asunto = f"Actualización del proceso {proceso.nombre}"
    _notificar(
        db,
        cliente,
        asunto,
        cuerpo,
        "ACTUACIONES",
        f"NOTIFICACION_ACTUACION:{actuacion.id}:{cliente.id}",
        emisor=usuario,
    )
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
    solicitud = models.SolicitudDocumento(proceso_id=proceso.id, cliente_id=datos.cliente_id, titulo=datos.titulo.strip(), instrucciones=datos.instrucciones, fecha_limite=datos.fecha_limite)
    db.add(solicitud); db.flush()
    registrar_evento_auditoria(db, usuario, "documento.solicitar", "solicitud_documento", solicitud.id)
    db.commit(); db.refresh(solicitud)
    _notificar(
        db,
        cliente,
        f"Documento solicitado: {proceso.nombre}",
        f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} solicitó un documento para el proceso {proceso.nombre}.\n\nSolicitud: {solicitud.titulo}\nInstrucciones: {solicitud.instrucciones or 'Sin instrucciones adicionales'}\nFecha límite: {solicitud.fecha_limite.strftime('%d/%m/%Y %H:%M UTC') if solicitud.fecha_limite else 'Sin fecha límite'}\nFecha de solicitud: {solicitud.created_at.strftime('%d/%m/%Y %H:%M UTC')}\n\nAbrir enlace: Ver proceso | {public_site_url()}/gestion-procesos/cliente#proceso-{proceso.id}",
        "DOCUMENTOS",
        f"SOLICITUD_DOCUMENTO:{solicitud.id}",
        usuario,
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
    proceso = solicitud.proceso
    _notificar(
        db, proceso.abogado, f"Documento recibido: {documento.nombre_archivo}",
        f"Hola {proceso.abogado.nombre_completo},\n\n{usuario.nombre_completo} cargó un documento para el proceso {proceso.nombre}.\n\nDocumento: {documento.nombre_archivo}\nSolicitud: {solicitud.titulo}\nTipo: {documento.mime_type}\nFecha de carga: {documento.created_at.strftime('%d/%m/%Y %H:%M UTC')}\n\nAbrir enlace: Revisar documentos | {public_site_url()}/gestion-procesos/abogado/procesos/{proceso.id}#documentos",
        "DOCUMENTOS", f"DOCUMENTO_RECIBIDO:{documento.id}", emisor=usuario,
    )
    return {"id": documento.id, "nombre_archivo": documento.nombre_archivo}
