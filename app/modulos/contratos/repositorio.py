from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session, selectinload

from app.modulos.contratos.modelos import ContratoServicio
from app.modulos.documentos.modelos import DocumentoProceso
from app.modulos.expedientes.modelos import Proceso, ProcesoCliente


class RepositorioContratos:
    def __init__(self, db: Session):
        self._db = db

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
