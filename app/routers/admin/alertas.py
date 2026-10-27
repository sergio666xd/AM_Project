"""Alertas, entregas de notificaciones y plantillas de mensajes."""

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.message_templates import render_message
from app.routers.admin.comun import verificar_admin
from app.routers.admin.dashboard import _dashboard_iso

router = APIRouter(prefix="/api/admin", tags=["Administración"])


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


@router.get("/alertas")
def listar_alertas_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
    limite: int | None = Query(default=None, ge=1, le=500),
):
    alertas = _alertas_admin(db)
    leidas = {registro.notificacion_id for registro in db.query(models.LecturaNotificacionAdmin).filter_by(usuario_id=admin.id).all()}
    for alerta in alertas:
        alerta["leida"] = alerta["id"] in leidas
    if isinstance(limite, int):
        alertas = [alerta for alerta in alertas if alerta["estado"] != "ELIMINADA"]
        alertas.sort(key=lambda item: datetime.fromisoformat(item["fecha"]).timestamp() if item["fecha"] else 0, reverse=True)
        return alertas[:limite]
    return alertas


@router.get("/notificaciones/entregas")
def listar_entregas_notificacion_admin(
    canal: str | None = Query(default=None, pattern="^(EMAIL|WHATSAPP)$"),
    estado: str | None = Query(default=None, pattern="^(PENDIENTE|ENVIANDO|ENVIADA|ERROR|OMITIDA|DESCARTADA)$"),
    tipo: str | None = Query(default=None, min_length=1, max_length=32),
    limite: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(verificar_admin),
):
    """Historial paginado de cada mensaje preparado para correo o WhatsApp."""
    query = db.query(models.EntregaNotificacion, models.Usuario).join(
        models.Usuario, models.Usuario.id == models.EntregaNotificacion.usuario_id
    )
    if canal:
        query = query.filter(models.EntregaNotificacion.canal == canal)
    if estado:
        query = query.filter(models.EntregaNotificacion.estado == estado)
    if tipo:
        query = query.filter(models.EntregaNotificacion.tipo == tipo)
    total = query.count()
    filas = query.order_by(
        models.EntregaNotificacion.created_at.desc(),
        models.EntregaNotificacion.id.desc(),
    ).offset(offset).limit(limite).all()
    return {
        "items": [
            {
                "id": entrega.id,
                "tipo": entrega.tipo,
                "canal": entrega.canal,
                "estado": entrega.estado,
                "asunto": entrega.asunto,
                "cuerpo": entrega.cuerpo,
                "destinatario": usuario.nombre_completo,
                "email": usuario.email,
                "whatsapp": usuario.whatsapp_numero,
                "intentos": entrega.intentos,
                "error": entrega.error,
                "creada_en": entrega.created_at,
                "enviada_en": entrega.enviado_en,
            }
            for entrega, usuario in filas
        ],
        "total": total,
        "limite": limite,
        "offset": offset,
    }


@router.get("/notificaciones/plantillas")
def listar_plantillas_mensaje_admin(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(verificar_admin),
):
    plantillas = db.query(models.PlantillaMensaje).filter_by(activo=True).order_by(models.PlantillaMensaje.nombre.asc()).all()
    etiquetas_enlace = {
        "ABOGADO_CREDENCIALES": "Ingresar al portal", "CLIENTE_CREDENCIALES": "Ingresar al portal",
        "TAREA_ACCION": "Ver tareas", "SUBTAREA_ASIGNADA": "Ver tarea", "RECORDATORIO_TAREA": "Ver tarea",
        "REACTIVACION_TAREA": "Ver tarea", "REACTIVACION_EVENTO": "Ver agenda",
        "REACTIVACION_COMUNICACION": "Ver conversación", "COMUNICACION_CLIENTE_ABOGADO": "Ver conversación",
        "DOCUMENTO_RECIBIDO": "Revisar documentos", "CONTRATO_FIRMADO": "Ver expediente",
        "RECUPERAR_PASSWORD": "Restablecer contraseña", "ACTUACIONES_DIGEST": "Abrir radicado",
    }
    etiquetas_enlace.update({
        "REACTIVACION_EVENTO": "Ver agenda",
        "TAREA_ACCION": "Ver tarea",
        "CHAT_MENSAJE": "Abrir chat",
        "DOCUMENTO_RECIBIDO": "Revisar documentos",
        "CONTRATO_FIRMADO": "Ver documentos",
        "SUBTAREA_ASIGNADA": "Ver tarea",
        "RECORDATORIO_TAREA": "Ver tarea",
        "REACTIVACION_TAREA": "Ver tarea",
        "EVENTO_AGENDA": "Ver agenda",
        "PROCESO_ACTUALIZACION": "Ver proceso",
        "DOCUMENTO_REVISION": "Ver documentos",
        "COMUNICACION_ABOGADO_CLIENTE": "Abrir chat",
        "COMUNICACION_CLIENTE_ABOGADO": "Abrir chat",
        "COLABORADOR_AGREGADO": "Ver proceso",
        "ACTUACION_NOTIFICADA": "Ver actuación",
        "SOLICITUD_DOCUMENTO": "Ver documentos",
        "REACTIVACION_COMUNICACION": "Abrir chat",
        "ACTUACIONES_DIGEST": "",
    })
    resultado = []
    for plantilla in plantillas:
        ejemplos = plantilla.variables_ejemplo or {}
        resultado.append({
            "clave": plantilla.clave,
            "nombre": plantilla.nombre,
            "asunto_email": plantilla.asunto_email,
            "cuerpo_email": plantilla.cuerpo_email.replace("\\n", "\n"),
            "cuerpo_whatsapp": plantilla.cuerpo_whatsapp.replace("\\n", "\n"),
            "titulo_push": plantilla.titulo_push,
            "cuerpo_push": plantilla.cuerpo_push,
            "variables_ejemplo": ejemplos,
            "enlace_ejemplo": plantilla.enlace_ejemplo,
            "texto_enlace_ejemplo": etiquetas_enlace.get(plantilla.clave, "Ver proceso") if plantilla.enlace_ejemplo else None,
            "activo": plantilla.activo,
            "actualizado_en": plantilla.updated_at,
            "vista_previa_email": render_message(db, plantilla.clave, ejemplos, canal="EMAIL", link_label=etiquetas_enlace.get(plantilla.clave, "Ver proceso"), link_url=plantilla.enlace_ejemplo)[1],
            "vista_previa_whatsapp": render_message(db, plantilla.clave, ejemplos, canal="WHATSAPP", link_label=etiquetas_enlace.get(plantilla.clave, "Ver proceso"), link_url=plantilla.enlace_ejemplo)[1],
        })
    return resultado


