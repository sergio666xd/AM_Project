"""De dónde salen los avisos de cada rol: proceso, tareas, agenda, documentos y radicados.

Se calculan al pedirlos (no hay tabla de avisos); `servicio` les añade la lectura.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app import models
from app.firm_access import (
    lawyer_process_ids,
)
from app.novedades_radicado import (
    descripcion_novedades,
    novedades_pendientes,
    ruta_detalle_radicado,
)
from app.timezone import utc_ahora

PREFIJO_AVISO_ACTUACIONES = "actuaciones-radicado:"


_EVENTO_PROXIMO = {
    "EVENTO": "Evento próximo",
    "AUDIENCIA": "Audiencia próxima",
    "REUNION": "Reunión próxima",
    "FIRMA_CONTRATO": "Firma de contrato próxima",
}


def avisos_abogado(db: Session, usuario: models.Usuario) -> list[dict]:
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
                          "titulo": event.titulo, "descripcion": _EVENTO_PROXIMO.get(event.tipo, "Evento próximo"),
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
    pendientes = novedades_pendientes(db, usuario)
    proceso_por_radicado: dict[int, int] = {}
    if pendientes and process_ids:
        for proceso_id, radicado_id in db.query(models.ProcesoRadicado.proceso_id, models.ProcesoRadicado.radicado_id).filter(
            models.ProcesoRadicado.proceso_id.in_(process_ids),
            models.ProcesoRadicado.radicado_id.in_([novedad.radicado_id for novedad in pendientes]),
        ).all():
            proceso_por_radicado.setdefault(radicado_id, proceso_id)
    for novedad in pendientes:
        items.append({"id": f"{PREFIJO_AVISO_ACTUACIONES}{novedad.radicado_id}", "categoria": "radicado", "tipo": "ACTUACIONES_NUEVAS",
                      "titulo": novedad.radicado.numero, "descripcion": descripcion_novedades(novedad.actuaciones_nuevas),
                      "fecha": novedad.actualizado_en, "href": ruta_detalle_radicado(usuario, novedad.radicado_id),
                      "proceso_id": proceso_por_radicado.get(novedad.radicado_id), "leida": False})
    read = {item.notificacion_id for item in db.query(models.LecturaNotificacionAbogado).filter_by(usuario_id=usuario.id).all()}
    item_process_ids = {item["proceso_id"] for item in items if item.get("proceso_id")}
    process_names = dict(
        db.query(models.Proceso.id, models.Proceso.nombre).filter(models.Proceso.id.in_(item_process_ids)).all()
    ) if item_process_ids else {}
    for item in items:
        item["leida"] = item["id"] in read and not item["id"].startswith(PREFIJO_AVISO_ACTUACIONES)
        item["proceso"] = process_names.get(item["proceso_id"]) if item.get("proceso_id") else None
    return sorted(items, key=lambda item: item["fecha"] or datetime.min, reverse=True)[:500]


_REVISION_CLIENTE = {
    "RECIBIDO": "Lo recibimos y lo revisaremos pronto.",
    "EN_REVISION": "Lo estamos revisando.",
    "APROBADO": "Lo revisamos y quedó aprobado.",
    "REQUIERE_CORRECCION": "Hay que corregirlo: mire la nota de la firma.",
    "RECHAZADO": "No lo pudimos aceptar: mire la nota de la firma.",
}


def avisos_cliente(db: Session, cliente: models.Usuario) -> list[dict]:
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
                      "descripcion": "La firma le pidió algo" if task.estado != models.EstadoTarea.COMPLETADA else "Ya lo hizo",
                      "fecha": task.fecha_limite or task.created_at, "proceso": proceso_por_id[task.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/tareas?tarea={task.id}#tarea-{task.id}"})
    solicitudes = db.query(models.SolicitudDocumento).filter_by(cliente_id=cliente.id).filter(
        models.SolicitudDocumento.proceso_id.in_(ids),
    ).all()
    for request in solicitudes:
        items.append({"id": f"solicitud:{request.id}", "tipo": "Documento", "categoria": "DOCUMENTO",
                      "titulo": request.titulo, "descripcion": "La firma le pidió documentos" if request.atendida_en is None else "Ya entregó lo que le pedimos",
                      "fecha": request.atendida_en or request.created_at, "proceso": proceso_por_id[request.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/documentos#solicitud-{request.id}"})
    documentos = db.query(models.DocumentoProceso).filter_by(cliente_id=cliente.id).filter(
        models.DocumentoProceso.proceso_id.in_(ids),
    ).all()
    for document in documentos:
        items.append({"id": f"documento:{document.id}:{document.estado_revision}", "tipo": "Documento", "categoria": "DOCUMENTO",
                      "titulo": document.nombre_archivo, "descripcion": _REVISION_CLIENTE.get(document.estado_revision, "Lo recibimos."),
                      "fecha": document.revisado_en or document.created_at, "proceso": proceso_por_id[document.proceso_id].nombre,
                      "href": f"/gestion-procesos/cliente/procesos/{document.proceso_id}#documentos"})
    eventos = db.query(models.EventoAgenda).filter(
        models.EventoAgenda.proceso_id.in_(ids), models.EventoAgenda.cliente_id == cliente.id,
        models.EventoAgenda.estado == "PROGRAMADO",
    ).all()
    for event in eventos:
        items.append({"id": f"evento:{event.id}", "tipo": "Evento", "categoria": "EVENTO", "titulo": event.titulo,
                      "descripcion": "Cita programada", "fecha": event.fecha_inicio, "proceso": proceso_por_id[event.proceso_id].nombre,
                      "href": "/gestion-procesos/cliente/calendario"})
    mensajes = db.query(models.ComunicacionProceso).filter(
        models.ComunicacionProceso.proceso_id.in_(ids), models.ComunicacionProceso.cliente_id == cliente.id,
        models.ComunicacionProceso.visibilidad == "CLIENTE",
    ).all()
    for message in mensajes:
        items.append({"id": f"mensaje:{message.id}", "tipo": "Mensaje", "categoria": "MENSAJE",
                      "titulo": message.asunto, "descripcion": f"Nuevo mensaje de {message.actor.nombre_completo if message.actor else 'la firma'}" if message.actor_id != cliente.id else "Mensaje enviado al despacho",
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


def alertas_admin(db: Session) -> list[dict]:
    """Construye alertas desde pendientes y errores reales ya persistidos."""
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    roles_firma = (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN)
    alertas: list[dict] = []

    def agregar(alert_id: str, tipo: str, prioridad: str, fecha, descripcion: str, recurso: str, href: str, accion: str, descartable: bool = False):
        alertas.append({
            "id": alert_id, "tipo": tipo, "prioridad": prioridad,
            "fecha": _iso(fecha), "descripcion": descripcion,
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
                "/gestion-procesos/admin/tareas", "Revisar tarea")

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

    # Solo la consulta más reciente de cada radicado: si una consulta posterior
    # terminó bien, el error anterior ya no es una alerta, y un radicado con
    # varios fallos seguidos aparece una sola vez.
    ultimas_consultas = db.query(func.max(models.ConsultaRadicado.id)).group_by(models.ConsultaRadicado.radicado_id)
    consultas = db.query(models.ConsultaRadicado).filter(
        models.ConsultaRadicado.id.in_(ultimas_consultas),
        models.ConsultaRadicado.estado == "ERROR",
    ).all()
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
        tipo_recurso = alerta["id"].split(":", 1)[0]
        alerta["categoria"] = (
            "solicitudes" if tipo_recurso in {"registro", "perfil"}
            else "tareas" if tipo_recurso.startswith("tarea")
            else "documentos" if tipo_recurso == "documento"
            else "operacion" if tipo_recurso in {"consulta", "notificacion"}
            else "procesos" if tipo_recurso == "evento" and "proceso" in alerta["recurso"].lower()
            else "usuarios" if tipo_recurso == "evento" and "usuario" in alerta["recurso"].lower()
            else "sistema"
        )
    prioridad_orden = {"Alta": 0, "Media": 1, "Baja": 2}
    alertas.sort(key=lambda item: (
        prioridad_orden[item["prioridad"]],
        -datetime.fromisoformat(item["fecha"]).timestamp() if item["fecha"] else 0,
    ))
    return alertas


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()
