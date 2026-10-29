from datetime import datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.orm import Session

from app import models
from app.modulos.identidad.modelos import Usuario

MAX_INTENTOS = 3


class RepositorioOperacion:
    def __init__(self, db: Session):
        self._db = db

    # ---- Consultas judiciales -----------------------------------------------

    def configuracion_consultas(self, *, bloquear: bool = False) -> models.ConfiguracionConsultas:
        consulta = select(models.ConfiguracionConsultas).where(models.ConfiguracionConsultas.id == 1)
        if bloquear:
            consulta = consulta.with_for_update()
        configuracion = self._db.scalars(consulta).first()
        if configuracion is None:
            configuracion = models.ConfiguracionConsultas(id=1)
            self._db.add(configuracion)
            self._db.flush()
        return configuracion

    def consultas_con_error(self) -> list[tuple[models.ConsultaRadicado, str, int, str]]:
        """Radicados de procesos activos cuya consulta más reciente falló, con su proceso."""
        C, R, P, PR = models.ConsultaRadicado, models.Radicado, models.Proceso, models.ProcesoRadicado
        ultimas = select(func.max(C.id)).group_by(C.radicado_id)
        filas = self._db.execute(
            select(C, R.numero, P.id, P.nombre)
            .join(R, R.id == C.radicado_id)
            .join(PR, PR.radicado_id == R.id)
            .join(P, P.id == PR.proceso_id)
            .where(C.id.in_(ultimas), C.estado == "ERROR", P.archivado_en.is_(None))
            .order_by(C.id.desc(), P.id)
        ).all()
        vistos: set[int] = set()
        resultado = []
        for consulta, numero, proceso_id, proceso in filas:
            if consulta.id not in vistos:
                vistos.add(consulta.id)
                resultado.append((consulta, numero, proceso_id, proceso))
        return resultado

    def ejecuciones(self, *, despues: tuple[datetime, str] | None, limite: int) -> list[models.EjecucionBarrido]:
        E = models.EjecucionBarrido
        consulta = select(E)
        if despues:
            consulta = consulta.where(or_(E.inicio < despues[0], and_(E.inicio == despues[0], E.id < despues[1])))
        return list(self._db.scalars(consulta.order_by(E.inicio.desc(), E.id.desc()).limit(limite)))

    def contar_ejecuciones(self) -> int:
        return self._db.scalar(select(func.count()).select_from(models.EjecucionBarrido)) or 0

    def ejecucion(self, ejecucion_id: str) -> models.EjecucionBarrido | None:
        return self._db.get(models.EjecucionBarrido, ejecucion_id)

    def resultados(self, ejecucion_id: str) -> list[tuple[models.EjecucionRadicado, str]]:
        ER, R = models.EjecucionRadicado, models.Radicado
        return [
            (resultado, numero) for resultado, numero in self._db.execute(
                select(ER, R.numero).join(R, R.id == ER.radicado_id)
                .where(ER.ejecucion_id == ejecucion_id).order_by(ER.estado != "ERROR", ER.id).limit(500)
            ).all()
        ]

    def radicados(self, texto: str, limite: int) -> list[tuple[models.Radicado, str | None]]:
        R, P, PR = models.Radicado, models.Proceso, models.ProcesoRadicado
        proceso = (
            select(P.nombre).join(PR, PR.proceso_id == P.id)
            .where(PR.radicado_id == R.id).order_by(P.archivado_en.is_not(None), P.id).limit(1).scalar_subquery()
        )
        consulta = select(R, proceso)
        digitos = "".join(filter(str.isdigit, texto))
        if digitos:
            consulta = consulta.where(R.numero.like(f"%{digitos}%"))
        elif texto:
            consulta = consulta.where(func.lower(proceso).like(f"%{texto.lower()}%"))
        return [(r, nombre) for r, nombre in self._db.execute(consulta.order_by(R.created_at.desc(), R.id.desc()).limit(limite)).all()]

    # ---- Envíos -------------------------------------------------------------

    def envios(self, condicion: ColumnElement[bool], *, despues: tuple[datetime, int] | None, limite: int):
        E = models.EntregaNotificacion
        consulta = select(E, Usuario).join(Usuario, Usuario.id == E.usuario_id).where(condicion)
        if despues:
            consulta = consulta.where(or_(E.created_at < despues[0], and_(E.created_at == despues[0], E.id < despues[1])))
        return self._db.execute(consulta.order_by(E.created_at.desc(), E.id.desc()).limit(limite)).all()

    def contar_envios(self, condicion: ColumnElement[bool]) -> int:
        E = models.EntregaNotificacion
        return self._db.scalar(
            select(func.count()).select_from(E).join(Usuario, Usuario.id == E.usuario_id).where(condicion)
        ) or 0

    def envio(self, envio_id: int, *, bloquear: bool = False):
        E = models.EntregaNotificacion
        consulta = select(E, Usuario).join(Usuario, Usuario.id == E.usuario_id).where(E.id == envio_id)
        if bloquear:
            consulta = consulta.with_for_update(of=E)
        return self._db.execute(consulta).first()

    def envios_por_id(self, ids: list[int]) -> list[models.EntregaNotificacion]:
        E = models.EntregaNotificacion
        return list(self._db.scalars(select(E).where(E.id.in_(ids)).with_for_update()))

    # ---- Integraciones ------------------------------------------------------

    def configuracion_integraciones(self) -> models.ConfiguracionIntegraciones:
        configuracion = self._db.scalars(
            select(models.ConfiguracionIntegraciones).where(models.ConfiguracionIntegraciones.id == 1).with_for_update()
        ).first()
        if configuracion is None:
            configuracion = models.ConfiguracionIntegraciones(id=1)
            self._db.add(configuracion)
        return configuracion

    # ---- Plantillas ---------------------------------------------------------

    def plantillas(self) -> list[models.PlantillaMensaje]:
        P = models.PlantillaMensaje
        return list(self._db.scalars(select(P).where(P.activo.is_(True)).order_by(P.nombre)))

    def plantilla(self, clave: str) -> models.PlantillaMensaje | None:
        P = models.PlantillaMensaje
        return self._db.scalars(select(P).where(P.clave == clave, P.activo.is_(True))).first()
