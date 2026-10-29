from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app import models
from app.modulos.identidad.modelos import Usuario

S = models.SolicitudContacto


class RepositorioSitio:
    def __init__(self, db: Session):
        self._db = db

    def configuracion_firma(self) -> models.ConfiguracionFirma | None:
        return self._db.get(models.ConfiguracionFirma, 1)

    def pagina(self, slug: str) -> models.ContenidoPagina | None:
        return self._db.get(models.ContenidoPagina, slug)

    def paginas_editadas(self) -> dict[str, tuple[models.ContenidoPagina, str | None]]:
        P = models.ContenidoPagina
        filas = self._db.execute(select(P, Usuario.nombre_completo).outerjoin(Usuario, Usuario.id == P.actualizado_por_id)).all()
        return {pagina.slug: (pagina, nombre) for pagina, nombre in filas}

    # ---- Mensajes del formulario -------------------------------------------------

    def solicitudes(self, estado: str | None, *, despues: tuple[datetime, int] | None, limite: int):
        consulta = select(S, Usuario.nombre_completo).outerjoin(Usuario, Usuario.id == S.atendida_por_id)
        if estado:
            consulta = consulta.where(S.estado == estado)
        if despues:
            consulta = consulta.where(or_(S.created_at < despues[0], and_(S.created_at == despues[0], S.id < despues[1])))
        return self._db.execute(consulta.order_by(S.created_at.desc(), S.id.desc()).limit(limite)).all()

    def conteo(self) -> dict[str, int]:
        return {estado: cantidad for estado, cantidad in self._db.execute(select(S.estado, func.count()).group_by(S.estado))}

    def solicitud(self, solicitud_id: int):
        return self._db.execute(
            select(S, Usuario.nombre_completo).outerjoin(Usuario, Usuario.id == S.atendida_por_id).where(S.id == solicitud_id)
        ).first()

    def sin_atender(self) -> tuple[int, datetime | None, int | None]:
        """Cuántos mensajes siguen nuevos, cuándo llegó el último y su id."""
        total, ultima = self._db.execute(select(func.count(), func.max(S.created_at)).where(S.estado == "NUEVA")).one()
        ultimo_id = self._db.scalar(select(func.max(S.id)).where(S.estado == "NUEVA"))
        return total or 0, ultima, ultimo_id
