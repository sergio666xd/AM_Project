"""Notificaciones del navegador (Web Push) y presencia del panel.

Las suscripciones y la presencia viven en las tablas del chat. El envío de
cada notificación y la firma de su confirmación están en
`app.modulos.mensajes.reglas`, junto con el resto de los avisos de mensajes.
"""

import logging
import os
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.modulos.identidad.modelos import EstadoUsuario, Usuario
from app.modulos.push.esquemas import (
    ConfirmacionEntrega,
    BajaSuscripcion,
    ClavePublica,
    Diagnostico,
    Dispositivo,
    Dispositivos,
    EstadoPresencia,
    NuevaSuscripcion,
    Presencia,
)
from app.nucleo.errores import Conflicto, ErrorDominio, NoEncontrado, SinPermiso
from app.timezone import utc_ahora

logger = logging.getLogger(__name__)
DURACION_PRESENCIA = timedelta(seconds=90)
ROLES_CON_PRESENCIA = {"CLIENTE", "ABOGADO_ADMIN", "ADMIN"}


class PushNoConfigurado(ErrorDominio):
    estado = 503
    codigo = "push_no_configurado"


def _claves() -> tuple[str, str]:
    return os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY", "").strip(), os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").strip()


def configurado() -> bool:
    publica, privada = _claves()
    return bool(publica and privada)


def nombre_de_dispositivo(agente: str | None) -> str:
    """«iPhone · Safari», a partir del user-agent."""
    if not agente:
        return "Dispositivo sin nombre"
    ua = agente.lower()
    sistema = "Dispositivo"
    if "iphone" in ua:
        sistema = "iPhone"
    elif "ipad" in ua:
        sistema = "iPad"
    elif "android" in ua:
        sistema = "Android"
    elif "macintosh" in ua or "mac os" in ua:
        sistema = "Mac"
    elif "windows" in ua:
        sistema = "Windows"
    elif "linux" in ua:
        sistema = "Linux"
    navegador = ""
    if "edg/" in ua or "edga/" in ua or "edgios/" in ua:
        navegador = "Edge"
    elif "samsungbrowser" in ua:
        navegador = "Samsung Internet"
    elif "firefox/" in ua or "fxios/" in ua:
        navegador = "Firefox"
    elif "chrome/" in ua or "crios/" in ua:
        navegador = "Chrome"
    elif "safari/" in ua:
        navegador = "Safari"
    return f"{sistema} · {navegador}" if navegador else sistema


def _rol(usuario: Usuario) -> str:
    return getattr(usuario.rol, "value", usuario.rol)


