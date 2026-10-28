from datetime import datetime

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.modulos.tareas.modelos import EstadoTarea, PlantillaTarea, Tarea

ABIERTAS = (EstadoTarea.PENDIENTE, EstadoTarea.EN_CURSO)
LIMITE = 500


class RepositorioTareas:
    def __init__(self, db: Session):
        self._db = db

    def procesos_activos(self, visibles: ColumnElement[bool]) -> dict[int, str]:
        P = models.Proceso
        return dict(self._db.execute(select(P.id, P.nombre).where(visibles, P.archivado_en.is_(None))).all())

    @staticmethod
    def condicion_visibles(proceso_ids: list[int], usuario_id: int, toda_la_firma: bool) -> ColumnElement[bool]:
        """Tareas de procesos activos que el usuario ve, más sus tareas generales (sin proceso)."""
        T = Tarea
        if toda_la_firma:
            return or_(T.proceso_id.is_(None), T.proceso_id.in_(proceso_ids))
        return or_(T.proceso_id.in_(proceso_ids), T.proceso_id.is_(None) & (T.usuario_id == usuario_id))

    def _consulta(self, visibles: ColumnElement[bool], *filtros: ColumnElement[bool]) -> Select:
        return select(Tarea).where(visibles, *filtros)

    def listar(self, visibles: ColumnElement[bool], filtros: list[ColumnElement[bool]]) -> tuple[list[Tarea], int]:
        consulta = self._consulta(visibles, *filtros)
        total = self._db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
        tareas = self._db.scalars(
            consulta.options(
                selectinload(Tarea.usuario), selectinload(Tarea.cliente_asignado),
                selectinload(Tarea.radicado), selectinload(Tarea.subtareas),
            )
            .order_by(Tarea.fecha_limite.asc().nullslast(), Tarea.created_at.desc())
            .limit(LIMITE)
        ).all()
        return list(tareas), total

    def contar(self, visibles: ColumnElement[bool], *filtros: ColumnElement[bool]) -> int:
        return self._db.scalar(select(func.count()).select_from(Tarea).where(visibles, *filtros)) or 0

    def por_ids(self, visibles: ColumnElement[bool], ids: list[int]) -> list[Tarea]:
        return list(self._db.scalars(
            select(Tarea).where(visibles, Tarea.id.in_(ids)).options(selectinload(Tarea.recordatorios))
        ).all())

    def plantillas(self) -> list[PlantillaTarea]:
        return list(self._db.scalars(select(PlantillaTarea).order_by(PlantillaTarea.nombre)).all())

    def plantilla(self, plantilla_id: int) -> PlantillaTarea | None:
        return self._db.get(PlantillaTarea, plantilla_id)

    @staticmethod
    def abiertas() -> ColumnElement[bool]:
        return Tarea.estado.in_(ABIERTAS)

    @staticmethod
    def vencidas(ahora: datetime) -> list[ColumnElement[bool]]:
        return [Tarea.estado.in_(ABIERTAS), Tarea.fecha_limite.is_not(None), Tarea.fecha_limite < ahora]
