"""Vistas del portal del cliente: procesos, agenda, actividad, notificaciones y mensajes."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas, security
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.firm_access import (
    require_roles,
)
from app.routers.expedientes.comun import (
    _estado_proceso_cliente,
    _notificar,
    _obtener_proceso_cliente,
    _resumen_solicitud_documento,
    _timeline_cliente_visible,
)
from app.timezone import format_colombia_datetime, utc_ahora
from app.workflow_service import chat_conversation_url

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


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
    return _timeline_cliente_visible(proceso, db, usuario.id)


@router.get("/cliente/procesos/{proceso_id}")
def detalle_proceso_cliente(proceso_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="consultar su proceso")
    proceso = _obtener_proceso_cliente(proceso_id, usuario, db)
    subtareas_asignadas = db.query(models.Subtarea.tarea_id).filter(
        models.Subtarea.asignada_cliente.is_(True),
        models.Subtarea.cliente_id == usuario.id,
    ).distinct()
    tareas = db.query(models.Tarea).filter(
        models.Tarea.proceso_id == proceso.id,
        or_(models.Tarea.cliente_id == usuario.id, models.Tarea.id.in_(subtareas_asignadas)),
    ).order_by(models.Tarea.fecha_limite.asc()).all()
    solicitudes = db.query(models.SolicitudDocumento).filter_by(proceso_id=proceso.id, cliente_id=usuario.id).order_by(models.SolicitudDocumento.created_at.desc()).all()
    documentos = db.query(models.DocumentoProceso).filter_by(proceso_id=proceso.id, cliente_id=usuario.id).order_by(models.DocumentoProceso.created_at.desc()).all()
    eventos = db.query(models.EventoAgenda).filter(
        models.EventoAgenda.proceso_id == proceso.id,
        or_(models.EventoAgenda.cliente_id == usuario.id, models.EventoAgenda.cliente_id.is_(None)),
    ).order_by(models.EventoAgenda.fecha_inicio.asc()).all()
    comunicaciones = db.query(models.ComunicacionProceso).filter_by(
        proceso_id=proceso.id, cliente_id=usuario.id, visibilidad="CLIENTE",
    ).order_by(models.ComunicacionProceso.created_at.desc()).limit(300).all()
    comunicaciones.reverse()
    ahora = utc_ahora()
    for mensaje in comunicaciones:
        if mensaje.actor_id != usuario.id and mensaje.leido_en is None:
            mensaje.leido_en = ahora
    db.commit()
    estado_visible, explicacion = _estado_proceso_cliente(proceso)
    return {
        "id": proceso.id,
        "nombre": proceso.nombre,
        "descripcion": proceso.descripcion,
        "estado_visible": estado_visible,
        "explicacion_estado": explicacion,
        "responsable": {
            "id": proceso.abogado.id,
            "nombre_completo": proceso.abogado.nombre_completo,
            "cargo": "Abogado responsable",
            "email": proceso.abogado.email,
            "whatsapp_numero": proceso.abogado.whatsapp_numero or None,
        },
        "abogados_participantes": [
            {"nombre_completo": enlace.abogado.nombre_completo}
            for enlace in proceso.colaboradores
            if enlace.visible_cliente
            and enlace.abogado
            and enlace.abogado.rol == models.RolUsuario.ABOGADO_ADMIN
            and enlace.abogado.estado == models.EstadoUsuario.ACTIVO
        ],
        "radicados": [{
            "id": link.radicado.id,
            "numero": link.radicado.numero,
            "estado_visible": "En seguimiento" if (link.radicado.estado_consulta or "").casefold() == "ok" else "En revisión",
            "actuaciones": [{"id": a.id, "fecha": a.fecha_actuacion, "descripcion": a.actuacion} for a in sorted(link.radicado.actuaciones, key=lambda action: (action.orden, action.id))[:1]],
        } for link in proceso.radicados if link.radicado],
        "tareas": [{"id": task.id, "titulo": task.titulo, "descripcion": task.descripcion, "estado": task.estado.value, "prioridad": task.prioridad.value, "cliente_id": task.cliente_id if task.cliente_id == usuario.id else None, "asignada_a_cliente": task.cliente_id == usuario.id, "fecha_limite": task.fecha_limite, "radicado_id": task.radicado_id, "actuacion_id": task.actuacion_id, "subtareas": [{"id": subtask.id, "titulo": subtask.titulo, "completada": subtask.completada} for subtask in task.subtareas if subtask.asignada_cliente and subtask.cliente_id == usuario.id]} for task in tareas],
        "solicitudes_documento": [{"id": request.id, "titulo": request.titulo, "instrucciones": request.instrucciones, "fecha_limite": request.fecha_limite, "atendida_en": request.atendida_en, "created_at": request.created_at, **_resumen_solicitud_documento(request)} for request in solicitudes],
        "documentos": [{"id": document.id, "solicitud_id": document.solicitud_id, "contrato_id": document.contrato_id, "nombre_archivo": document.nombre_archivo, "mime_type": document.mime_type, "estado_revision": document.estado_revision, "comentario_revision": document.comentario_revision, "created_at": document.created_at} for document in documentos],
        "contratos": [{"id": contract.id, "estado": contract.estado, "version_actual": contract.version_actual, "firmado_en": contract.firmado_en, "documento_firmado": ({"id": signed.id, "nombre_archivo": signed.nombre_archivo, "mime_type": signed.mime_type, "created_at": signed.created_at} if (signed := db.query(models.DocumentoProceso).filter_by(contrato_id=contract.id).order_by(models.DocumentoProceso.created_at.desc()).first()) else None)} for contract in db.query(models.ContratoServicio).filter(models.ContratoServicio.proceso_id == proceso.id, models.ContratoServicio.cliente_id == usuario.id, models.ContratoServicio.estado.in_({"FIRMADO", "TERMINADO"})).order_by(models.ContratoServicio.firmado_en.desc()).all() if db.query(models.DocumentoProceso.id).filter_by(contrato_id=contract.id).first()],
        "eventos": [{"id": event.id, "titulo": event.titulo, "descripcion": event.descripcion, "tipo": event.tipo, "estado": event.estado, "fecha_inicio": event.fecha_inicio, "fecha_fin": event.fecha_fin} for event in eventos],
        "comunicaciones": [{"id": message.id, "asunto": message.asunto, "contenido": message.contenido, "remitente": message.actor.nombre_completo if message.actor else "Despacho", "es_mio": message.actor_id == usuario.id, "leido_en": message.leido_en, "created_at": message.created_at} for message in comunicaciones],
        "timeline": _timeline_cliente_visible(proceso, db, usuario.id),
        "ultima_actividad": max((item["fecha"] for item in _timeline_cliente_visible(proceso, db, usuario.id) if item.get("fecha")), default=proceso.created_at),
    }


@router.get("/cliente/agenda")
def agenda_cliente(dias: int = 90, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="consultar su calendario")
    if dias < 1 or dias > 365:
        raise HTTPException(status_code=400, detail="El rango del calendario debe estar entre 1 y 365 días.")
    desde = utc_ahora() - timedelta(days=30)
    hasta = utc_ahora() + timedelta(days=dias)
    eventos = db.query(models.EventoAgenda).join(models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.EventoAgenda.proceso_id).join(
        models.Proceso, models.Proceso.id == models.EventoAgenda.proceso_id,
    ).filter(
        models.ProcesoCliente.cliente_id == usuario.id,
        or_(models.EventoAgenda.cliente_id == usuario.id, models.EventoAgenda.cliente_id.is_(None)),
        models.EventoAgenda.estado == "PROGRAMADO",
        models.EventoAgenda.fecha_inicio >= desde,
        models.EventoAgenda.fecha_inicio <= hasta,
        models.Proceso.archivado_en.is_(None),
    ).order_by(models.EventoAgenda.fecha_inicio.asc()).all()
    tareas = db.query(models.Tarea).join(models.Proceso, models.Proceso.id == models.Tarea.proceso_id).join(
        models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.Proceso.id,
    ).filter(
        models.Tarea.cliente_id == usuario.id,
        models.Tarea.estado.in_((models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)),
        models.Tarea.fecha_limite >= desde,
        models.Tarea.fecha_limite <= hasta,
        models.ProcesoCliente.cliente_id == usuario.id,
        models.Proceso.archivado_en.is_(None),
    ).order_by(models.Tarea.fecha_limite.asc()).all()
    return {
        "eventos": [{"id": event.id, "titulo": event.titulo, "descripcion": event.descripcion, "tipo": event.tipo, "fecha_inicio": event.fecha_inicio, "fecha_fin": event.fecha_fin, "proceso_id": event.proceso_id, "proceso": event.proceso.nombre} for event in eventos],
        "tareas": [{"id": task.id, "titulo": task.titulo, "fecha_limite": task.fecha_limite, "proceso_id": task.proceso_id, "proceso": task.proceso.nombre} for task in tareas],
    }


@router.get("/cliente/actividad")
def actividad_cliente(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="consultar actividad compartida")
    procesos = db.query(models.Proceso).join(models.ProcesoCliente).filter(
        models.ProcesoCliente.cliente_id == usuario.id,
        models.Proceso.archivado_en.is_(None),
    ).all()
    items = []
    for proceso in procesos:
        for entry in _timeline_cliente_visible(proceso, db, usuario.id):
            fecha = entry.get("fecha")
            items.append({
                "id": entry["id"], "tipo": entry["tipo"], "titulo": entry["titulo"],
                "descripcion": entry.get("descripcion"), "fecha": fecha.isoformat() if fecha else None,
                "proceso": proceso.nombre,
                "href": f"/gestion-procesos/cliente/procesos/{proceso.id}#actividad",
            })
    return sorted(items, key=lambda item: item["fecha"] or "", reverse=True)[:30]


def _notificaciones_cliente(db: Session, cliente: models.Usuario) -> list[dict]:
    procesos = db.query(models.Proceso).join(models.ProcesoCliente).filter(
        models.ProcesoCliente.cliente_id == cliente.id,
        models.Proceso.archivado_en.is_(None),
    ).all()
    proceso_por_id = {process.id: process for process in procesos}
    if not proceso_por_id:
        return []
    ids = list(proceso_por_id)
    items: list[dict] = []
    tareas = db.query(models.Tarea).filter(
        models.Tarea.proceso_id.in_(ids), models.Tarea.cliente_id == cliente.id,
    ).all()
    for task in tareas:
        items.append({"id": f"tarea:{task.id}", "tipo": "Tarea", "categoria": "TAREA", "titulo": task.titulo,
                      "descripcion": "Tienes una tarea pendiente" if task.estado != models.EstadoTarea.COMPLETADA else "Tarea completada",
                      "fecha": task.fecha_limite or task.created_at, "proceso": proceso_por_id[task.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/tareas?tarea={task.id}#tarea-{task.id}"})
    solicitudes = db.query(models.SolicitudDocumento).filter_by(cliente_id=cliente.id).filter(
        models.SolicitudDocumento.proceso_id.in_(ids),
    ).all()
    for request in solicitudes:
        items.append({"id": f"solicitud:{request.id}", "tipo": "Documento", "categoria": "DOCUMENTO",
                      "titulo": request.titulo, "descripcion": "Solicitud pendiente de entrega" if request.atendida_en is None else "Documento entregado al despacho",
                      "fecha": request.atendida_en or request.created_at, "proceso": proceso_por_id[request.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/documentos#solicitud-{request.id}"})
    documentos = db.query(models.DocumentoProceso).filter_by(cliente_id=cliente.id).filter(
        models.DocumentoProceso.proceso_id.in_(ids),
    ).all()
    for document in documentos:
        items.append({"id": f"documento:{document.id}:{document.estado_revision}", "tipo": "Documento", "categoria": "DOCUMENTO",
                      "titulo": document.nombre_archivo, "descripcion": f"Estado de revisión: {document.estado_revision.replace('_', ' ').lower()}",
                      "fecha": document.revisado_en or document.created_at, "proceso": proceso_por_id[document.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/procesos/{document.proceso_id}#documentos"})
    eventos = db.query(models.EventoAgenda).filter(
        models.EventoAgenda.proceso_id.in_(ids), models.EventoAgenda.cliente_id == cliente.id,
        models.EventoAgenda.estado == "PROGRAMADO",
    ).all()
    for event in eventos:
        items.append({"id": f"evento:{event.id}", "tipo": "Evento", "categoria": "EVENTO", "titulo": event.titulo,
                      "descripcion": "Evento programado", "fecha": event.fecha_inicio, "proceso": proceso_por_id[event.proceso_id].nombre,
                      "href": "/gestion-procesos/cliente/calendario"})
    mensajes = db.query(models.ComunicacionProceso).filter(
        models.ComunicacionProceso.proceso_id.in_(ids), models.ComunicacionProceso.cliente_id == cliente.id,
        models.ComunicacionProceso.visibilidad == "CLIENTE",
    ).all()
    for message in mensajes:
        items.append({"id": f"mensaje:{message.id}", "tipo": "Mensaje", "categoria": "MENSAJE",
                      "titulo": message.asunto, "descripcion": f"Nuevo mensaje de {message.actor.nombre_completo if message.actor else 'tu contacto'}" if message.actor_id != cliente.id else "Mensaje enviado al despacho",
                      "fecha": message.created_at, "proceso": proceso_por_id[message.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/procesos/{message.proceso_id}#comunicacion"})
    avisos = db.query(models.NotificacionProceso).filter(
        models.NotificacionProceso.proceso_id.in_(ids), models.NotificacionProceso.cliente_id == cliente.id,
    ).all()
    for notice in avisos:
        items.append({"id": f"aviso:{notice.id}", "tipo": "Actualización", "categoria": "PROCESO",
                      "titulo": notice.asunto, "descripcion": notice.cuerpo[:500], "fecha": notice.created_at,
                      "proceso": proceso_por_id[notice.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/procesos/{notice.proceso_id}#actividad"})
    leidos = {entry.notificacion_id for entry in db.query(models.LecturaNotificacionCliente).filter_by(usuario_id=cliente.id).all()}
    for item in items:
        item["leida"] = item["id"] in leidos
        item["fecha"] = item["fecha"].isoformat() if item["fecha"] else None
    return sorted(items, key=lambda item: item["fecha"] or "", reverse=True)[:500]


@router.get("/cliente/notificaciones")
def listar_notificaciones_cliente(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="consultar sus notificaciones")
    return _notificaciones_cliente(db, usuario)


@router.post("/cliente/notificaciones/leer")
def leer_notificaciones_cliente(datos: schemas.NotificacionesClienteLeidasUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="actualizar sus notificaciones")
    actuales = {item["id"] for item in _notificaciones_cliente(db, usuario)}
    ids_leidos = {item.notificacion_id for item in db.query(models.LecturaNotificacionCliente).filter_by(usuario_id=usuario.id).all()}
    nuevos = list(dict.fromkeys(item for item in datos.ids if item in actuales and item not in ids_leidos))
    db.add_all(models.LecturaNotificacionCliente(usuario_id=usuario.id, notificacion_id=item) for item in nuevos)
    db.commit()
    return {"leidas": len(nuevos)}


@router.post("/cliente/notificaciones/leer-todas")
def leer_todas_notificaciones_cliente(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="actualizar sus notificaciones")
    actuales = {item["id"] for item in _notificaciones_cliente(db, usuario)}
    leidos = {item.notificacion_id for item in db.query(models.LecturaNotificacionCliente).filter_by(usuario_id=usuario.id).all()}
    nuevos = actuales - leidos
    db.add_all(models.LecturaNotificacionCliente(usuario_id=usuario.id, notificacion_id=item) for item in nuevos)
    db.commit()
    return {"leidas": len(nuevos)}


@router.post("/cliente/procesos/{proceso_id}/comunicaciones", status_code=status.HTTP_201_CREATED)
def enviar_mensaje_cliente(proceso_id: int, datos: schemas.ComunicacionClienteCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["CLIENTE"], action="enviar un mensaje sobre su proceso")
    proceso = _obtener_proceso_cliente(proceso_id, usuario, db)
    asunto = datos.asunto.strip()
    contenido = datos.contenido.strip()
    if not asunto or not contenido:
        raise HTTPException(status_code=400, detail="Escribe un asunto y un mensaje antes de enviarlo.")
    mensaje = models.ComunicacionProceso(
        proceso_id=proceso.id, actor_id=usuario.id, cliente_id=usuario.id,
        visibilidad="CLIENTE", canal="INTERNO", asunto=asunto, contenido=contenido,
    )
    db.add(mensaje)
    db.flush()
    registrar_evento_auditoria(db, usuario, "cliente.comunicacion.enviar", "proceso", proceso.id)
    db.commit()
    db.refresh(mensaje)
    _notificar(
        db, proceso.abogado, f"Mensaje de {usuario.nombre_completo}: {asunto}",
        f"Hola {proceso.abogado.nombre_completo},\n\n{usuario.nombre_completo} te envió un mensaje sobre el proceso {proceso.nombre}.\n\nAsunto: {asunto}\nFecha: {format_colombia_datetime(mensaje.created_at)}\nMensaje:\n{contenido}\n\nAbrir enlace: Abrir chat | {chat_conversation_url(proceso.abogado, proceso.id, usuario.id)}",
        "RESUMENES", f"COMUNICACION_CLIENTE:{mensaje.id}", emisor=usuario,
        plantilla_clave="COMUNICACION_CLIENTE_ABOGADO",
        variables={"nombre": proceso.abogado.nombre_completo, "actor": usuario.nombre_completo,
                   "proceso": proceso.nombre, "asunto": asunto,
                   "fecha": format_colombia_datetime(mensaje.created_at), "mensaje": contenido},
        enlace_texto="Abrir chat",
        enlace_url=chat_conversation_url(proceso.abogado, proceso.id, usuario.id),
    )
    return {"id": mensaje.id, "mensaje": "Tu mensaje fue enviado al despacho."}
