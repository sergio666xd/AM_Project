from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import models

C, P, M = models.ChatConversacion, models.ChatParticipante, models.ChatMensaje


class RepositorioMensajes:
    def __init__(self, db: Session):
        self._db = db

    def conversaciones_de(self, usuario_id: int) -> list[models.ChatConversacion]:
        mias = select(P.conversacion_id).where(P.usuario_id == usuario_id)
        return list(self._db.scalars(
            select(C).where(C.id.in_(mias))
            .options(selectinload(C.participantes).selectinload(P.usuario), selectinload(C.proceso))
        ))

    def ultimos(self, conversacion_ids: list[int]) -> dict[int, models.ChatMensaje]:
        if not conversacion_ids:
            return {}
        ultimos = select(func.max(M.id)).where(M.conversacion_id.in_(conversacion_ids)).group_by(M.conversacion_id)
        return {
            m.conversacion_id: m
            for m in self._db.scalars(select(M).where(M.id.in_(ultimos)).options(selectinload(M.remitente)))
        }

    def sin_leer(self, conversacion_ids: list[int], usuario_id: int) -> dict[int, tuple[int, int]]:
        """Por conversación: cuántos mensajes de otros no ha leído el usuario y el id del primero."""
        if not conversacion_ids:
            return {}
        filas = self._db.execute(
            select(M.conversacion_id, func.count(M.id), func.min(M.id))
            .join(P, (P.conversacion_id == M.conversacion_id) & (P.usuario_id == usuario_id))
            .where(M.conversacion_id.in_(conversacion_ids), M.remitente_id != usuario_id,
                   M.id > P.ultimo_leido_mensaje_id)
            .group_by(M.conversacion_id)
        )
        return {conversacion_id: (total, primero) for conversacion_id, total, primero in filas}

    def en_linea(self, usuario_ids: set[int], desde: datetime) -> set[int]:
        if not usuario_ids:
            return set()
        Z = models.ChatPresenciaPanel
        return set(self._db.scalars(
            select(Z.usuario_id).where(Z.usuario_id.in_(usuario_ids), Z.last_seen_at >= desde).distinct()
        ))

    def mensajes(self, conversacion_id: int, *, despues_de: int, antes_de: int, limite: int) -> tuple[list[models.ChatMensaje], bool]:
        consulta = select(M).where(M.conversacion_id == conversacion_id).options(selectinload(M.remitente))
        if despues_de:
            filas = list(self._db.scalars(consulta.where(M.id > despues_de).order_by(M.id).limit(500)))
            return filas, False
        if antes_de:
            consulta = consulta.where(M.id < antes_de)
        pagina = list(self._db.scalars(consulta.order_by(M.id.desc()).limit(limite + 1)))
        return list(reversed(pagina[:limite])), len(pagina) > limite

    def propios_recientes(self, conversacion_id: int, usuario_id: int, limite: int = 200) -> list[models.ChatMensaje]:
        return list(self._db.scalars(
            select(M).where(M.conversacion_id == conversacion_id, M.remitente_id == usuario_id)
            .order_by(M.id.desc()).limit(limite)
        ))

    def mensaje(self, conversacion_id: int, mensaje_id: int) -> models.ChatMensaje | None:
        return self._db.scalar(select(M).where(M.id == mensaje_id, M.conversacion_id == conversacion_id))

    def folios(self, proceso_id: int, mensaje_ids: list[int]) -> dict[int, int]:
        if not mensaje_ids:
            return {}
        F = models.FolioExpediente
        return dict(self._db.execute(
            select(F.origen_id, F.numero)
            .where(F.proceso_id == proceso_id, F.tipo == "mensaje", F.origen_id.in_(mensaje_ids))
        ).all())
