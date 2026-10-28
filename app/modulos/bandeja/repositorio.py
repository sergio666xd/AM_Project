from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app import models

ACTIVAS = (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)
SIN_REVISAR = ("RECIBIDO", "EN_REVISION")


class RepositorioBandeja:
    def __init__(self, db: Session):
        self._db = db

    def procesos_activos(self, visibles: ColumnElement[bool]) -> dict[int, str]:
        P = models.Proceso
        return dict(self._db.execute(select(P.id, P.nombre).where(visibles, P.archivado_en.is_(None))).all())

    def tareas_hasta(self, proceso_ids: list[int], usuario_id: int, hasta: datetime) -> list[models.Tarea]:
        T = models.Tarea
        return list(self._db.scalars(
            select(T)
            .where(
                T.estado.in_(ACTIVAS),
                T.fecha_limite.is_not(None),
                T.fecha_limite <= hasta,
                or_(T.proceso_id.in_(proceso_ids), (T.proceso_id.is_(None)) & (T.usuario_id == usuario_id)),
            )
            .order_by(T.fecha_limite)
        ))

    def eventos_entre(self, proceso_ids: list[int], desde: datetime, hasta: datetime) -> list[models.EventoAgenda]:
        E = models.EventoAgenda
        return list(self._db.scalars(
            select(E)
            .where(E.estado == "PROGRAMADO", E.proceso_id.in_(proceso_ids), E.fecha_inicio >= desde, E.fecha_inicio <= hasta)
            .order_by(E.fecha_inicio)
        ))

    def documentos_sin_revisar(self, proceso_ids: list[int], limite: int) -> tuple[list[tuple[models.DocumentoProceso, str | None]], int]:
        D, U = models.DocumentoProceso, models.Usuario
        # Lo que responde a una solicitud lo entregó el cliente (como en los folios).
        condicion = (D.proceso_id.in_(proceso_ids), D.solicitud_id.is_not(None), D.estado_revision.in_(SIN_REVISAR))
        total = self._db.scalar(select(func.count()).select_from(D).where(*condicion)) or 0
        filas = self._db.execute(
            select(D, U.nombre_completo).outerjoin(U, U.id == D.cliente_id).where(*condicion).order_by(D.created_at.desc()).limit(limite)
        ).all()
        return [(documento, nombre) for documento, nombre in filas], total
