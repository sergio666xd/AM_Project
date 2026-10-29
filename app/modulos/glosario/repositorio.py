from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session

from app import models
from app.modulos.glosario.modelos import Actuacion, NotificacionProceso, TerminoGlosario


class RepositorioGlosario:
    def __init__(self, db: Session):
        self._db = db

    def terminos(self, solo_activos: bool = False) -> list[TerminoGlosario]:
        consulta = select(TerminoGlosario).order_by(TerminoGlosario.patron)
        if solo_activos:
            consulta = consulta.where(TerminoGlosario.activo.is_(True))
        return list(self._db.scalars(consulta))

    def termino(self, termino_id: int) -> TerminoGlosario | None:
        return self._db.get(TerminoGlosario, termino_id)

    def nombres(self, ids: set[int | None]) -> dict[int, str]:
        ids = {i for i in ids if i}
        if not ids:
            return {}
        U = models.Usuario
        return dict(self._db.execute(select(U.id, U.nombre_completo).where(U.id.in_(ids))).all())

    def actuacion_visible(self, actuacion_id: int, visibles: ColumnElement[bool]) -> Actuacion | None:
        """La actuación, si pertenece a un radicado de algún proceso que el usuario puede ver."""
        P, R = models.Proceso, models.ProcesoRadicado
        procesos = select(R.radicado_id).join(P, P.id == R.proceso_id).where(visibles)
        return self._db.scalar(select(Actuacion).where(Actuacion.id == actuacion_id, Actuacion.radicado_id.in_(procesos)))

    def comentarios_de_avisos(self, actuacion_ids: list[int], cliente_id: int | None = None) -> dict[int, str]:
        """El último comentario que la firma envió con el aviso de cada actuación (a ese cliente, si se indica)."""
        if not actuacion_ids:
            return {}
        N = NotificacionProceso
        consulta = select(N.actuacion_id, N.comentarios).where(N.actuacion_id.in_(actuacion_ids), N.comentarios.isnot(None))
        if cliente_id is not None:
            consulta = consulta.where(N.cliente_id == cliente_id)
        salida: dict[int, str] = {}
        for actuacion_id, comentarios in self._db.execute(consulta.order_by(N.created_at, N.id)):
            if comentarios and comentarios.strip():
                salida[actuacion_id] = comentarios.strip()
        return salida
