from datetime import datetime

from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.modulos.documentos.modelos import DocumentoProceso, SolicitudDocumento

LIMITE = 500


class RepositorioDocumentos:
    def __init__(self, db: Session):
        self._db = db

    def procesos_activos(self, visibles: ColumnElement[bool], proceso_id: int | None = None) -> dict[int, str]:
        P = models.Proceso
        consulta = select(P.id, P.nombre).where(visibles, P.archivado_en.is_(None))
        if proceso_id is not None:
            consulta = consulta.where(P.id == proceso_id)
        return dict(self._db.execute(consulta).all())

    def solicitudes(self, proceso_ids: list[int]) -> list[SolicitudDocumento]:
        S = SolicitudDocumento
        return list(self._db.scalars(
            select(S).where(S.proceso_id.in_(proceso_ids))
            .options(selectinload(S.cliente), selectinload(S.documentos))
            .order_by(S.created_at.desc(), S.id.desc())
        ).all())

    def documentos(self, proceso_ids: list[int]) -> list[DocumentoProceso]:
        """Documentos de los procesos, sin los de contratos (viven en Contratos)."""
        D = DocumentoProceso
        return list(self._db.scalars(
            select(D).where(D.proceso_id.in_(proceso_ids), D.contrato_id.is_(None))
            .options(selectinload(D.cliente), selectinload(D.solicitud))
            .order_by(D.created_at.desc(), D.id.desc())
        ).all())

    def documento(self, documento_id: int) -> DocumentoProceso | None:
        return self._db.get(DocumentoProceso, documento_id)

    def solicitud(self, solicitud_id: int) -> SolicitudDocumento | None:
        return self._db.scalar(
            select(SolicitudDocumento).where(SolicitudDocumento.id == solicitud_id)
            .options(selectinload(SolicitudDocumento.documentos), selectinload(SolicitudDocumento.cliente))
        )

    def nombres(self, ids: set[int]) -> dict[int, str]:
        ids.discard(None)  # type: ignore[arg-type]
        if not ids:
            return {}
        U = models.Usuario
        return dict(self._db.execute(select(U.id, U.nombre_completo).where(U.id.in_(ids))).all())

    def solicitudes_con_fecha_abiertas(self) -> list[SolicitudDocumento]:
        """Para el Cron de recordatorios: abiertas, con fecha y de procesos activos."""
        S, P = SolicitudDocumento, models.Proceso
        return list(self._db.scalars(
            select(S).join(P, P.id == S.proceso_id)
            .where(S.atendida_en.is_(None), S.fecha_limite.is_not(None), P.archivado_en.is_(None))
            .options(selectinload(S.cliente), selectinload(S.documentos), selectinload(S.proceso))
        ).all())

    def folio_de_documento(self, proceso_id: int, documento_id: int) -> models.FolioExpediente | None:
        F = models.FolioExpediente
        return self._db.scalar(select(F).where(F.proceso_id == proceso_id, F.tipo == "documento", F.origen_id == documento_id))

    def marcar_folio_revisado(self, proceso_id: int, documento_id: int, usuario_id: int, cuando: datetime) -> None:
        folio = self.folio_de_documento(proceso_id, documento_id)
        if folio is not None and folio.revisado_en is None:
            folio.revisado_en = cuando
            folio.revisado_por_id = usuario_id
