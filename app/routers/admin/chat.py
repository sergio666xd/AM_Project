"""Limpieza de conversaciones del chat."""

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get("/chat/limpieza")
def listar_conversaciones_para_limpieza_admin(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    """List conversation metadata only; message bodies and references are never selected."""
    message_stats = db.query(
        models.ChatMensaje.conversacion_id.label("conversacion_id"),
        func.count(models.ChatMensaje.id).label("cantidad_mensajes"),
        func.max(models.ChatMensaje.created_at).label("ultimo_mensaje_en"),
    ).group_by(models.ChatMensaje.conversacion_id).subquery()
    total = db.query(func.count(models.ChatConversacion.id)).scalar() or 0
    rows = (
        db.query(
            models.ChatConversacion,
            func.coalesce(message_stats.c.cantidad_mensajes, 0),
            message_stats.c.ultimo_mensaje_en,
        )
        .outerjoin(message_stats, message_stats.c.conversacion_id == models.ChatConversacion.id)
        .order_by(message_stats.c.ultimo_mensaje_en.desc().nullslast(), models.ChatConversacion.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    conversation_ids = [row[0].id for row in rows]
    participant_names: dict[int, list[str]] = {}
    if conversation_ids:
        participants = (
            db.query(models.ChatParticipante.conversacion_id, models.Usuario.nombre_completo)
            .join(models.Usuario, models.Usuario.id == models.ChatParticipante.usuario_id)
            .filter(models.ChatParticipante.conversacion_id.in_(conversation_ids))
            .order_by(models.Usuario.nombre_completo)
            .all()
        )
        for conversation_id, participant_name in participants:
            participant_names.setdefault(conversation_id, []).append(participant_name)

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "conversaciones": [{
            "id": conversation.id,
            "tipo": conversation.tipo,
            "proceso": conversation.proceso.nombre if conversation.proceso else None,
            "cliente": conversation.cliente.nombre_completo if conversation.cliente else None,
            "participantes": participant_names.get(conversation.id, []),
            "cantidad_mensajes": int(message_count),
            "ultimo_mensaje_en": last_message_at,
        } for conversation, message_count, last_message_at in rows],
    }


@router.post("/chat/limpieza/{conversation_id}")
def limpiar_conversacion_admin(
    conversation_id: int,
    datos: dict = Body(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if datos.get("confirmacion") != "LIMPIAR CONVERSACION":
        raise HTTPException(status_code=400, detail="Escribe LIMPIAR CONVERSACION para confirmar.")
    conversation = db.query(models.ChatConversacion).filter_by(id=conversation_id).first()
    if conversation is None:
        raise HTTPException(status_code=404, detail="La conversación ya no existe.")

    deleted = db.query(models.ChatMensaje).filter_by(conversacion_id=conversation_id).delete(synchronize_session=False)
    for participant in db.query(models.ChatParticipante).filter_by(conversacion_id=conversation_id).all():
        participant.ultimo_leido_en = None
        participant.ultimo_entregado_mensaje_id = 0
        participant.ultimo_leido_mensaje_id = 0
    registrar_evento_auditoria(
        db,
        admin,
        "admin.chat.limpiar_conversacion",
        "chat_conversacion",
        conversation_id,
        {"mensajes_eliminados": deleted},
    )
    db.commit()
    return {"conversacion_id": conversation_id, "mensajes_eliminados": deleted}
