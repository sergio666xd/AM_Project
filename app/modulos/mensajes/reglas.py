"""Reglas del chat: quién conversa con quién, qué se puede adjuntar y cómo se avisa.

Cada proceso tiene sus conversaciones (cliente y responsable, colaboradores,
equipo y administración). Aquí se crean las que le corresponden a cada
persona, se valida el acceso, se guardan los mensajes y se avisa por push,
correo o WhatsApp respetando la presencia en el panel y una pausa entre avisos.
"""
import hashlib
import hmac
import json
import logging
import os
from datetime import timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app import models, security
from app.audit import registrar_evento_auditoria
from app.firm_access import lawyer_process_ids, require_process_access, role_name
from app.notification_policy import canales_habilitados
from app.notification_service import emitir_notificacion_workflow
from app.nucleo.errores import DatosInvalidos, NoEncontrado, SinPermiso
from app.timezone import utc_ahora
from app.web_push import firm_push_icon
from app.workflow_service import compact_portal_path, user_portal_url

logger = logging.getLogger(__name__)


STAFF_ROLES = {"ADMIN", "ABOGADO", "ABOGADO_ADMIN"}


PANEL_PRESENCE_TTL = timedelta(seconds=90)


CHAT_NOTIFICATION_COOLDOWN = timedelta(hours=1)


def _role(user: models.Usuario) -> str:
    return role_name(user)


def _chat_area(user: models.Usuario) -> str:
    return {"CLIENTE": "cliente", "ADMIN": "admin"}.get(_role(user), "abogado")


def _supports_firm_panel_presence(user: models.Usuario) -> bool:
    return _role(user) in {"CLIENTE", "ABOGADO_ADMIN", "ADMIN"}


def _send_chat_push(
    db: Session,
    recipient: models.Usuario,
    sender: models.Usuario,
    link: str,
    *,
    title: str | None = None,
    body: str | None = None,
    tag: str | None = None,
    ack: dict | None = None,
) -> bool:
    public_key = os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY", "").strip()
    private_key = os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").strip()
    subject = os.getenv("WEB_PUSH_VAPID_SUBJECT", "mailto:contacto@alejandramunozabogada.com").strip()
    if not public_key or not private_key:
        missing = [name for name, value in (
            ("WEB_PUSH_VAPID_PUBLIC_KEY", public_key),
            ("WEB_PUSH_VAPID_PRIVATE_KEY", private_key),
        ) if not value]
        logger.warning(
            "Push no enviada al usuario %s: faltan variables de configuración %s.",
            recipient.id, ", ".join(missing),
        )
        return False
    subscriptions = db.query(models.ChatPushSubscription).filter_by(usuario_id=recipient.id).all()
    if not subscriptions:
        logger.info("Push no enviada al usuario %s: no tiene suscripciones registradas.", recipient.id)
        return False
    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:
        logger.exception("No se pudo importar pywebpush o una dependencia necesaria: %s", exc)
        return False

    delivered = False
    icon = firm_push_icon(db)
    payload_data = {
        "title": title or f"Nuevo mensaje de {sender.nombre_completo}",
        "body": f"{sender.nombre_completo} te está escribiendo.",
        "url": link,
        "tag": tag or f"chat-user-{sender.id}",
        "icon": icon,
        "badge": icon,
    }
    if body is not None:
        payload_data["body"] = body
    if ack:
        payload_data["ack"] = ack
    payload = json.dumps(payload_data, ensure_ascii=False)
    failed = 0
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
                ttl=60 * 60,
                timeout=8,
            )
            delivered = True
        except WebPushException as exc:
            failed += 1
            status_code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                db.delete(subscription)
                logger.info(
                    "Suscripción Push vencida eliminada para usuario %s (HTTP %s).",
                    recipient.id, status_code,
                )
            else:
                logger.warning(
                    "No se pudo entregar Web Push al usuario %s (HTTP %s).",
                    recipient.id, status_code or "desconocido",
                )
        except Exception as exc:
            failed += 1
            logger.exception("Error al enviar Web Push al usuario %s: %s", recipient.id, exc)
    if not delivered:
        logger.warning(
            "Push no enviada al usuario %s: fallaron sus %s suscripciones registradas.",
            recipient.id, failed,
        )
    elif failed:
        logger.warning(
            "Push entregada al usuario %s, pero fallaron %s de %s suscripciones.",
            recipient.id, failed, len(subscriptions),
        )
    return delivered


