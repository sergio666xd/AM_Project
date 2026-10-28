"""Adaptador sobre el chat de la API v1.

Quién participa en cada conversación, qué referencias puede adjuntar cada uno
y cómo se avisa de un mensaje (push, correo o WhatsApp) siguen viviendo en
`app.routers.chat`, que también usan el chat del cliente y el botón flotante.
Aquí se llaman esas reglas y sus errores HTTP se traducen a errores de dominio.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.nucleo.errores import DatosInvalidos, ErrorDominio, NoEncontrado, SinPermiso


@contextmanager
def _errores_de_dominio() -> Iterator[None]:
    try:
        yield
    except HTTPException as error:
        mensaje = str(error.detail)
        if error.status_code == 403:
            raise SinPermiso(mensaje) from error
        if error.status_code == 404:
            raise NoEncontrado(mensaje) from error
        if error.status_code == 400:
            raise DatosInvalidos(mensaje) from error
        raise ErrorDominio(mensaje) from error


def _chat():
    from app.routers import chat

    return chat


def sincronizar(db: Session, usuario: models.Usuario) -> None:
    """Crea las conversaciones que le corresponden al usuario y aún no existen."""
    with _errores_de_dominio():
        _chat()._create_available_conversations(db, usuario)
        db.commit()


def resolver(db: Session, clave: str, usuario: models.Usuario) -> models.ChatConversacion:
    with _errores_de_dominio():
        chat = _chat()
        conversacion = chat._resolve(db, clave, usuario)
        db.commit()
        return chat._conversation_for_actor(db, conversacion.id, usuario)


def conversacion(db: Session, conversacion_id: int, usuario: models.Usuario) -> models.ChatConversacion:
    with _errores_de_dominio():
        return _chat()._conversation_for_actor(db, conversacion_id, usuario)


def procesos_accesibles(db: Session, usuario: models.Usuario, proceso_ids: set[int]) -> set[int]:
    return _chat()._accessible_process_ids(db, usuario, proceso_ids)


def referencias(db: Session, conversacion: models.ChatConversacion, usuario: models.Usuario) -> list[dict]:
    with _errores_de_dominio():
        chat = _chat()
        if conversacion.proceso_id is None:
            return []
        proceso = chat._process(db, conversacion.proceso_id, usuario)
        return chat._listar_referencias(proceso, conversacion, db, usuario)


def enlace_referencia(db: Session, mensaje: models.ChatMensaje, conversacion: models.ChatConversacion, usuario: models.Usuario) -> str | None:
    return _chat()._message_reference_url(mensaje, conversacion, usuario, db)


def enviar(db: Session, conversacion: models.ChatConversacion, usuario: models.Usuario, texto: str,
           referencia: tuple[str, int] | None) -> models.ChatMensaje:
    with _errores_de_dominio():
        chat = _chat()
        elegida = chat.buscar_referencia(db, conversacion, usuario, *referencia) if referencia else None
        return chat.crear_mensaje(db, conversacion, usuario, texto, elegida)


def avisar(db: Session, conversacion: models.ChatConversacion, mensaje: models.ChatMensaje, usuario: models.Usuario) -> None:
    _chat().avisar_mensaje(db, conversacion, mensaje, usuario)


def ttl_presencia():
    return _chat().PANEL_PRESENCE_TTL
