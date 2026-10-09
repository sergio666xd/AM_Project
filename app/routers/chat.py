from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, security
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.firm_access import lawyer_process_ids, require_process_access, role_name
from app.notification_service import emitir_notificacion_workflow
from app.timezone import format_colombia_datetime
from app.workflow_service import public_site_url

router = APIRouter(prefix="/api/chat", tags=["Chat"])
STAFF_ROLES = {"ADMIN", "ABOGADO", "ABOGADO_ADMIN"}


def _role(user: models.Usuario) -> str:
    return role_name(user)


def _chat_area(user: models.Usuario) -> str:
    return {"CLIENTE": "cliente", "ADMIN": "admin"}.get(_role(user), "abogado")


def _path_id(value: str) -> int:
    if not value.isdecimal():
        raise HTTPException(status_code=404, detail="Ruta de chat no válida.")
    return int(value)


def _active_user(db: Session, user_id: int) -> models.Usuario:
    user = db.query(models.Usuario).filter_by(id=user_id).first()
    if not user or user.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(status_code=404, detail="Participante no disponible.")
    return user


def _process(db: Session, process_id: int, user: models.Usuario) -> models.Proceso:
    process = db.query(models.Proceso).filter_by(id=process_id, archivado_en=None).first()
    if not process:
        raise HTTPException(status_code=404, detail="Proceso no disponible.")
    if _role(user) == "CLIENTE":
        linked = db.query(models.ProcesoCliente).filter_by(proceso_id=process_id, cliente_id=user.id).first()
        if not linked:
            raise HTTPException(status_code=403, detail="No tienes acceso a este proceso.")
    else:
        require_process_access(user, process.abogado_id, process_id=process.id, db=db)
    return process


def _upsert_conversation(
    db: Session, *, key: str, kind: str, actor: models.Usuario,
    participants: list[models.Usuario], process_id: int | None = None,
    client_id: int | None = None,
) -> models.ChatConversacion:
    conversation = db.query(models.ChatConversacion).filter_by(clave=key).first()
    if conversation is None:
        conversation = models.ChatConversacion(
            clave=key, tipo=kind, proceso_id=process_id, cliente_id=client_id,
            creado_por_id=actor.id, updated_at=datetime.utcnow(),
        )
        db.add(conversation)
        db.flush()
    participant_ids = {item.id for item in participants}
    current = {item.usuario_id: item for item in conversation.participantes}
    for user_id in participant_ids:
        if user_id not in current:
            db.add(models.ChatParticipante(conversacion_id=conversation.id, usuario_id=user_id))
    for user_id, row in current.items():
        if user_id not in participant_ids:
            db.delete(row)
    return conversation