def _firma_entrega_push(usuario_id: int, mensaje_id: int) -> str:
    return hmac.new(
        security.get_jwt_secret().encode(),
        f"chat-push-entrega:{usuario_id}:{mensaje_id}".encode(),
        hashlib.sha256,
    ).hexdigest()


def firma_valida(usuario_id: int, mensaje_id: int, firma: str) -> bool:
    return hmac.compare_digest(firma, _firma_entrega_push(usuario_id, mensaje_id))


def _ack_entrega_push(usuario_id: int, mensaje_id: int) -> dict:
    return {
        "url": "/api/v2/push/entregado",
        "usuario_id": usuario_id,
        "mensaje_id": mensaje_id,
        "firma": _firma_entrega_push(usuario_id, mensaje_id),
    }


def _path_id(value: str) -> int:
    if not value.isdecimal():
        raise NoEncontrado("Ruta de chat no válida.")
    return int(value)


def _active_user(db: Session, user_id: int) -> models.Usuario:
    user = db.query(models.Usuario).filter_by(id=user_id).first()
    if not user or user.estado != models.EstadoUsuario.ACTIVO:
        raise NoEncontrado("Participante no disponible.")
    return user


def _process(db: Session, process_id: int, user: models.Usuario) -> models.Proceso:
    process = db.query(models.Proceso).filter_by(id=process_id, archivado_en=None).first()
    if not process:
        raise NoEncontrado("Proceso no disponible.")
    if _role(user) == "CLIENTE":
        linked = db.query(models.ProcesoCliente).filter_by(proceso_id=process_id, cliente_id=user.id).first()
        if not linked:
            raise SinPermiso("Esta cuenta no tiene acceso a este proceso.")
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
            creado_por_id=actor.id, updated_at=utc_ahora(),
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
        raise NoEncontrado("Conversación no encontrada.")
    participant = db.query(models.ChatParticipante).filter_by(
        conversacion_id=conversation.id, usuario_id=user.id,
    ).first()
    if not participant:
        raise SinPermiso("Esta cuenta no tiene acceso a esta conversación.")
    if conversation.proceso_id is not None:
        _process(db, conversation.proceso_id, user)
    return conversation


def _display_conversation(db: Session, conversation: models.ChatConversacion, user: models.Usuario) -> dict:
    return _display_conversations(db, [conversation], user)[0]


def _display_conversations(db: Session, conversations: list[models.ChatConversacion], user: models.Usuario) -> list[dict]:
    """Serializa varias conversaciones con un número fijo de consultas.

    La lista se consulta periódicamente desde cada pestaña abierta, por lo que
    presencia, último mensaje y no leídos se calculan en bloque.
    """
    if not conversations:
        return []
    conversation_ids = [item.id for item in conversations]
    other_ids = {
        participant.usuario_id
        for conversation in conversations
        for participant in conversation.participantes
        if participant.usuario_id != user.id
    }
    online_ids = {row[0] for row in db.query(models.ChatPresenciaPanel.usuario_id).filter(
        models.ChatPresenciaPanel.usuario_id.in_(other_ids or [-1]),
        models.ChatPresenciaPanel.last_seen_at >= utc_ahora() - PANEL_PRESENCE_TTL,
    ).distinct().all()}
    last_ids = (
        db.query(func.max(models.ChatMensaje.id))
        .filter(models.ChatMensaje.conversacion_id.in_(conversation_ids))
        .group_by(models.ChatMensaje.conversacion_id)
    )
    last_by_conversation = {
        message.conversacion_id: message
        for message in db.query(models.ChatMensaje)
        .options(selectinload(models.ChatMensaje.remitente))
        .filter(models.ChatMensaje.id.in_(last_ids))
        .all()
    }
    unread_by_conversation = {
        row.conversacion_id: (row.total, row.primero)
        for row in db.query(
            models.ChatMensaje.conversacion_id,
            func.count(models.ChatMensaje.id).label("total"),
            func.min(models.ChatMensaje.id).label("primero"),
        )
        .join(
            models.ChatParticipante,
            (models.ChatParticipante.conversacion_id == models.ChatMensaje.conversacion_id)
            & (models.ChatParticipante.usuario_id == user.id),
        )
        .filter(
            models.ChatMensaje.conversacion_id.in_(conversation_ids),
            models.ChatMensaje.remitente_id != user.id,
            models.ChatMensaje.id > models.ChatParticipante.ultimo_leido_mensaje_id,
        )
        .group_by(models.ChatMensaje.conversacion_id)
        .all()
    }
    return [
        _serialize_conversation(
            conversation, user, online_ids,
            last_by_conversation.get(conversation.id),
            unread_by_conversation.get(conversation.id, (0, None)),
        )
        for conversation in conversations
    ]


