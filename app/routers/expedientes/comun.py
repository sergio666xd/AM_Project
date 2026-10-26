"""Utilidades compartidas por los routers de expedientes."""

import hashlib
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.firm_access import (
    lawyer_process_ids,
    lawyer_scope_id,
    require_process_access,
    require_roles,
)
from app.notification_service import emitir_notificacion_workflow
from app.timezone import format_colombia_datetime, utc_ahora
from app.visibility import CLIENT_VISIBLE, INTERNAL
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)


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
                          "recurso": "Proceso", "recurso_id": proceso.id, "visibilidad": INTERNAL, "fecha": proceso.created_at}]
    if cliente_id is None:
        for audit in db.query(models.EventoAuditoria).filter_by(tipo_recurso="proceso", recurso_id=str(proceso.id)).all():
            if audit.accion == "proceso.crear":
                continue
            actor = db.query(models.Usuario).filter_by(id=audit.actor_id).first() if audit.actor_id else None
            items.append({"id": f"auditoria:{audit.id}", "tipo": "PROCESO", "titulo": "Proceso actualizado",
                          "descripcion": audit.accion.replace(".", " "), "actor": actor.nombre_completo if actor else None,
                          "recurso": "Proceso", "recurso_id": proceso.id, "visibilidad": INTERNAL, "fecha": audit.created_at})
    radicado_ids = [enlace.radicado_id for enlace in proceso.radicados]
    for tarea in db.query(models.Tarea).filter(models.Tarea.proceso_id == proceso.id).all():
        if cliente_id is not None and tarea.cliente_id != cliente_id:
            continue
        items.append({"id": f"tarea:{tarea.id}", "tipo": "TAREA", "titulo": tarea.titulo,
                      "descripcion": "Tarea asignada al cliente" if tarea.cliente_id else "Tarea interna del proceso",
                      "actor": tarea.usuario.nombre_completo if tarea.usuario else None,
                      "recurso": "Tarea", "recurso_id": tarea.id,
                      "visibilidad": CLIENT_VISIBLE if tarea.cliente_id else INTERNAL, "fecha": tarea.created_at})
    events_query = db.query(models.EventoAgenda).filter(models.EventoAgenda.proceso_id == proceso.id)
    if cliente_id is not None:
        events_query = events_query.filter(or_(
            models.EventoAgenda.cliente_id == cliente_id,
            models.EventoAgenda.cliente_id.is_(None),
        ))
    for event in events_query.all():
        items.append({"id": f"evento:{event.id}", "tipo": event.tipo, "titulo": event.titulo,
                      "descripcion": event.descripcion or "Evento de agenda programado", "actor": event.responsable.nombre_completo if event.responsable else None,
                      "recurso": "Agenda", "recurso_id": event.id,
                      "visibilidad": CLIENT_VISIBLE, "fecha": event.fecha_inicio})
    for solicitud in db.query(models.SolicitudDocumento).filter(models.SolicitudDocumento.proceso_id == proceso.id).all():
        if cliente_id is not None and solicitud.cliente_id != cliente_id:
            continue
        items.append({"id": f"solicitud:{solicitud.id}", "tipo": "DOCUMENTO", "titulo": solicitud.titulo,
                      "descripcion": "Solicitud documental atendida" if solicitud.atendida_en else "Documento solicitado al cliente",
                      "actor": None, "recurso": "Solicitud de documento", "recurso_id": solicitud.id,
                      "visibilidad": CLIENT_VISIBLE, "fecha": solicitud.atendida_en or solicitud.created_at})
    docs_query = db.query(models.DocumentoProceso).filter(models.DocumentoProceso.proceso_id == proceso.id)
    if cliente_id is not None:
        docs_query = docs_query.filter(models.DocumentoProceso.cliente_id == cliente_id)
    for documento in docs_query.all():
        items.append({"id": f"documento:{documento.id}", "tipo": "DOCUMENTO", "titulo": documento.nombre_archivo,
                      "descripcion": "Documento recibido" if documento.cliente_id else "Documento incorporado al proceso",
                      "actor": documento.cliente.nombre_completo if documento.cliente else None,
                      "recurso": "Documento", "recurso_id": documento.id,
                      "visibilidad": CLIENT_VISIBLE if documento.cliente_id else INTERNAL, "fecha": documento.created_at})
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
            "cliente_id": evento.cliente_id, "cliente": evento.cliente.nombre_completo if evento.cliente else None,
            "contrato_id": evento.contrato_id}