@router.put("/notificaciones/plantillas/{clave}")
def actualizar_plantilla_mensaje_admin(
    clave: str,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plantilla = db.query(models.PlantillaMensaje).filter_by(clave=clave).first()
    if not plantilla:
        raise HTTPException(status_code=404, detail="La plantilla no existe.")
    asunto = datos.get("asunto_email")
    cuerpo_email = datos.get("cuerpo_email")
    cuerpo_whatsapp = datos.get("cuerpo_whatsapp")
    titulo_push = datos.get("titulo_push", plantilla.titulo_push)
    cuerpo_push = datos.get("cuerpo_push", plantilla.cuerpo_push)
    if not isinstance(asunto, str) or not asunto.strip() or len(asunto) > 1000:
        raise HTTPException(status_code=400, detail="El asunto debe tener contenido y máximo 1000 caracteres.")
    if not isinstance(cuerpo_email, str) or not cuerpo_email.strip() or len(cuerpo_email) > 30000:
        raise HTTPException(status_code=400, detail="El mensaje de correo debe tener contenido y máximo 30000 caracteres.")
    if not isinstance(cuerpo_whatsapp, str) or not cuerpo_whatsapp.strip() or len(cuerpo_whatsapp) > 10000:
        raise HTTPException(status_code=400, detail="El mensaje de WhatsApp debe tener contenido y máximo 10000 caracteres.")
    if clave == "ACTUACIONES_DIGEST" and (
        not isinstance(titulo_push, str) or not titulo_push.strip()
        or not isinstance(cuerpo_push, str) or not cuerpo_push.strip()
    ):
        raise HTTPException(status_code=400, detail="El título y la descripción Push de novedades judiciales son obligatorios.")
    plantilla.asunto_email = asunto
    plantilla.cuerpo_email = cuerpo_email
    plantilla.cuerpo_whatsapp = cuerpo_whatsapp
    if titulo_push is not None and (not isinstance(titulo_push, str) or len(titulo_push) > 500):
        raise HTTPException(status_code=400, detail="El título Push debe tener máximo 500 caracteres.")
    if cuerpo_push is not None and (not isinstance(cuerpo_push, str) or len(cuerpo_push) > 5000):
        raise HTTPException(status_code=400, detail="El cuerpo Push debe tener máximo 5000 caracteres.")
    plantilla.titulo_push = titulo_push
    plantilla.cuerpo_push = cuerpo_push
    plantilla.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.mensaje.plantilla.actualizar", "plantilla_mensaje", clave)
    db.commit()
    db.refresh(plantilla)
    return {"clave": plantilla.clave, "mensaje": "Plantilla actualizada.", "actualizado_en": plantilla.updated_at}


@router.post("/notificaciones/leer")
def marcar_notificaciones_leidas(
    datos: schemas.NotificacionesLeidasUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    existentes = {item.notificacion_id for item in db.query(models.LecturaNotificacionAdmin).filter_by(usuario_id=admin.id).all()}
    ids = list(dict.fromkeys(datos.ids))
    for notificacion_id in ids:
        if notificacion_id not in existentes:
            db.add(models.LecturaNotificacionAdmin(usuario_id=admin.id, notificacion_id=notificacion_id))
    db.commit()
    return {"leidas": len(ids)}


@router.post("/notificaciones/leer-todas")
def marcar_todas_notificaciones_leidas(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    actuales = [item["id"] for item in _alertas_admin(db) if item["estado"] != "ELIMINADA"]
    existentes = {item.notificacion_id for item in db.query(models.LecturaNotificacionAdmin).filter_by(usuario_id=admin.id).all()}
    nuevas = [item for item in actuales if item not in existentes]
    db.add_all(models.LecturaNotificacionAdmin(usuario_id=admin.id, notificacion_id=item) for item in nuevas)
    db.commit()
    return {"leidas": len(nuevas)}


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