def _serialize_conversation(
    conversation: models.ChatConversacion,
    user: models.Usuario,
    online_user_ids: set[int],
    last: models.ChatMensaje | None,
    unread_info: tuple[int, int | None],
) -> dict:
    other = next((item.usuario for item in conversation.participantes if item.usuario_id != user.id and item.usuario), None)
    other_ids = {item.usuario_id for item in conversation.participantes if item.usuario_id != user.id}
    online_ids = other_ids & online_user_ids
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
    base = compact_portal_path(user, base)
    unread, first_unread_id = unread_info
    return {
        "id": conversation.id, "clave": conversation.clave, "route_key": route_key, "tipo": conversation.tipo,
        "titulo": title, "subtitulo": subtitle, "href": base, "no_leidos": unread,
        "primer_no_leido_id": first_unread_id,
        "proceso_id": conversation.proceso_id,
        "en_linea": bool(other and other.id in online_ids),
        "participantes_en_linea": len(online_ids),
        "updated_at": last.created_at if last else conversation.updated_at,
        "ultimo_mensaje": last.contenido if last else None,
        "ultimo_remitente": last.remitente.nombre_completo if last and last.remitente else None,
    }


def _message_reference_url(message: models.ChatMensaje, conversation: models.ChatConversacion, user: models.Usuario, db: Session) -> str | None:
    if conversation.proceso_id is None:
        return message.referencia_url
    if _role(user) == "CLIENTE":
        process_url = f"/gestion-procesos/cliente/procesos/{conversation.proceso_id}"
        if message.referencia_tipo == "DOCUMENTO":
            document = db.query(models.DocumentoProceso).filter_by(id=message.referencia_id, proceso_id=conversation.proceso_id).first()
            return f"/gestion-procesos/cliente/documentos#solicitud-{document.solicitud_id}" if document and document.solicitud_id else f"{process_url}#documentos"
        if message.referencia_tipo == "TAREA":
            return f"/gestion-procesos/cliente/tareas?tarea={message.referencia_id}#tarea-{message.referencia_id}"
        if message.referencia_tipo == "SUBTAREA":
            subtask = db.query(models.Subtarea).filter_by(id=message.referencia_id).first()
            task_id = subtask.tarea_id if subtask else message.referencia_id
            return f"/gestion-procesos/cliente/tareas?tarea={task_id}#tarea-{task_id}"
        if message.referencia_tipo == "EVENTO":
            return f"{process_url}#evento-{message.referencia_id}"
        if message.referencia_tipo == "RADICADO":
            return f"{process_url}#radicado-{message.referencia_id}"
        if message.referencia_tipo == "ACTUACION":
            actuation = db.query(models.Actuacion).filter_by(id=message.referencia_id).first()
            return f"{process_url}#radicado-{actuation.radicado_id}" if actuation else f"{process_url}#radicados"
    process_base = f"/gestion-procesos/abogado/procesos/{conversation.proceso_id}"
    if _role(user) == "ADMIN":
        if message.referencia_tipo == "DOCUMENTO":
            return f"/gestion-procesos/admin/documentos?proceso={conversation.proceso_id}#documento-{message.referencia_id}"
        if message.referencia_tipo in {"TAREA", "SUBTAREA"}:
            return f"/gestion-procesos/admin/tareas?tarea={message.referencia_id}"
        if message.referencia_tipo == "EVENTO":
            return f"/gestion-procesos/admin/agenda?evento={message.referencia_id}"
        if message.referencia_tipo in {"RADICADO", "ACTUACION"}:
            return f"/gestion-procesos/admin/radicados?proceso={conversation.proceso_id}"
        return f"/gestion-procesos/admin/procesos?proceso={conversation.proceso_id}"
    if message.referencia_tipo == "DOCUMENTO":
        return f"/gestion-procesos/abogado/documentos?proceso={conversation.proceso_id}#documento-{message.referencia_id}"
    if message.referencia_tipo == "TAREA":
        return f"{process_base}/tareas#tarea-{message.referencia_id}"
    if message.referencia_tipo == "SUBTAREA":
        subtask = db.query(models.Subtarea).filter_by(id=message.referencia_id).first()
        task_id = subtask.tarea_id if subtask else message.referencia_id
        return f"{process_base}/tareas#tarea-{task_id}"
    if message.referencia_tipo == "EVENTO":
        return f"{process_base}/agenda#evento-{message.referencia_id}"
    if message.referencia_tipo == "RADICADO":
        return f"{process_base}/radicados#radicado-{message.referencia_id}"
    if message.referencia_tipo == "ACTUACION":
        return f"{process_base}/radicados#actuacion-{message.referencia_id}"
    return message.referencia_url


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
            raise SinPermiso("Esta conversación es solo para el equipo jurídico.")
        if parts[1].lower() in {"admin", "administrador"}:
            peer = db.query(models.Usuario).filter(
                models.Usuario.rol == "ADMIN", models.Usuario.estado == models.EstadoUsuario.ACTIVO,
                models.Usuario.id != user.id,
            ).order_by(models.Usuario.id).first()
            if not peer:
                raise NoEncontrado("No hay un administrador disponible.")
        else:
            peer = _active_user(db, _path_id(parts[1]))
            if _role(peer) not in STAFF_ROLES or peer.id == user.id:
                raise DatosInvalidos("El destinatario no es un integrante del equipo.")
        a, b = sorted((user.id, peer.id))
        return _upsert_conversation(db, key=f"staff:{a}:{b}", kind="STAFF_DIRECT", actor=user, participants=[user, peer])

    if parts[0] == "process" and len(parts) == 3:
        if role == "ADMIN":
            raise SinPermiso("El chat del proceso está reservado a sus participantes.")
        process = _process(db, _path_id(parts[1]), user)
        if parts[2] == "collaborators":
            if role == "CLIENTE":
                raise SinPermiso("El chat de colaboradores es interno.")
            collaborators = [row.abogado for row in process.colaboradores if row.abogado and row.abogado.estado == models.EstadoUsuario.ACTIVO]
            participants = list({item.id: item for item in [process.abogado, *collaborators] if item}.values())
            if user not in participants:
                raise SinPermiso("Esta cuenta no participa en este proceso.")
            return _upsert_conversation(db, key=f"process:{process.id}:collaborators", kind="PROCESO_COLABORADORES", actor=user, participants=participants, process_id=process.id)
        target = _active_user(db, _path_id(parts[2]))
        if role == "CLIENTE":
            collaborator = db.query(models.ProcesoColaborador).filter_by(
                proceso_id=process.id, abogado_id=target.id, visible_cliente=True,
            ).first()
            if target.id != process.abogado_id and not collaborator:
                raise SinPermiso("El contacto no corresponde a este proceso.")
            client = user
            peer = target
        else:
            linked_client = db.query(models.ProcesoCliente).filter_by(proceso_id=process.id, cliente_id=target.id).first()
            if linked_client:
                collaborator = db.query(models.ProcesoColaborador).filter_by(
                    proceso_id=process.id, abogado_id=user.id, visible_cliente=True,
                ).first()
                if user.id != process.abogado_id and not collaborator:
                    raise SinPermiso("Solo el abogado responsable puede abrir el chat con el cliente.")
                client, peer = target, user
            elif target.id == process.abogado_id or db.query(models.ProcesoColaborador).filter_by(proceso_id=process.id, abogado_id=target.id).first():
                if target.id == user.id:
                    raise DatosInvalidos("Hace falta elegir a otro participante.")
                a, b = sorted((user.id, target.id))
                return _upsert_conversation(db, key=f"process:{process.id}:direct:{a}:{b}", kind="PROCESO_DIRECTO", actor=user, participants=[user, target], process_id=process.id)
            else:
                raise SinPermiso("El destinatario no pertenece a este proceso.")
        a, b = sorted((client.id, peer.id))
        return _upsert_conversation(db, key=f"process:{process.id}:direct:{a}:{b}", kind="PROCESO_DIRECTO", actor=user, participants=[client, peer], process_id=process.id, client_id=client.id)
    raise NoEncontrado("Ruta de chat no válida.")