class ServicioPush:
    def __init__(self, db: Session):
        self._db = db

    def clave_publica(self) -> ClavePublica:
        publica, _ = _claves()
        if not publica:
            raise PushNoConfigurado("Las notificaciones del navegador aún no están configuradas.")
        return ClavePublica(clave=publica)

    def suscribir(self, usuario: Usuario, datos: NuevaSuscripcion) -> Dispositivo:
        if usuario.estado != EstadoUsuario.ACTIVO:
            raise SinPermiso("La cuenta no está activa.")
        if not configurado():
            raise PushNoConfigurado("Las notificaciones del navegador aún no están configuradas.")
        S = models.ChatPushSubscription
        suscripcion = self._db.scalar(select(S).where(S.endpoint == datos.endpoint).with_for_update())
        if suscripcion is None:
            suscripcion = S(endpoint=datos.endpoint)
            self._db.add(suscripcion)
        suscripcion.usuario_id = usuario.id
        suscripcion.p256dh = datos.keys["p256dh"]
        suscripcion.auth = datos.keys["auth"]
        suscripcion.user_agent = datos.user_agent
        suscripcion.device_label = datos.nombre
        suscripcion.updated_at = utc_ahora()
        self._db.commit()
        return self._dispositivo(suscripcion)

    def dar_de_baja(self, usuario: Usuario, datos: BajaSuscripcion) -> None:
        S = models.ChatPushSubscription
        self._db.execute(delete(S).where(S.usuario_id == usuario.id, S.endpoint == datos.endpoint))
        self._db.commit()

    def dispositivos(self, usuario: Usuario) -> Dispositivos:
        S = models.ChatPushSubscription
        filas = self._db.scalars(select(S).where(S.usuario_id == usuario.id).order_by(S.updated_at.desc(), S.id.desc())).all()
        return Dispositivos(items=[self._dispositivo(s) for s in filas], configurado=configurado())

    def quitar_dispositivo(self, usuario: Usuario, dispositivo_id: int) -> None:
        S = models.ChatPushSubscription
        borradas = self._db.execute(delete(S).where(S.id == dispositivo_id, S.usuario_id == usuario.id)).rowcount
        if not borradas:
            raise NoEncontrado("No encontramos ese dispositivo.")
        self._db.commit()

    def probar(self, usuario: Usuario) -> None:
        """Envía una notificación de prueba a los dispositivos del usuario."""
        from app.modulos.mensajes.reglas import _chat_area, _send_chat_push
        from app.workflow_service import user_portal_url

        if usuario.estado != EstadoUsuario.ACTIVO:
            raise SinPermiso("La cuenta no está activa.")
        if not configurado():
            raise PushNoConfigurado("Las notificaciones del navegador aún no están configuradas.")
        S = models.ChatPushSubscription
        if self._db.scalar(select(S.id).where(S.usuario_id == usuario.id).limit(1)) is None:
            raise Conflicto("Este navegador no tiene las notificaciones activadas.", codigo="sin_suscripcion")
        entregada = _send_chat_push(
            self._db, usuario, usuario, user_portal_url(usuario, f"/gestion-procesos/{_chat_area(usuario)}/chat"),
            title="Prueba de notificaciones", body="Las notificaciones de este dispositivo funcionan.", tag=f"chat-test-{usuario.id}",
        )
        if not entregada:
            raise ErrorDominio("El servicio de notificaciones rechazó el envío. Desactívelas y vuelva a activarlas en este dispositivo.",
                               codigo="push_rechazado")
        self._db.commit()

    def diagnostico(self, usuario: Usuario, datos: Diagnostico) -> None:
        logger.warning("No se pudo configurar Push para el usuario %s: etapa=%s error=%s mensaje=%s",
                       usuario.id, datos.etapa, datos.nombre_error, datos.mensaje_error)

    def confirmar_entrega(self, datos: ConfirmacionEntrega) -> None:
        """Marca el mensaje como entregado en ese dispositivo.

        No lleva sesión: la firma emitida con el push autoriza solo ese mensaje para ese usuario.
        """
        from app.modulos.mensajes.reglas import firma_valida

        if not firma_valida(datos.usuario_id, datos.mensaje_id, datos.firma):
            raise SinPermiso("La confirmación de entrega no es válida.")
        mensaje = self._db.get(models.ChatMensaje, datos.mensaje_id)
        if mensaje is None:
            return
        P = models.ChatParticipante
        participante = self._db.scalar(select(P).where(P.conversacion_id == mensaje.conversacion_id, P.usuario_id == datos.usuario_id))
        if participante and participante.ultimo_entregado_mensaje_id < mensaje.id:
            participante.ultimo_entregado_mensaje_id = mensaje.id
            self._db.commit()

    # ---- Presencia del panel ------------------------------------------------

    def marcar_presencia(self, usuario: Usuario, datos: Presencia) -> EstadoPresencia:
        """Mientras el panel está abierto no se envían avisos por correo de los mensajes nuevos."""
        if _rol(usuario) not in ROLES_CON_PRESENCIA:
            return EstadoPresencia(activo=False)
        P = models.ChatPresenciaPanel
        ahora = utc_ahora()
        self._db.execute(delete(P).where(P.last_seen_at < ahora - DURACION_PRESENCIA))
        presencia = self._db.scalar(select(P).where(P.usuario_id == usuario.id, P.session_id == datos.sesion).with_for_update())
        if presencia is None:
            self._db.add(P(usuario_id=usuario.id, session_id=datos.sesion, last_seen_at=ahora))
        else:
            presencia.last_seen_at = ahora
        try:
            self._db.commit()
        except IntegrityError:
            # Otra pestaña del mismo panel creó la fila a la vez: basta con actualizarla.
            self._db.rollback()
            self._db.query(P).filter_by(usuario_id=usuario.id, session_id=datos.sesion).update({"last_seen_at": ahora})
            self._db.commit()
        return EstadoPresencia(activo=True, expira_en_segundos=int(DURACION_PRESENCIA.total_seconds()))

    def cerrar_presencia(self, usuario: Usuario, datos: Presencia) -> None:
        P = models.ChatPresenciaPanel
        self._db.execute(delete(P).where(P.usuario_id == usuario.id, P.session_id == datos.sesion))
        self._db.commit()

    @staticmethod
    def _dispositivo(s: models.ChatPushSubscription) -> Dispositivo:
        return Dispositivo(
            id=s.id, nombre=(s.device_label or "").strip() or nombre_de_dispositivo(s.user_agent),
            activado_en=s.created_at, actualizado_en=s.updated_at,
        )
