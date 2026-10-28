from datetime import datetime

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.modulos.agenda.modelos import EventoAgenda, SuscripcionCalendario
from app.modulos.tareas.modelos import EstadoTarea, Tarea


class RepositorioAgenda:
    def __init__(self, db: Session):
        self._db = db

    def procesos_activos(self, visibles: ColumnElement[bool]) -> dict[int, str]:
        P = models.Proceso
        return dict(self._db.execute(select(P.id, P.nombre).where(visibles, P.archivado_en.is_(None))).all())

    def eventos(self, proceso_ids: list[int], desde: datetime, hasta: datetime) -> list[EventoAgenda]:
        E = EventoAgenda
        return list(self._db.scalars(
            select(E).where(E.proceso_id.in_(proceso_ids), E.fecha_inicio >= desde, E.fecha_inicio < hasta)
            .options(selectinload(E.responsable)).order_by(E.fecha_inicio)
        ).all())

    def tareas(self, proceso_ids: list[int], usuario_id: int, desde: datetime, hasta: datetime) -> list[Tarea]:
        T = Tarea
        return list(self._db.scalars(
            select(T).where(
                T.estado.in_((EstadoTarea.PENDIENTE, EstadoTarea.EN_CURSO)),
                T.fecha_limite >= desde, T.fecha_limite < hasta,
                or_(T.proceso_id.in_(proceso_ids), T.proceso_id.is_(None) & (T.usuario_id == usuario_id)),
            ).options(selectinload(T.usuario)).order_by(T.fecha_limite)
        ).all())

    def suscripcion(self, usuario_id: int) -> SuscripcionCalendario | None:
        return self._db.scalar(select(SuscripcionCalendario).where(SuscripcionCalendario.usuario_id == usuario_id))

    def suscripcion_por_hash(self, token_hash: str) -> SuscripcionCalendario | None:
        return self._db.scalar(select(SuscripcionCalendario).where(SuscripcionCalendario.token_hash == token_hash))