def _accessible_process_ids(db: Session, user: models.Usuario, process_ids: set[int]) -> set[int]:
    """Equivalente en bloque a ``_process`` para un conjunto de procesos."""
    if not process_ids:
        return set()
    query = db.query(models.Proceso.id).filter(
        models.Proceso.id.in_(process_ids),
        models.Proceso.archivado_en.is_(None),
    )
    role = _role(user)
    if role == "CLIENTE":
        query = query.filter(models.Proceso.id.in_(
            db.query(models.ProcesoCliente.proceso_id).filter(models.ProcesoCliente.cliente_id == user.id)
        ))
    elif role != "ADMIN":
        query = query.filter(models.Proceso.id.in_(lawyer_process_ids(db, user)))
    return {row[0] for row in query.all()}


def _document_visible_to_user(db: Session, document: models.DocumentoProceso, process: models.Proceso, viewer: models.Usuario) -> bool:
    role = _role(viewer)
    if role == "ADMIN":
        return True
    if role == "CLIENTE":
        linked = db.query(models.ProcesoCliente.proceso_id).filter_by(proceso_id=process.id, cliente_id=viewer.id).first()
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
        raise SinPermiso("Solo el equipo puede adjuntar referencias.")
    client_id = conversation.cliente_id
    if client_id is None:
        client_id = next((
            participant.usuario_id for participant in conversation.participantes
            if participant.usuario and _role(participant.usuario) == "CLIENTE"
        ), None)
    if client_id is not None and not db.query(models.ProcesoCliente.proceso_id).filter_by(
        proceso_id=process.id, cliente_id=client_id,
    ).first():
        client_id = None

    result = []
    process_radications = db.query(models.Radicado).join(
        models.ProcesoRadicado, models.ProcesoRadicado.radicado_id == models.Radicado.id,
    ).filter(models.ProcesoRadicado.proceso_id == process.id).order_by(models.Radicado.numero.asc()).all()
    radication_ids = [item.id for item in process_radications]
    for item in process_radications:
        result.append({"tipo": "RADICADO", "id": item.id, "titulo": item.numero,
                       "href": f"/gestion-procesos/abogado/procesos/{process.id}/radicados#radicado-{item.id}"})
    actuation_query = db.query(models.Actuacion).filter(models.Actuacion.radicado_id.in_(radication_ids or [-1]))
    for item in actuation_query.order_by(models.Actuacion.fecha_actuacion.desc(), models.Actuacion.id.desc()).all():
        radication = next((row for row in process_radications if row.id == item.radicado_id), None)
        description = item.actuacion or item.anotacion or "Actuación judicial"
        result.append({"tipo": "ACTUACION", "id": item.id,
                       "titulo": description[:180], "grupo": str(item.radicado_id),
                       "radicado_numero": radication.numero if radication else "",
                       "href": f"/gestion-procesos/abogado/procesos/{process.id}/radicados#actuacion-{item.id}"})

    task_scope = [models.Tarea.proceso_id == process.id]
    if radication_ids:
        task_scope.append(models.Tarea.radicado_id.in_(radication_ids))
        process_actuation_ids = db.query(models.Actuacion.id).filter(models.Actuacion.radicado_id.in_(radication_ids))
        task_scope.append(models.Tarea.actuacion_id.in_(process_actuation_ids))
    if client_id is not None:
        task_scope.append(models.Tarea.id.in_(db.query(models.Subtarea.tarea_id).filter(
            models.Subtarea.proceso_id == process.id,
            models.Subtarea.asignada_cliente.is_(True),
            models.Subtarea.cliente_id == client_id,
        )))
    task_query = db.query(models.Tarea).filter(or_(*task_scope))
    if client_id is not None:
        assigned_parent_ids = db.query(models.Subtarea.tarea_id).filter(
            models.Subtarea.asignada_cliente.is_(True), models.Subtarea.cliente_id == client_id,
        ).distinct()
        task_query = task_query.filter(or_(
            models.Tarea.cliente_id == client_id,
            models.Tarea.id.in_(assigned_parent_ids),
        ))
    visible_tasks = task_query.order_by(models.Tarea.created_at.desc()).all()
    visible_task_ids = {item.id for item in visible_tasks}
    for item in visible_tasks:
        result.append({"tipo": "TAREA", "id": item.id, "titulo": f"Tarea - {item.titulo}", "href": f"/gestion-procesos/abogado/procesos/{process.id}/tareas#tarea-{item.id}"})
    subtask_query = db.query(models.Subtarea).join(
        models.Tarea, models.Tarea.id == models.Subtarea.tarea_id,
    ).filter(models.Tarea.id.in_(visible_task_ids or [-1]))
    if client_id is not None:
        subtask_query = subtask_query.filter(
            models.Subtarea.asignada_cliente.is_(True), models.Subtarea.cliente_id == client_id,
        )
    for item in subtask_query.order_by(models.Subtarea.orden.asc(), models.Subtarea.id.asc()).all():
        result.append({"tipo": "SUBTAREA", "id": item.id, "titulo": f"Subtarea - {item.titulo}",
                       "grupo": item.tarea.titulo if item.tarea else "Tarea",
                       "parent_id": item.tarea_id,
                       "href": f"/gestion-procesos/abogado/procesos/{process.id}/tareas#tarea-{item.tarea_id}"})

    event_query = db.query(models.EventoAgenda).filter_by(proceso_id=process.id)
    if client_id is not None:
        event_query = event_query.filter(or_(
            models.EventoAgenda.cliente_id == client_id,
            (models.EventoAgenda.proceso_id == process.id) & models.EventoAgenda.cliente_id.is_(None),
        ))
    for item in event_query.order_by(models.EventoAgenda.fecha_inicio.desc()).all():
        result.append({"tipo": "EVENTO", "id": item.id, "titulo": f"Evento - {item.titulo}", "href": f"/gestion-procesos/abogado/procesos/{process.id}/agenda#evento-{item.id}"})
    participants = [item.usuario for item in conversation.participantes if item.usuario]
    documents = db.query(models.DocumentoProceso).filter_by(proceso_id=process.id).order_by(
        models.DocumentoProceso.created_at.desc(), models.DocumentoProceso.id.desc(),
    ).all()
    for document in documents:
        if not participants or not all(_document_visible_to_user(db, document, process, participant) for participant in participants):
            continue
        request = document.solicitud
        requested_name = None
        if request:
            requested_items = request.documentos_requeridos or []
            requested_name = next((
                str(item.get("nombre")) for item in requested_items
                if str(item.get("id") or "legacy") == str(document.solicitud_item_id)
            ), None)
            if not requested_name and len(requested_items) == 1:
                requested_name = str(requested_items[0].get("nombre") or request.titulo)
            requested_name = requested_name or request.titulo
        if requested_name:
            title = requested_name
        elif document.contrato_id is not None:
            title = "Contrato firmado"
        else:
            title = "Documento del proceso"
        result.append({"tipo": "DOCUMENTO", "id": document.id,
                       "titulo": title,
                       "grupo": request.titulo if request else ("Contratos" if document.contrato_id is not None else "Otros documentos del proceso"),
                       "request_id": request.id if request else None,
                       "href": f"/gestion-procesos/abogado/documentos?proceso={process.id}#documento-{document.id}"})
    return result


