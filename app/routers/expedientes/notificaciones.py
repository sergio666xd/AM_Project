"""Avisos y centro de notificaciones del abogado."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app import models, schemas, security
from app.database import get_db
from app.firm_access import (
    lawyer_process_ids,
    lawyer_scope_id,
)
from app.routers.expedientes.comun import _abogado
from app.timezone import utc_ahora

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


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
    filas = (
        query.outerjoin(models.Usuario, models.Usuario.id == models.NotificacionProceso.cliente_id)
        .with_entities(models.NotificacionProceso, models.Proceso.nombre, models.Usuario.nombre_completo)
        .order_by(models.NotificacionProceso.created_at.desc())
        .all()
    )
    return [{"id": n.id, "proceso": proceso, "cliente": cliente, "comentarios": n.comentarios, "asunto": n.asunto, "cuerpo": n.cuerpo, "created_at": n.created_at} for n, proceso, cliente in filas]


def _notificaciones_abogado(db: Session, usuario: models.Usuario) -> list[dict]:
    _abogado(usuario)
    process_ids = {row[0] for row in lawyer_process_ids(db, usuario).all()} if usuario.rol != models.RolUsuario.ADMIN else {
        row[0] for row in db.query(models.Proceso.id).filter(models.Proceso.archivado_en.is_(None)).all()
    }
    items: list[dict] = []
    if process_ids:
        latest_audit = dict(
            db.query(models.EventoAuditoria.recurso_id, func.max(models.EventoAuditoria.created_at))
            .filter(
                models.EventoAuditoria.tipo_recurso == "proceso",
                models.EventoAuditoria.recurso_id.in_([str(process_id) for process_id in process_ids]),
            )
            .group_by(models.EventoAuditoria.recurso_id)
            .all()
        )
        processes = db.query(models.Proceso).filter(models.Proceso.id.in_(process_ids)).all()
        for process in processes:
            last_activity = latest_audit.get(str(process.id)) or process.created_at
            if last_activity and last_activity < utc_ahora() - timedelta(days=30):
                items.append({"id": f"proceso-inactivo:{process.id}", "categoria": "proceso", "tipo": "SIN_ACTIVIDAD",
                              "titulo": process.nombre, "descripcion": "El proceso no registra actividad reciente",
                              "fecha": last_activity, "href": f"/gestion-procesos/abogado/procesos/{process.id}/actividad",
                              "proceso_id": process.id, "leida": False})
        tasks = db.query(models.Tarea).filter(
            models.Tarea.proceso_id.in_(process_ids),
            models.Tarea.estado.in_((models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)),
            models.Tarea.fecha_limite.is_not(None),
        ).all()
        for task in tasks:
            due = task.fecha_limite
            overdue = due < utc_ahora()
            items.append({"id": f"tarea:{task.id}", "categoria": "tarea", "tipo": "VENCIMIENTO" if overdue else "TAREA",
                          "titulo": task.titulo, "descripcion": "La tarea está vencida" if overdue else "Tarea próxima a vencer",
                          "fecha": due, "href": f"/gestion-procesos/abogado/procesos/{task.proceso_id}/tareas",
                          "proceso_id": task.proceso_id, "leida": False})
        requests = db.query(models.SolicitudDocumento).filter(
            models.SolicitudDocumento.proceso_id.in_(process_ids), models.SolicitudDocumento.atendida_en.is_(None)
        ).all()
        for request in requests:
            items.append({"id": f"documento:{request.id}", "categoria": "documento", "tipo": "SOLICITUD",
                          "titulo": request.titulo, "descripcion": "Documento pendiente de entrega por el cliente",
                          "fecha": request.created_at, "href": f"/gestion-procesos/abogado/procesos/{request.proceso_id}/documentos",
                          "proceso_id": request.proceso_id, "leida": False})
        review_documents = db.query(models.DocumentoProceso).filter(
            models.DocumentoProceso.proceso_id.in_(process_ids),
            models.DocumentoProceso.estado_revision.in_(("RECIBIDO", "EN_REVISION", "REQUIERE_CORRECCION")),
        ).options(selectinload(models.DocumentoProceso.cliente)).all()
        for document in review_documents:
            items.append({"id": f"revision-documento:{document.id}", "categoria": "documento", "tipo": document.estado_revision,
                          "titulo": document.nombre_archivo, "descripcion": f"Documento de {document.cliente.nombre_completo} pendiente de revisión",
                          "fecha": document.created_at, "href": f"/gestion-procesos/abogado/procesos/{document.proceso_id}/documentos",
                          "proceso_id": document.proceso_id, "leida": False})
        upcoming_events = db.query(models.EventoAgenda).filter(
            models.EventoAgenda.proceso_id.in_(process_ids), models.EventoAgenda.estado == "PROGRAMADO",
            models.EventoAgenda.fecha_inicio >= utc_ahora(),
            models.EventoAgenda.fecha_inicio <= utc_ahora() + timedelta(days=7),
        ).all()
        for event in upcoming_events:
            items.append({"id": f"evento:{event.id}", "categoria": "proceso", "tipo": "EVENTO_PROXIMO",
                          "titulo": event.titulo, "descripcion": f"{event.tipo.lower().replace('_', ' ')} próximo",
                          "fecha": event.fecha_inicio, "href": f"/gestion-procesos/abogado/procesos/{event.proceso_id}/agenda",
                          "proceso_id": event.proceso_id, "leida": False})
        notices = db.query(models.NotificacionProceso).filter(models.NotificacionProceso.proceso_id.in_(process_ids)).all()
        notice_clients = dict(
            db.query(models.Usuario.id, models.Usuario.nombre_completo)
            .filter(models.Usuario.id.in_({notice.cliente_id for notice in notices}))
            .all()
        ) if notices else {}
        for notice in notices:
            items.append({"id": f"aviso-proceso:{notice.id}", "categoria": "proceso", "tipo": "AVISO_CLIENTE",
                          "titulo": notice.asunto, "descripcion": f"Comunicación enviada a {notice_clients.get(notice.cliente_id) or 'cliente'}",
                          "fecha": notice.created_at, "href": f"/gestion-procesos/abogado/procesos/{notice.proceso_id}/comunicaciones",
                          "proceso_id": notice.proceso_id, "leida": False})
        process_by_radicado: dict[int, int] = {}
        for proceso_id, radicado_id in db.query(models.ProcesoRadicado.proceso_id, models.ProcesoRadicado.radicado_id).filter(models.ProcesoRadicado.proceso_id.in_(process_ids)).all():
            process_by_radicado.setdefault(radicado_id, proceso_id)
        if process_by_radicado:
            failed = db.query(models.Radicado).filter(models.Radicado.id.in_(process_by_radicado), models.Radicado.estado_consulta == "ERROR").all()
            for radicado in failed:
                process_id = process_by_radicado[radicado.id]
                items.append({"id": f"radicado:{radicado.id}", "categoria": "radicado", "tipo": "ERROR_CONSULTA",
                              "titulo": radicado.numero, "descripcion": "La última consulta judicial del radicado reportó un error",
                              "fecha": utc_ahora(), "href": f"/gestion-procesos/abogado/procesos/{process_id}/relaciones",
                              "proceso_id": process_id, "leida": False})
        allowed_clients = db.query(models.ProcesoCliente.cliente_id).filter(models.ProcesoCliente.proceso_id.in_(process_ids))
        profile_requests = db.query(models.SolicitudEdicionPerfilCliente).filter(
            models.SolicitudEdicionPerfilCliente.estado == "PENDIENTE",
            models.SolicitudEdicionPerfilCliente.cliente_id.in_(allowed_clients),
        ).options(selectinload(models.SolicitudEdicionPerfilCliente.cliente)).all()
        first_process_by_client: dict[int, int] = {}
        if profile_requests:
            for cliente_id, proceso_id in db.query(models.ProcesoCliente.cliente_id, models.ProcesoCliente.proceso_id).filter(
                models.ProcesoCliente.cliente_id.in_({request.cliente_id for request in profile_requests})
            ).all():
                first_process_by_client.setdefault(cliente_id, proceso_id)
        for request in profile_requests:
            client_process_id = first_process_by_client.get(request.cliente_id)
            if client_process_id:
                items.append({"id": f"cliente:{request.id}", "categoria": "solicitud", "tipo": "PERFIL_CLIENTE",
                              "titulo": request.cliente.nombre_completo, "descripcion": "El cliente solicitó actualizar sus datos",
                              "fecha": request.solicitada_en, "href": "/gestion-procesos/abogado/solicitudes-perfil",
                              "proceso_id": client_process_id, "leida": False})
    read = {item.notificacion_id for item in db.query(models.LecturaNotificacionAbogado).filter_by(usuario_id=usuario.id).all()}
    item_process_ids = {item["proceso_id"] for item in items if item.get("proceso_id")}
    process_names = dict(
        db.query(models.Proceso.id, models.Proceso.nombre).filter(models.Proceso.id.in_(item_process_ids)).all()
    ) if item_process_ids else {}
    for item in items:
        item["leida"] = item["id"] in read
        item["proceso"] = process_names.get(item["proceso_id"]) if item.get("proceso_id") else None
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
