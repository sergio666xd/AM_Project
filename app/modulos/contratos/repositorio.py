from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import EntregaCorreoContrato, EventoAgenda
from app.modulos.contratos.modelos import ContratoServicio, PlantillaContrato
from app.modulos.documentos.modelos import DocumentoProceso
from app.modulos.expedientes.modelos import Proceso, ProcesoCliente
from app.modulos.identidad.modelos import RolUsuario, Usuario


class RepositorioContratos:
    def __init__(self, db: Session):
        self._db = db

    def plantillas(self) -> list[PlantillaContrato]:
        """Las plantillas vigentes, la más reciente primero."""
        P = PlantillaContrato
        return list(self._db.scalars(select(P).where(P.eliminada_en.is_(None)).order_by(P.updated_at.desc(), P.id.desc())).all())

    def usos_de_plantillas(self) -> dict[int, int]:
        C = ContratoServicio
        filas = self._db.execute(select(C.plantilla_id, func.count()).where(C.plantilla_id.is_not(None)).group_by(C.plantilla_id)).all()
        return {plantilla_id: total for plantilla_id, total in filas}

    def contratos(self, visibles: ColumnElement[bool]) -> list[ContratoServicio]:
        """Los contratos de los procesos que el usuario ve, también de los archivados."""
        C = ContratoServicio
        return list(self._db.scalars(
            select(C).join(Proceso, Proceso.id == C.proceso_id).where(visibles)
            .options(selectinload(C.proceso), selectinload(C.cliente))
            .order_by(C.updated_at.desc(), C.id.desc())
        ).all())

    def contrato(self, contrato_id: int, visibles: ColumnElement[bool]) -> ContratoServicio | None:
        C = ContratoServicio
        return self._db.scalar(select(C).join(Proceso, Proceso.id == C.proceso_id).where(C.id == contrato_id, visibles))

    def firmados(self, contrato_ids: list[int]) -> dict[int, DocumentoProceso]:
        """El último escaneado firmado de cada contrato."""
        if not contrato_ids:
            return {}
        D = DocumentoProceso
        documentos = self._db.scalars(
            select(D).where(D.contrato_id.in_(contrato_ids)).order_by(D.created_at, D.id)
        ).all()
        return {d.contrato_id: d for d in documentos}

    def procesos_activos_con_cliente(self, visibles: ColumnElement[bool]) -> list[Proceso]:
        con_cliente = select(ProcesoCliente.proceso_id)
        return list(self._db.scalars(
            select(Proceso).where(visibles, Proceso.archivado_en.is_(None), Proceso.id.in_(con_cliente))
            .options(selectinload(Proceso.abogado), selectinload(Proceso.clientes).selectinload(ProcesoCliente.cliente))
            .order_by(Proceso.created_at.desc(), Proceso.id.desc())
        ).all())

    def proceso(self, proceso_id: int, visibles: ColumnElement[bool]) -> Proceso | None:
        return self._db.scalar(
            select(Proceso).where(Proceso.id == proceso_id, visibles)
            .options(selectinload(Proceso.abogado), selectinload(Proceso.clientes).selectinload(ProcesoCliente.cliente))
        )

    def contratos_del_proceso(self, proceso_id: int) -> list[ContratoServicio]:
        C = ContratoServicio
        return list(self._db.scalars(
            select(C).where(C.proceso_id == proceso_id)
            .options(selectinload(C.proceso), selectinload(C.cliente), selectinload(C.versiones))
            .order_by(C.created_at.desc(), C.id.desc())
        ).all())

    def cliente_del_proceso(self, proceso_id: int, cliente_id: int) -> Usuario | None:
        return self._db.scalar(
            select(Usuario).join(ProcesoCliente, ProcesoCliente.cliente_id == Usuario.id)
            .where(ProcesoCliente.proceso_id == proceso_id, Usuario.id == cliente_id, Usuario.rol == RolUsuario.CLIENTE)
        )

    def firmas(self, contrato_ids: list[int], *, para_cambiar: bool = False) -> dict[int, list[EventoAgenda]]:
        """Las citas de firma no canceladas de cada contrato."""
        if not contrato_ids:
            return {}
        consulta = select(EventoAgenda).where(
            EventoAgenda.contrato_id.in_(contrato_ids), EventoAgenda.tipo == "FIRMA_CONTRATO", EventoAgenda.estado != "CANCELADO",
        ).order_by(EventoAgenda.fecha_inicio.desc(), EventoAgenda.id.desc())
        if para_cambiar:
            consulta = consulta.with_for_update()
        resultado: dict[int, list[EventoAgenda]] = {i: [] for i in contrato_ids}
        for evento in self._db.scalars(consulta).all():
            resultado[evento.contrato_id].append(evento)
        return resultado

    def ultimas_entregas(self, contrato_ids: list[int]) -> dict[int, EntregaCorreoContrato]:
        if not contrato_ids:
            return {}
        E = EntregaCorreoContrato
        entregas = self._db.scalars(select(E).where(E.contrato_id.in_(contrato_ids)).order_by(E.created_at, E.id)).all()
        return {e.contrato_id: e for e in entregas}