def buscar_referencia(db: Session, conversation: models.ChatConversacion, user: models.Usuario, tipo: str, referencia_id: int | None) -> dict:
    """La referencia elegida, validada contra lo que el usuario puede adjuntar en esta conversación."""
    if _role(user) == "CLIENTE" or conversation.proceso_id is None:
        raise SinPermiso("En esta conversación no se pueden adjuntar referencias.")
    process = _process(db, conversation.proceso_id, user)
    options = _listar_referencias(process, conversation, db, user)
    reference = next((item for item in options if item["tipo"] == tipo and item["id"] == referencia_id), None)
    if not reference:
        raise NoEncontrado("La referencia no pertenece a este proceso.")
    return reference


def crear_mensaje(db: Session, conversation: models.ChatConversacion, user: models.Usuario, content: str, reference: dict | None) -> models.ChatMensaje:
    message = models.ChatMensaje(
        conversacion_id=conversation.id, remitente_id=user.id, contenido=content,
        referencia_tipo=reference["tipo"] if reference else None,
        referencia_id=reference["id"] if reference else None,
        referencia_titulo=reference["titulo"] if reference else None,
        referencia_url=reference["href"] if reference else None,
    )
    conversation.updated_at = utc_ahora()
    participant = next((item for item in conversation.participantes if item.usuario_id == user.id), None)
    if participant:
        participant.ultimo_leido_en = utc_ahora()
    db.add(message)
    db.flush()
    registrar_evento_auditoria(db, user, "chat.mensaje.enviar", "chat_conversacion", conversation.id)
    db.commit()
    db.refresh(message)
    return message


