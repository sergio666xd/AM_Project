from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.modulos.documentos.modelos import SolicitudDocumento
from app.modulos.expedientes.modelos import Proceso, ProcesoCliente, ProcesoRadicado
from app.modulos.identidad.modelos import RolUsuario, Usuario


class RepositorioClientes:
    def __init__(self, db: Session):
        self._db = db

    def clientes(self, visibles: ColumnElement[bool]) -> list[Usuario]:
        return list(self._db.scalars(
            select(Usuario).where(Usuario.rol == RolUsuario.CLIENTE, visibles).order_by(Usuario.nombre_completo, Usuario.id)
        ).all())

    def cliente(self, cliente_id: int, visibles: ColumnElement[bool]) -> Usuario | None:
        return self._db.scalar(select(Usuario).where(Usuario.id == cliente_id, Usuario.rol == RolUsuario.CLIENTE, visibles))

    def vinculos(self, cliente_ids: list[int], procesos_visibles: ColumnElement[bool]) -> list[tuple[int, Proceso]]:
        """(cliente_id, proceso) de los procesos activos que el usuario ve, del más reciente al más antiguo."""
        if not cliente_ids:
            return []
        return [tuple(fila) for fila in self._db.execute(
            select(ProcesoCliente.cliente_id, Proceso)
            .join(Proceso, Proceso.id == ProcesoCliente.proceso_id)
            .where(ProcesoCliente.cliente_id.in_(cliente_ids), Proceso.archivado_en.is_(None), procesos_visibles)
            .options(selectinload(Proceso.abogado), selectinload(Proceso.radicados).selectinload(ProcesoRadicado.radicado))
            .order_by(Proceso.id.desc())
        ).all()]

    def solicitudes_abiertas(self, cliente_ids: list[int], proceso_ids: list[int]) -> list[SolicitudDocumento]:
        if not cliente_ids or not proceso_ids:
            return []
        S = SolicitudDocumento
        return list(self._db.scalars(
            select(S).where(S.cliente_id.in_(cliente_ids), S.proceso_id.in_(proceso_ids), S.atendida_en.is_(None))
            .options(selectinload(S.documentos))
            .order_by(S.fecha_limite.is_(None), S.fecha_limite, S.created_at)
        ).all())

    def contratos(self, cliente_id: int, procesos_visibles: ColumnElement[bool]) -> list[models.ContratoServicio]:
        C = models.ContratoServicio
        return list(self._db.scalars(
            select(C).join(Proceso, Proceso.id == C.proceso_id)
            .where(C.cliente_id == cliente_id, procesos_visibles)
            .options(selectinload(C.proceso))
            .order_by(C.created_at.desc(), C.id.desc())
        ).all())

    def avisos(self, cliente_id: int, proceso_ids: list[int], limite: int = 8) -> list[models.NotificacionProceso]:
        if not proceso_ids:
            return []
        N = models.NotificacionProceso
        return list(self._db.scalars(
            select(N).where(N.cliente_id == cliente_id, N.proceso_id.in_(proceso_ids))
            .order_by(N.created_at.desc(), N.id.desc()).limit(limite)
        ).all())

    def correo_en_uso(self, email: str) -> bool:
        return self._db.scalar(select(func.count()).select_from(Usuario).where(func.lower(Usuario.email) == email.lower())) > 0

    def procesos_con_chat(self, usuario_id: int, proceso_ids: list[int]) -> set[int]:
        """Procesos en los que el usuario puede hablar con el cliente: los suyos y en los que colabora a la vista del cliente."""
        if not proceso_ids:
            return set()
        C = models.ProcesoColaborador
        propios = select(Proceso.id).where(Proceso.id.in_(proceso_ids), Proceso.abogado_id == usuario_id)
        colaborando = select(C.proceso_id).where(C.proceso_id.in_(proceso_ids), C.abogado_id == usuario_id, C.visible_cliente.is_(True))
        return set(self._db.scalars(propios.union(colaborando)).all())