def _conversation_for_actor(db: Session, conversation_id: int, user: models.Usuario) -> models.ChatConversacion:
    conversation = db.query(models.ChatConversacion).filter_by(id=conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversación no encontrada.")
    participant = db.query(models.ChatParticipante).filter_by(
        conversacion_id=conversation.id, usuario_id=user.id,
    ).first()
    if not participant:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta conversación.")
    if conversation.proceso_id is not None:
        _process(db, conversation.proceso_id, user)
    return conversation


def _display_conversation(db: Session, conversation: models.ChatConversacion, user: models.Usuario) -> dict:
    other = next((item.usuario for item in conversation.participantes if item.usuario_id != user.id and item.usuario), None)
    if conversation.tipo == "PROCESO_COLABORADORES":
        title = "Colaboradores"
        subtitle = conversation.proceso.nombre if conversation.proceso else "Proceso"
        base = f"/gestion-procesos/{_chat_area(user)}/chat/{conversation.proceso_id}/colaboradores"
        route_key = f"process:{conversation.proceso_id}:collaborators"
    elif conversation.tipo == "PROCESO_DIRECTO":
        title = other.nombre_completo if other else "Conversación del proceso"
        subtitle = conversation.proceso.nombre if conversation.proceso else "Proceso"
        target_id = other.id if other else 0
        base = f"/gestion-procesos/{_chat_area(user)}/chat/{conversation.proceso_id}/{target_id}"
        route_key = f"process:{conversation.proceso_id}:{target_id}"
    else:
        title = other.nombre_completo if other else "Conversación del despacho"
        subtitle = "Conversación directa"
        target_path = "administrador" if other and _role(other) == "ADMIN" else f"directo/{other.id if other else 0}"
        base = f"/gestion-procesos/{_chat_area(user)}/chat/{target_path}"
        route_key = f"direct:{'administrador' if other and _role(other) == 'ADMIN' else (other.id if other else 0)}"
    last = db.query(models.ChatMensaje).filter_by(conversacion_id=conversation.id).order_by(models.ChatMensaje.id.desc()).first()
    own_participant = next((item for item in conversation.participantes if item.usuario_id == user.id), None)
    last_read_id = own_participant.ultimo_leido_mensaje_id if own_participant else 0
    unread = db.query(models.ChatMensaje).filter(
        models.ChatMensaje.conversacion_id == conversation.id,
        models.ChatMensaje.remitente_id != user.id,
        models.ChatMensaje.id > last_read_id,
    ).count()
    return {
        "id": conversation.id, "clave": conversation.clave, "route_key": route_key, "tipo": conversation.tipo,
        "titulo": title, "subtitulo": subtitle, "href": base, "no_leidos": unread,
        "proceso_id": conversation.proceso_id,
        "updated_at": last.created_at if last else conversation.updated_at,
        "ultimo_mensaje": last.contenido if last else None,
        "ultimo_remitente": last.remitente.nombre_completo if last and last.remitente else None,
    }


def _message_reference_url(message: models.ChatMensaje, conversation: models.ChatConversacion, user: models.Usuario) -> str | None:
    if message.referencia_tipo != "DOCUMENTO" or conversation.proceso_id is None:
        return message.referencia_url
    if _role(user) == "CLIENTE":
        return f"/gestion-procesos/cliente/procesos/{conversation.proceso_id}#documentos"
    if _role(user) == "ADMIN":
        return "/gestion-procesos/admin/documentos"
    return f"/gestion-procesos/abogado/documentos?proceso={conversation.proceso_id}#documento-{message.referencia_id}"


def _message_delivery(message: models.ChatMensaje, participants: list[models.ChatParticipante]) -> dict:
    recipients = [item for item in participants if item.usuario_id != message.remitente_id]
    recipient_count = len(recipients)
    delivered_count = sum(item.ultimo_entregado_mensaje_id >= message.id for item in recipients)
    read_count = sum(item.ultimo_leido_mensaje_id >= message.id for item in recipients)
    if recipient_count and read_count == recipient_count:
        status = "LEIDO"
    elif recipient_count and delivered_count == recipient_count:
        status = "ENTREGADO"
    elif delivered_count:
        status = "ENTREGADO_PARCIAL"
    else:
        status = "ENVIADO"
    return {
        "estado_entrega": status,
        "entregados": delivered_count,
        "leidos": read_count,
        "destinatarios": recipient_count,
    }


def _create_available_conversations(db: Session, user: models.Usuario) -> list[models.ChatConversacion]:
    role = _role(user)
    conversations: list[models.ChatConversacion] = []
    if role in STAFF_ROLES:
        peer_roles = {"ABOGADO", "ABOGADO_ADMIN"} if role in {"ADMIN", "ABOGADO_ADMIN"} else {"ADMIN", "ABOGADO_ADMIN"}
        peers = db.query(models.Usuario).filter(
            models.Usuario.rol.in_(peer_roles), models.Usuario.estado == models.EstadoUsuario.ACTIVO,
            models.Usuario.id != user.id,
        ).order_by(models.Usuario.nombre_completo).all()
        for peer in peers:
            a, b = sorted((user.id, peer.id))
            conversations.append(_upsert_conversation(
                db, key=f"staff:{a}:{b}", kind="STAFF_DIRECT", actor=user, participants=[user, peer],
            ))

    if role == "CLIENTE":
        process_ids = [row.proceso_id for row in db.query(models.ProcesoCliente).filter_by(cliente_id=user.id).all()]
        processes = db.query(models.Proceso).filter(
            models.Proceso.id.in_(process_ids or [-1]), models.Proceso.archivado_en.is_(None),
        ).all()
        for process in processes:
            process_staff = [process.abogado, *[row.abogado for row in process.colaboradores if row.visible_cliente]]
            for staff in {item.id: item for item in process_staff if item and item.estado == models.EstadoUsuario.ACTIVO}.values():
                conversations.append(_upsert_conversation(
                    db, key=f"process:{process.id}:direct:{min(user.id, staff.id)}:{max(user.id, staff.id)}",
                    kind="PROCESO_DIRECTO", actor=user, participants=[user, staff], process_id=process.id,
                    client_id=user.id,
                ))
    elif role in STAFF_ROLES:
        if role == "ADMIN":
            processes = db.query(models.Proceso).filter(models.Proceso.archivado_en.is_(None)).all()
        else:
            ids = [row[0] for row in db.query(models.Proceso.id).filter(models.Proceso.id.in_(lawyer_process_ids(db, user))).all()]
            processes = db.query(models.Proceso).filter(models.Proceso.id.in_(ids or [-1]), models.Proceso.archivado_en.is_(None)).all()
        for process in processes:
            linked_clients = [row.cliente for row in db.query(models.ProcesoCliente).filter_by(proceso_id=process.id).all() if row.cliente and row.cliente.estado == models.EstadoUsuario.ACTIVO]
            direct_chat_staff = {process.abogado_id}
            direct_chat_staff.update(row.abogado_id for row in process.colaboradores if row.visible_cliente)
            if user.id in direct_chat_staff:
                for client in linked_clients:
                    participants = [user, client]
                    conversations.append(_upsert_conversation(
                        db, key=f"process:{process.id}:direct:{min(client.id, user.id)}:{max(client.id, user.id)}",
                        kind="PROCESO_DIRECTO", actor=user, participants=participants, process_id=process.id,
                        client_id=client.id,
                    ))
            collaborators = [row.abogado for row in process.colaboradores if row.abogado and row.abogado.estado == models.EstadoUsuario.ACTIVO]
            participants = list({item.id: item for item in [process.abogado, *collaborators] if item}.values())
            if user in participants:
                conversations.append(_upsert_conversation(
                    db, key=f"process:{process.id}:collaborators", kind="PROCESO_COLABORADORES",
                    actor=user, participants=participants, process_id=process.id,
                ))
    return conversations


def _resolve(db: Session, key: str, user: models.Usuario) -> models.ChatConversacion:
    role = _role(user)
    parts = key.split(":")
    if parts[0] == "direct" and len(parts) == 2:
        if role not in STAFF_ROLES:
            raise HTTPException(status_code=403, detail="Esta conversación es solo para el equipo jurídico.")
        if parts[1].lower() in {"admin", "administrador"}:
            peer = db.query(models.Usuario).filter(
                models.Usuario.rol == "ADMIN", models.Usuario.estado == models.EstadoUsuario.ACTIVO,
                models.Usuario.id != user.id,
            ).order_by(models.Usuario.id).first()
            if not peer:
                raise HTTPException(status_code=404, detail="No hay un administrador disponible.")
        else:
            peer = _active_user(db, _path_id(parts[1]))
            if _role(peer) not in STAFF_ROLES or peer.id == user.id:
                raise HTTPException(status_code=400, detail="El destinatario no es un integrante del equipo.")
        a, b = sorted((user.id, peer.id))
        return _upsert_conversation(db, key=f"staff:{a}:{b}", kind="STAFF_DIRECT", actor=user, participants=[user, peer])

    if parts[0] == "process" and len(parts) == 3:
        if role == "ADMIN":
            raise HTTPException(status_code=403, detail="El chat del proceso está reservado a sus participantes.")
        process = _process(db, _path_id(parts[1]), user)
        if parts[2] == "collaborators":
            if role == "CLIENTE":
                raise HTTPException(status_code=403, detail="El chat de colaboradores es interno.")
            collaborators = [row.abogado for row in process.colaboradores if row.abogado and row.abogado.estado == models.EstadoUsuario.ACTIVO]
            participants = list({item.id: item for item in [process.abogado, *collaborators] if item}.values())
            if user not in participants:
                raise HTTPException(status_code=403, detail="No participas en este proceso.")
            return _upsert_conversation(db, key=f"process:{process.id}:collaborators", kind="PROCESO_COLABORADORES", actor=user, participants=participants, process_id=process.id)
        target = _active_user(db, _path_id(parts[2]))
        if role == "CLIENTE":
            collaborator = db.query(models.ProcesoColaborador).filter_by(
                proceso_id=process.id, abogado_id=target.id, visible_cliente=True,
            ).first()
            if target.id != process.abogado_id and not collaborator:
                raise HTTPException(status_code=403, detail="El contacto no corresponde a este proceso.")
            client = user
            peer = target
        else:
            linked_client = db.query(models.ProcesoCliente).filter_by(proceso_id=process.id, cliente_id=target.id).first()
            if linked_client:
                collaborator = db.query(models.ProcesoColaborador).filter_by(
                    proceso_id=process.id, abogado_id=user.id, visible_cliente=True,
                ).first()
                if user.id != process.abogado_id and not collaborator:
                    raise HTTPException(status_code=403, detail="Solo el abogado responsable puede abrir el chat con el cliente.")
                client, peer = target, user
            elif target.id == process.abogado_id or db.query(models.ProcesoColaborador).filter_by(proceso_id=process.id, abogado_id=target.id).first():
                if target.id == user.id:
                    raise HTTPException(status_code=400, detail="Selecciona a otro participante.")
                a, b = sorted((user.id, target.id))
                return _upsert_conversation(db, key=f"process:{process.id}:direct:{a}:{b}", kind="PROCESO_DIRECTO", actor=user, participants=[user, target], process_id=process.id)
            else:
                raise HTTPException(status_code=403, detail="El destinatario no pertenece a este proceso.")
        a, b = sorted((client.id, peer.id))
        return _upsert_conversation(db, key=f"process:{process.id}:direct:{a}:{b}", kind="PROCESO_DIRECTO", actor=user, participants=[client, peer], process_id=process.id, client_id=client.id)
    raise HTTPException(status_code=404, detail="Ruta de chat no válida.")


@router.get("/conversaciones")
def listar_conversaciones(db: Session = Depends(get_db), user: models.Usuario = Depends(security.obtener_usuario_actual)):
    conversations = _create_available_conversations(db, user)
    member_ids = [row.conversacion_id for row in db.query(models.ChatParticipante).filter_by(usuario_id=user.id).all()]
    saved = db.query(models.ChatConversacion).filter(models.ChatConversacion.id.in_(member_ids or [-1])).all()
    by_id = {item.id: item for item in [*saved, *conversations]}
    db.commit()
    result = []
    for item in by_id.values():
        try:
            _conversation_for_actor(db, item.id, user)
        except HTTPException:
            continue
        result.append(_display_conversation(db, item, user))
    return sorted(result, key=lambda item: item["updated_at"], reverse=True)


@router.get("/resolver")
def resolver_conversacion(clave: str, after_id: int = 0, db: Session = Depends(get_db), user: models.Usuario = Depends(security.obtener_usuario_actual)):
    conversation = _resolve(db, clave, user)
    conversation = _conversation_for_actor(db, conversation.id, user)
    participant = next((item for item in conversation.participantes if item.usuario_id == user.id), None)
    message_query = db.query(models.ChatMensaje).filter(models.ChatMensaje.conversacion_id == conversation.id)
    if after_id > 0:
        messages = message_query.filter(models.ChatMensaje.id > after_id).order_by(models.ChatMensaje.id.asc()).limit(500).all()
    else:
        messages = list(reversed(message_query.order_by(models.ChatMensaje.id.desc()).limit(500).all()))
    status_messages = db.query(models.ChatMensaje).filter_by(
        conversacion_id=conversation.id,
        remitente_id=user.id,
    ).order_by(models.ChatMensaje.id.desc()).limit(500).all()
    if participant and messages:
        participant.ultimo_entregado_mensaje_id = max(
            participant.ultimo_entregado_mensaje_id,
            messages[-1].id,
        )
    db.commit()
    return {
        "conversacion": _display_conversation(db, conversation, user),
        "participantes": [{"id": item.usuario.id, "nombre": item.usuario.nombre_completo} for item in conversation.participantes if item.usuario],
        "estados_mensajes": [{"id": item.id, **_message_delivery(item, conversation.participantes)} for item in status_messages],
        "mensajes": [{
            "id": item.id, "contenido": item.contenido, "remitente_id": item.remitente_id,
            "remitente": item.remitente.nombre_completo if item.remitente else "Usuario eliminado",
            "es_mio": item.remitente_id == user.id, "created_at": item.created_at,
            **_message_delivery(item, conversation.participantes),
            "referencia": ({"tipo": item.referencia_tipo, "id": item.referencia_id, "titulo": item.referencia_titulo, "url": _message_reference_url(item, conversation, user)} if item.referencia_tipo else None),
        } for item in messages],
    }


@router.post("/conversaciones/{conversation_id}/leido")
def marcar_conversacion_leida(
    conversation_id: int,
    data: schemas.ChatMensajeLeidoUpdate,
    db: Session = Depends(get_db),
    user: models.Usuario = Depends(security.obtener_usuario_actual),
):
    conversation = _conversation_for_actor(db, conversation_id, user)
    participant = next((item for item in conversation.participantes if item.usuario_id == user.id), None)
    message = db.query(models.ChatMensaje).filter_by(
        id=data.mensaje_id,
        conversacion_id=conversation.id,
    ).first()
    if not participant or not message:
        raise HTTPException(status_code=404, detail="No se encontró el mensaje de esta conversación.")
    participant.ultimo_entregado_mensaje_id = max(participant.ultimo_entregado_mensaje_id, message.id)
    participant.ultimo_leido_mensaje_id = max(participant.ultimo_leido_mensaje_id, message.id)
    participant.ultimo_leido_en = datetime.utcnow()
    db.commit()
    return {"leido_hasta": participant.ultimo_leido_mensaje_id}


def _document_visible_to_user(db: Session, document: models.DocumentoProceso, process: models.Proceso, viewer: models.Usuario) -> bool:
    role = _role(viewer)
    if role == "ADMIN":
        return True
    if role == "CLIENTE":
        linked = db.query(models.ProcesoCliente.id).filter_by(proceso_id=process.id, cliente_id=viewer.id).first()
        if not linked or document.cliente_id != viewer.id:
            return False
        if document.contrato_id is not None:
            contract = db.query(models.ContratoServicio).filter_by(id=document.contrato_id, proceso_id=process.id, cliente_id=viewer.id).first()
            latest = db.query(models.DocumentoProceso.id).filter_by(contrato_id=document.contrato_id).order_by(
                models.DocumentoProceso.created_at.desc(), models.DocumentoProceso.id.desc(),
            ).first()
            return bool(contract and contract.estado in {"FIRMADO", "TERMINADO"} and latest and latest[0] == document.id)
        return True
    if role in {"ABOGADO", "ABOGADO_ADMIN"}:
        return process.id in {row[0] for row in lawyer_process_ids(db, viewer)}
    return False


def _listar_referencias(process: models.Proceso, conversation: models.ChatConversacion, db: Session, user: models.Usuario):
    if _role(user) == "CLIENTE":
        raise HTTPException(status_code=403, detail="Solo el equipo puede adjuntar referencias.")
    result = []
    for item in db.query(models.Actuacion).join(models.ProcesoRadicado, models.ProcesoRadicado.radicado_id == models.Actuacion.radicado_id).filter(models.ProcesoRadicado.proceso_id == process.id).order_by(models.Actuacion.fecha_actuacion.desc()).limit(100).all():
        description = item.actuacion or item.anotacion or "Actuacion judicial"
        result.append({"tipo": "ACTUACION", "id": item.id, "titulo": f"Actuacion - {description[:180]}", "href": f"/gestion-procesos/abogado/procesos/{process.id}/radicados"})
    for item in db.query(models.Tarea).filter_by(proceso_id=process.id).order_by(models.Tarea.created_at.desc()).limit(100).all():
        result.append({"tipo": "TAREA", "id": item.id, "titulo": f"Tarea - {item.titulo}", "href": f"/gestion-procesos/abogado/procesos/{process.id}/tareas"})
    for item in db.query(models.EventoAgenda).filter_by(proceso_id=process.id).order_by(models.EventoAgenda.fecha_inicio.desc()).limit(100).all():
        result.append({"tipo": "EVENTO", "id": item.id, "titulo": f"Evento - {item.titulo}", "href": f"/gestion-procesos/abogado/procesos/{process.id}/agenda"})
    participants = [item.usuario for item in conversation.participantes if item.usuario]
    documents = db.query(models.DocumentoProceso).filter_by(proceso_id=process.id).order_by(
        models.DocumentoProceso.created_at.desc(), models.DocumentoProceso.id.desc(),
    ).limit(300).all()
    for document in documents:
        if not participants or not all(_document_visible_to_user(db, document, process, participant) for participant in participants):
            continue
        title = document.solicitud.titulo if document.solicitud else document.nombre_archivo
        display_title = f"Documento - {title} - {document.nombre_archivo}" if document.solicitud else f"Documento - {title}"
        result.append({"tipo": "DOCUMENTO", "id": document.id, "titulo": display_title,
                       "href": f"/gestion-procesos/abogado/documentos?proceso={process.id}#documento-{document.id}"})
    return result


@router.get("/referencias/{process_id}")
def listar_referencias(process_id: int, conversation_id: int | None = None, clave: str | None = None, db: Session = Depends(get_db), user: models.Usuario = Depends(security.obtener_usuario_actual)):
    process = _process(db, process_id, user)
    if conversation_id is not None:
        conversation = _conversation_for_actor(db, conversation_id, user)
    elif clave:
        conversation = _resolve(db, clave, user)
    else:
        raise HTTPException(status_code=400, detail="Debes indicar la conversacion para validar el acceso.")
    if conversation.proceso_id != process.id:
        raise HTTPException(status_code=404, detail="La conversacion no corresponde a este proceso.")
    return _listar_referencias(process, conversation, db, user)


@router.post("/conversaciones/{conversation_id}/mensajes", status_code=201)
def enviar_mensaje(conversation_id: int, data: schemas.ChatMensajeCreate, db: Session = Depends(get_db), user: models.Usuario = Depends(security.obtener_usuario_actual)):
    conversation = _conversation_for_actor(db, conversation_id, user)
    content = data.contenido.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Escribe un mensaje antes de enviarlo.")
    reference = None
    if data.referencia_tipo:
        if _role(user) == "CLIENTE" or conversation.proceso_id is None:
            raise HTTPException(status_code=403, detail="No puedes adjuntar referencias en esta conversación.")
        process = _process(db, conversation.proceso_id, user)
        options = _listar_referencias(process, conversation, db, user)
        reference = next((item for item in options if item["tipo"] == data.referencia_tipo and item["id"] == data.referencia_id), None)
        if not reference:
            raise HTTPException(status_code=404, detail="La referencia no pertenece a este proceso.")
    message = models.ChatMensaje(
        conversacion_id=conversation.id, remitente_id=user.id, contenido=content,
        referencia_tipo=reference["tipo"] if reference else None,
        referencia_id=reference["id"] if reference else None,
        referencia_titulo=reference["titulo"] if reference else None,
        referencia_url=reference["href"] if reference else None,
    )
    conversation.updated_at = datetime.utcnow()
    participant = next((item for item in conversation.participantes if item.usuario_id == user.id), None)
    if participant:
        participant.ultimo_leido_en = datetime.utcnow()
    db.add(message)
    db.flush()
    registrar_evento_auditoria(db, user, "chat.mensaje.enviar", "chat_conversacion", conversation.id)
    db.commit()
    db.refresh(message)
    process = conversation.proceso
    link = f"{public_site_url()}{_display_conversation(db, conversation, next(item.usuario for item in conversation.participantes if item.usuario_id != user.id))[ 'href' ]}"
    for recipient in [item.usuario for item in conversation.participantes if item.usuario and item.usuario_id != user.id and item.usuario.estado == models.EstadoUsuario.ACTIVO]:
        staff_sender = _role(user) != "CLIENTE"
        template = "COMUNICACION_ABOGADO_CLIENTE" if staff_sender else "COMUNICACION_CLIENTE_ABOGADO"
        process_name = process.nombre if process else "Conversación del despacho"
        emitir_notificacion_workflow(
            db, recipient, "RESUMENES", f"CHAT:{message.id}:{recipient.id}",
            f"Nuevo mensaje de {user.nombre_completo}",
            f"{user.nombre_completo}: {content}", emisor=user, plantilla_clave=template,
            variables={"nombre": recipient.nombre_completo, "actor": user.nombre_completo,
                       "proceso": process_name, "asunto": "Nuevo mensaje", "fecha": format_colombia_datetime(message.created_at),
                       "mensaje": content}, enlace_texto="Abrir conversación", enlace_url=link,
        )
    return {"id": message.id, "mensaje": "Mensaje enviado."}