def avisar_mensaje(db: Session, conversation: models.ChatConversacion, message: models.ChatMensaje, user: models.Usuario) -> None:
    """Push a cada destinatario y, si no está en el panel, el aviso agrupado por correo o WhatsApp."""
    content = message.contenido
    process = conversation.proceso
    recipients = [item.usuario for item in conversation.participantes if item.usuario and item.usuario_id != user.id and item.usuario.estado == models.EstadoUsuario.ACTIVO]
    now = utc_ahora()
    db.query(models.ChatPresenciaPanel).filter(models.ChatPresenciaPanel.last_seen_at < now - PANEL_PRESENCE_TTL).delete(synchronize_session=False)
    for recipient in recipients:
        display = _display_conversation(db, conversation, recipient)
        link = user_portal_url(recipient, display["href"])
        process_name = process.nombre if process else "Conversacion del despacho"
        push_enabled = db.query(models.ChatPushSubscription.id).filter_by(usuario_id=recipient.id).first() is not None
        if not push_enabled:
            logger.info(
                "Push no enviada para el mensaje %s al usuario %s: no tiene suscripciones registradas.",
                message.id, recipient.id,
            )
        sender_type = "Cliente" if _role(user) == "CLIENTE" else "Abogado"
        push_delivered = _send_chat_push(
            db, recipient, user, link,
            title=f"Nuevo mensaje de tu {sender_type} - {user.nombre_completo}.",
            body=content,
            tag=f"chat-message-{message.id}",
            ack=_ack_entrega_push(recipient.id, message.id),
        ) if push_enabled else False
        if not (_supports_firm_panel_presence(user) and _supports_firm_panel_presence(recipient)):
            staff_sender = _role(user) != "CLIENTE"
            template = "COMUNICACION_ABOGADO_CLIENTE" if staff_sender else "COMUNICACION_CLIENTE_ABOGADO"
            whatsapp_enabled = "WHATSAPP" in canales_habilitados(recipient, "RESUMENES", db=db)
            if not push_delivered or whatsapp_enabled:
                emitir_notificacion_workflow(
                    db, recipient, "RESUMENES", f"CHAT:{message.id}:{recipient.id}",
                    f"Nuevo mensaje de {user.nombre_completo}", f"{user.nombre_completo}: {content}",
                    plantilla_clave=template,
                    variables={"nombre": recipient.nombre_completo, "actor": user.nombre_completo,
                               "proceso": process_name, "asunto": "Nuevo mensaje", "mensaje": content},
                    enlace_texto="Abrir conversacion", enlace_url=link,
                    excluir_canales=("EMAIL",) if push_delivered else (),
                )
            continue

        is_panel_active = db.query(models.ChatPresenciaPanel.id).filter(
            models.ChatPresenciaPanel.usuario_id == recipient.id,
            models.ChatPresenciaPanel.last_seen_at >= now - PANEL_PRESENCE_TTL,
        ).first() is not None
        # Push is sent for every message, whether the recipient is online or offline.
        # Presence only suppresses the grouped email/WhatsApp workflow notices.
        if is_panel_active:
            continue

        whatsapp_enabled = "WHATSAPP" in canales_habilitados(recipient, "RESUMENES", db=db)
        should_send_workflow = not push_delivered or whatsapp_enabled
        if not should_send_workflow:
            continue

        db.query(models.Usuario.id).filter_by(id=recipient.id).with_for_update().first()
        notice = db.query(models.ChatAvisoDestinatario).filter_by(
            remitente_id=user.id, destinatario_id=recipient.id,
        ).with_for_update().first()
        previous_notice_at = notice.ultima_notificacion_en if notice else None
        if previous_notice_at and now - previous_notice_at < CHAT_NOTIFICATION_COOLDOWN:
            db.rollback()
            continue

        template_exists = db.query(models.PlantillaMensaje.id).filter_by(clave="CHAT_MENSAJE", activo=True).first()
        if should_send_workflow and not template_exists:
            db.rollback()
            logger.warning("Falta configurar la plantilla CHAT_MENSAJE; se omite el aviso externo del chat.")
            continue

        if notice is None:
            notice = models.ChatAvisoDestinatario(remitente_id=user.id, destinatario_id=recipient.id, ultima_notificacion_en=now)
            db.add(notice)
        else:
            notice.ultima_notificacion_en = now
        db.commit()

        try:
            delivery_ids = emitir_notificacion_workflow(
                db, recipient, "RESUMENES", f"CHAT_AVISO:{user.id}:{recipient.id}:{int(now.timestamp())}",
                f"Nuevos mensajes de {user.nombre_completo}",
                f"{user.nombre_completo} te esta enviando mensajes.",
                plantilla_clave="CHAT_MENSAJE",
                variables={"nombre": recipient.nombre_completo, "actor": user.nombre_completo},
                enlace_texto="Abrir chat", enlace_url=link,
                excluir_canales=("EMAIL",) if push_delivered else (),
            ) if should_send_workflow else []
        except Exception:
            db.rollback()
            logger.exception("No se pudo preparar la notificacion agrupada del chat.")
            delivery_ids = []

        if not delivery_ids and not push_delivered:
            db.query(models.Usuario.id).filter_by(id=recipient.id).with_for_update().first()
            current_notice = db.query(models.ChatAvisoDestinatario).filter_by(
                remitente_id=user.id, destinatario_id=recipient.id,
            ).with_for_update().first()
            if current_notice:
                if previous_notice_at is None:
                    db.delete(current_notice)
                else:
                    current_notice.ultima_notificacion_en = previous_notice_at
                db.commit()


