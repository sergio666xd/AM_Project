from sqlalchemy import ColumnElement, false, func, or_, select, true
from sqlalchemy.orm import Session, selectinload

from app.models import NovedadRadicadoUsuario
from app.modulos.expedientes import politicas
from app.modulos.expedientes.modelos import Actuacion, Proceso, ProcesoRadicado, Radicado
from app.modulos.identidad.modelos import RolUsuario, Usuario

# De la más reciente a la más antigua: primero por fecha (texto ISO), luego por el orden de la Rama
# Judicial (1 es la más nueva).
RECIENTES = (Actuacion.fecha_actuacion.desc(), Actuacion.orden.asc(), Actuacion.id.desc())


def filtro_radicados_visibles(usuario: Usuario) -> ColumnElement[bool]:
    """Radicados de los procesos que el usuario ve, más los que tiene vinculados a su nombre."""
    rol = RolUsuario(getattr(usuario.rol, "value", usuario.rol))
    if rol == RolUsuario.ADMIN:
        return true()
    if rol not in politicas.ROLES_ABOGADO:
        return false()
    de_sus_procesos = (
        select(ProcesoRadicado.radicado_id)
        .join(Proceso, Proceso.id == ProcesoRadicado.proceso_id)
        .where(politicas.filtro_procesos_visibles(usuario))
    )
    return or_(Radicado.id.in_(de_sus_procesos), Radicado.usuarios_vinculados.any(Usuario.id == usuario.id))


class RepositorioRadicados:
    def __init__(self, db: Session):
        self._db = db

    def listar(self, visibles: ColumnElement[bool]) -> list[Radicado]:
        return list(self._db.scalars(
            select(Radicado).where(visibles)
            .options(selectinload(Radicado.procesos).selectinload(ProcesoRadicado.proceso))
            .order_by(Radicado.id.desc())
        ).all())

    def obtener(self, radicado_id: int, visibles: ColumnElement[bool]) -> Radicado | None:
        return self._db.scalar(
            select(Radicado).where(Radicado.id == radicado_id, visibles)
            .options(selectinload(Radicado.procesos).selectinload(ProcesoRadicado.proceso))
        )

    def ultimas_actuaciones(self, radicado_ids: list[int]) -> dict[int, Actuacion]:
        """La actuación más reciente de cada radicado."""
        if not radicado_ids:
            return {}
        puesto = func.row_number().over(partition_by=Actuacion.radicado_id, order_by=RECIENTES).label("puesto")
        ranking = select(Actuacion.id, puesto).where(Actuacion.radicado_id.in_(radicado_ids)).subquery()
        filas = self._db.scalars(select(Actuacion).join(ranking, ranking.c.id == Actuacion.id).where(ranking.c.puesto == 1)).all()
        return {a.radicado_id: a for a in filas}

    def totales(self, radicado_ids: list[int]) -> dict[int, int]:
        if not radicado_ids:
            return {}
        return dict(self._db.execute(
            select(Actuacion.radicado_id, func.count()).where(Actuacion.radicado_id.in_(radicado_ids))
            .group_by(Actuacion.radicado_id)
        ).all())

    def actuaciones(self, radicado_id: int) -> list[Actuacion]:
        return list(self._db.scalars(
            select(Actuacion).where(Actuacion.radicado_id == radicado_id).order_by(*RECIENTES)
        ).all())

    def novedades(self, usuario_id: int, radicado_ids: list[int] | None = None) -> dict[int, int]:
        consulta = select(NovedadRadicadoUsuario.radicado_id, NovedadRadicadoUsuario.actuaciones_nuevas).where(
            NovedadRadicadoUsuario.usuario_id == usuario_id
        )
        if radicado_ids is not None:
            consulta = consulta.where(NovedadRadicadoUsuario.radicado_id.in_(radicado_ids))
        return dict(self._db.execute(consulta).all())

    def marcar_revisado(self, usuario_id: int, radicado_id: int) -> None:
        novedad = self._db.scalar(select(NovedadRadicadoUsuario).where(
            NovedadRadicadoUsuario.usuario_id == usuario_id, NovedadRadicadoUsuario.radicado_id == radicado_id,
        ))
        if novedad is not None:
            self._db.delete(novedad)
            self._db.commit()