def _validar_contrato_evento(proceso: models.Proceso, tipo: str, contrato_id: int | None, cliente: models.Usuario | None, db: Session, actor: models.Usuario, permitir_firmado: bool = False):
    if tipo != "FIRMA_CONTRATO":
        if contrato_id is not None:
            raise HTTPException(status_code=400, detail="Solo los eventos de firma pueden asociarse a un contrato.")
        return None
    if contrato_id is None:
        raise HTTPException(status_code=400, detail="Selecciona el contrato cuya firma se va a agendar.")
    contrato = db.query(models.ContratoServicio).filter_by(
        id=contrato_id, proceso_id=proceso.id,
    ).with_for_update().first()
    if not contrato or contrato.cliente_id is None or (cliente and cliente.id != contrato.cliente_id):
        raise HTTPException(status_code=400, detail="El contrato debe pertenecer a este expediente y al cliente seleccionado.")
    estados_permitidos = {"LISTO_PARA_FIRMA", "EN_FIRMA"} | ({"FIRMADO"} if permitir_firmado else set())
    if contrato.estado not in estados_permitidos:
        raise HTTPException(status_code=409, detail="El contrato debe estar listo para firma antes de agendarla.")
    if cliente is None:
        raise HTTPException(status_code=400, detail="Selecciona el cliente que asistirá a la firma.")
    if contrato.estado == "LISTO_PARA_FIRMA":
        contrato.estado = "EN_FIRMA"
        version_number = max([version.version for version in contrato.versiones] or [contrato.version_actual]) + 1
        contrato.version_actual = version_number
        db.add(models.ContratoServicioVersion(
            contrato_id=contrato.id, version=version_number, estado="EN_FIRMA",
            contenido=json.dumps(contrato.campos_actual or {}, ensure_ascii=False, sort_keys=True),
            campos=contrato.campos_actual or {}, parte_cliente_snapshot=contrato.parte_cliente_snapshot,
            hash_sha256=hashlib.sha256(json.dumps(contrato.campos_actual or {}, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
            creado_por_id=actor.id,
        ))
        registrar_evento_auditoria(db, actor, "contrato.estado", "contrato_servicio", contrato.id, {"estado": "EN_FIRMA", "origen": "evento_agenda"})
    return contrato


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
        "genero": solicitud.genero_solicitado,
        "numero_documento": solicitud.numero_documento_solicitado,
        "domicilio": solicitud.domicilio_solicitado,
        "direccion": solicitud.direccion_solicitada,
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
                "visible_cliente": enlace.visible_cliente,
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
    plantilla_clave: str | None = None,
    variables: dict | None = None,
    enlace_texto: str | None = None,
    enlace_url: str | None = None,
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
        plantilla_clave=plantilla_clave,
        variables=variables,
        enlace_texto=enlace_texto,
        enlace_url=enlace_url,
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
        cuerpo = ""
        _notificar(db, destinatario, asunto, cuerpo, tipo,
                   f"ACCION_PROCESO:{proceso.id}:{uuid4().hex}", emisor=actor,
                   plantilla_clave="PROCESO_ACTUALIZACION",
                   variables={"nombre": destinatario.nombre_completo, "actor": actor.nombre_completo,
                              "accion": accion, "proceso": proceso.nombre,
                              "fecha": format_colombia_datetime(utc_ahora()), "detalle": detalle},
                   enlace_texto="Ver proceso",
                   enlace_url=user_portal_url(destinatario, f"/gestion-procesos/cliente/procesos/{proceso.id}"))


def _notificar_evento_agenda(
    db: Session,
    proceso: models.Proceso,
    evento: models.EventoAgenda,
    actor: models.Usuario,
    accion: str,
    cliente: models.Usuario | None = None,
) -> None:
    """Notify the selected client, or every active client attached to the process."""
    destinatarios = [cliente] if cliente else [
        enlace.cliente for enlace in proceso.clientes
        if enlace.cliente
        and enlace.cliente.rol == models.RolUsuario.CLIENTE
        and enlace.cliente.estado == models.EstadoUsuario.ACTIVO
    ]
    fecha_inicio = format_colombia_datetime(evento.fecha_inicio)
    fecha_fin = format_colombia_datetime(evento.fecha_fin) if evento.fecha_fin else "No indicada"
    responsable = evento.responsable.nombre_completo if evento.responsable else "No asignado"
    for destinatario in destinatarios:
        if destinatario.estado != models.EstadoUsuario.ACTIVO:
            continue
        cuerpo = ""
        _notificar(
            db, destinatario, f"{accion.capitalize()} actividad: {evento.titulo}", cuerpo,
            "RESUMENES", f"EVENTO_AGENDA:{evento.id}:{accion.upper()}:{evento.fecha_inicio.isoformat()}",
            emisor=actor,
            plantilla_clave="EVENTO_AGENDA",
            variables={"nombre": destinatario.nombre_completo, "actor": actor.nombre_completo,
                       "accion": accion, "proceso": proceso.nombre, "actividad": evento.titulo,
                       "tipo": evento.tipo, "estado": evento.estado, "inicio": fecha_inicio,
                       "fin": fecha_fin, "responsable": responsable,
                       "detalle": evento.descripcion or "Sin detalles adicionales"},
            enlace_texto="Ver agenda",
            enlace_url=user_portal_url(destinatario, f"/gestion-procesos/cliente/procesos/{proceso.id}#evento-{evento.id}"),
        )


def _estado_proceso_cliente(proceso: models.Proceso) -> tuple[str, str]:
    estados = [(link.radicado.estado_consulta or "").casefold() for link in proceso.radicados if link.radicado]
    if not estados:
        return "En preparación", "El despacho está organizando la información del proceso."
    if any(estado.startswith("error") for estado in estados):
        return "En seguimiento", "El despacho está verificando una actualización judicial."
    if any(estado == "ok" for estado in estados):
        return "En trámite", "El despacho realiza seguimiento a las novedades de este proceso."
    return "En seguimiento", "El despacho está revisando la información judicial disponible."


def _obtener_proceso_cliente(proceso_id: int, cliente: models.Usuario, db: Session) -> models.Proceso:
    proceso = db.query(models.Proceso).join(models.ProcesoCliente).filter(
        models.Proceso.id == proceso_id,
        models.ProcesoCliente.cliente_id == cliente.id,
        models.Proceso.archivado_en.is_(None),
    ).first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")
    return proceso


def _timeline_cliente_visible(proceso: models.Proceso, db: Session, cliente_id: int) -> list[dict]:
    """Return only customer-visible events and omit scraped/internal annotations."""
    timeline = _timeline_proceso(proceso, db, cliente_id=cliente_id)
    radicado_ids = [link.radicado_id for link in proceso.radicados]
    ultimas_actuaciones = set()
    if radicado_ids:
        actuaciones = db.query(models.Actuacion).filter(models.Actuacion.radicado_id.in_(radicado_ids)).order_by(
            models.Actuacion.radicado_id, models.Actuacion.orden.asc(), models.Actuacion.id.desc(),
        ).all()
        vistos = set()
        for actuacion in actuaciones:
            if actuacion.radicado_id not in vistos:
                vistos.add(actuacion.radicado_id)
                ultimas_actuaciones.add(actuacion.id)
    for item in timeline:
        if item.get("tipo") == "ACTUACION":
            if item.get("recurso_id") not in ultimas_actuaciones:
                item["_ocultar_cliente"] = True
            item["descripcion"] = "Se registró una actuación en el radicado."
            item.pop("anotacion", None)
        item.pop("visibilidad", None)
    return [item for item in timeline if not item.pop("_ocultar_cliente", False)]


def _documentos_requeridos(solicitud: models.SolicitudDocumento) -> list[dict[str, str]]:
    items = solicitud.documentos_requeridos or []
    if items:
        return [{"id": str(item.get("id") or "legacy"), "nombre": str(item.get("nombre") or solicitud.titulo)} for item in items]
    return [{"id": "legacy", "nombre": solicitud.titulo}]


def _documento_actual_por_item(solicitud: models.SolicitudDocumento, items: list[dict[str, str]]) -> dict[str, models.DocumentoProceso]:
    actuales: dict[str, models.DocumentoProceso] = {}
    item_ids = {item["id"] for item in items}
    for documento in sorted(solicitud.documentos, key=lambda item: (item.created_at, item.id)):
        item_id = documento.solicitud_item_id or (items[0]["id"] if len(items) == 1 else None)
        if item_id in item_ids:
            actuales[item_id] = documento
    return actuales


def _estado_solicitud_documento(items: list[dict]) -> str:
    states = [item["estado"] for item in items]
    if any(state == "FALTANTE" for state in states):
        return "FALTAN_DOCUMENTOS"
    if any(state in {"REQUIERE_CORRECCION", "RECHAZADO"} for state in states):
        return "RECHAZADO"
    if any(state == "EN_REVISION" for state in states):
        return "EN_REVISION"
    if states and all(state == "APROBADO" for state in states):
        return "APROBADO"
    return "DOCUMENTOS_SUMINISTRADOS"


def _resumen_solicitud_documento(solicitud: models.SolicitudDocumento) -> dict:
    required = _documentos_requeridos(solicitud)
    current = _documento_actual_por_item(solicitud, required)
    items = [{
        "id": item["id"], "nombre": item["nombre"],
        "estado": current[item["id"]].estado_revision if item["id"] in current else "FALTANTE",
        "documento": ({
            "id": current[item["id"]].id,
            "nombre_archivo": current[item["id"]].nombre_archivo,
            "estado_revision": current[item["id"]].estado_revision,
            "comentario_revision": current[item["id"]].comentario_revision,
        } if item["id"] in current else None),
    } for item in required]
    return {"estado": _estado_solicitud_documento(items), "documentos_requeridos": items}


def _staff_scope(usuario: models.Usuario, db: Session):
    require_roles(usuario, [models.RolUsuario.ADMIN, models.RolUsuario.ABOGADO_ADMIN], action="consultar la información de gestión")
    return None if usuario.rol == models.RolUsuario.ADMIN else lawyer_process_ids(db, usuario)