# ---- Lo que usa el servicio de mensajes ---------------------------------

def sincronizar(db: Session, usuario: models.Usuario) -> None:
    """Crea las conversaciones que le corresponden al usuario y aún no existen."""
    _create_available_conversations(db, usuario)
    db.commit()


def resolver(db: Session, clave: str, usuario: models.Usuario) -> models.ChatConversacion:
    conversacion = _resolve(db, clave, usuario)
    db.commit()
    return _conversation_for_actor(db, conversacion.id, usuario)


def conversacion(db: Session, conversacion_id: int, usuario: models.Usuario) -> models.ChatConversacion:
    return _conversation_for_actor(db, conversacion_id, usuario)


def procesos_accesibles(db: Session, usuario: models.Usuario, proceso_ids: set[int]) -> set[int]:
    return _accessible_process_ids(db, usuario, proceso_ids)


def referencias(db: Session, conversacion: models.ChatConversacion, usuario: models.Usuario) -> list[dict]:
    if conversacion.proceso_id is None:
        return []
    proceso = _process(db, conversacion.proceso_id, usuario)
    return _listar_referencias(proceso, conversacion, db, usuario)


def enlace_referencia(db: Session, mensaje: models.ChatMensaje, conversacion: models.ChatConversacion, usuario: models.Usuario) -> str | None:
    return _message_reference_url(mensaje, conversacion, usuario, db)


def enviar(db: Session, conversacion: models.ChatConversacion, usuario: models.Usuario, texto: str,
           referencia: tuple[str, int] | None) -> models.ChatMensaje:
    elegida = buscar_referencia(db, conversacion, usuario, *referencia) if referencia else None
    return crear_mensaje(db, conversacion, usuario, texto, elegida)


def avisar(db: Session, conversacion: models.ChatConversacion, mensaje: models.ChatMensaje, usuario: models.Usuario) -> None:
    avisar_mensaje(db, conversacion, mensaje, usuario)


def ttl_presencia():
    return PANEL_PRESENCE_TTL
