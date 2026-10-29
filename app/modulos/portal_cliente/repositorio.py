"""Consultas del portal del cliente.

Todo se filtra por el cliente que consulta: sus procesos activos y, dentro de
cada expediente, solo los folios que le corresponden. Las actuaciones y los
cambios de etapa son de todos los clientes del proceso; documentos,
solicitudes y tareas, solo de aquel a quien van dirigidos.
"""

from datetime import datetime

from sqlalchemy import ColumnElement, and_, false, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import models

F = models.FolioExpediente
TIPOS_VISIBLES = ("actuacion", "etapa", "documento", "solicitud", "evento", "tarea")
ESTADOS_TAREA_ABIERTA = (models.EstadoTarea.PENDIENTE, models.EstadoTarea.EN_CURSO)


def _firmados():
    """Del contrato, el cliente solo ve la copia firmada; los borradores son de la firma."""
    C = models.ContratoServicio
    return select(C.id).where(C.estado.in_(("FIRMADO", "TERMINADO")))


class RepositorioPortal:
    def __init__(self, db: Session):
        self._db = db

    # ---- Procesos -------------------------------------------------------

    def procesos(self, cliente_id: int, proceso_id: int | None = None) -> list[models.Proceso]:
        """Procesos activos a los que el cliente está vinculado, del más reciente al más antiguo."""
        P, V = models.Proceso, models.ProcesoCliente
        consulta = (
            select(P)
            .where(P.id.in_(select(V.proceso_id).where(V.cliente_id == cliente_id)), P.archivado_en.is_(None))
            .options(
                selectinload(P.abogado),
                selectinload(P.colaboradores).selectinload(models.ProcesoColaborador.abogado),
                selectinload(P.radicados).selectinload(models.ProcesoRadicado.radicado),
            )
            .order_by(P.created_at.desc(), P.id.desc())
        )
        if proceso_id is not None:
            consulta = consulta.where(P.id == proceso_id)
        return list(self._db.scalars(consulta))

    def historial_etapas(self, proceso_ids: list[int]) -> dict[int, list[models.EtapaProceso]]:
        salida: dict[int, list[models.EtapaProceso]] = {pid: [] for pid in proceso_ids}
        if proceso_ids:
            E = models.EtapaProceso
            for cambio in self._db.scalars(select(E).where(E.proceso_id.in_(proceso_ids)).order_by(E.fecha, E.id)):
                salida[cambio.proceso_id].append(cambio)
        return salida

    def proximas_fechas(self, proceso_ids: list[int], cliente_id: int, desde: datetime) -> dict[int, models.EventoAgenda]:
        """El próximo evento programado de cada proceso que el cliente puede ver."""
        if not proceso_ids:
            return {}
        E = models.EventoAgenda
        salida: dict[int, models.EventoAgenda] = {}
        for evento in self._db.scalars(
            select(E).where(
                E.proceso_id.in_(proceso_ids), E.estado == "PROGRAMADO", E.fecha_inicio >= desde,
                or_(E.cliente_id == cliente_id, E.cliente_id.is_(None)),
            ).order_by(E.fecha_inicio, E.id)
        ):
            salida.setdefault(evento.proceso_id, evento)
        return salida

    # ---- Folios visibles ------------------------------------------------

    def condicion_visible(self, cliente_id: int, *, sin_lo_propio: bool = False) -> ColumnElement[bool]:
        """Folios que el cliente ve. `sin_lo_propio` deja fuera lo que él mismo subió."""
        D, S, E, T = models.DocumentoProceso, models.SolicitudDocumento, models.EventoAgenda, models.Tarea
        documentos = select(D.id).where(D.cliente_id == cliente_id, or_(D.contrato_id.is_(None), D.contrato_id.in_(_firmados())))
        if sin_lo_propio:
            documentos = documentos.where(D.solicitud_id.is_(None))
        return or_(
            F.tipo.in_(("actuacion", "etapa")),
            and_(F.tipo == "documento", F.origen_id.in_(documentos)),
            and_(F.tipo == "solicitud", F.origen_id.in_(select(S.id).where(S.cliente_id == cliente_id))),
            and_(F.tipo == "evento", F.origen_id.in_(
                select(E.id).where(or_(E.cliente_id == cliente_id, E.cliente_id.is_(None)), E.estado != "CANCELADO")
            )),
            and_(F.tipo == "tarea", F.origen_id.in_(select(T.id).where(T.cliente_id == cliente_id))),
        )

    def folios(self, proceso_id: int, cliente_id: int, *, antes: tuple[datetime, int] | None,
               limite: int) -> list[models.FolioExpediente]:
        """Del más reciente al más antiguo por fecha; `antes` es la (fecha, número) del último ya mostrado."""
        consulta = select(F).where(F.proceso_id == proceso_id, self.condicion_visible(cliente_id))
        if antes is not None:
            fecha, numero = antes
            consulta = consulta.where(or_(F.fecha < fecha, and_(F.fecha == fecha, F.numero < numero)))
        return list(self._db.scalars(consulta.order_by(F.fecha.desc(), F.numero.desc()).limit(limite)))

    def recientes(self, proceso_ids: list[int], cliente_id: int, limite: int) -> list[models.FolioExpediente]:
        if not proceso_ids:
            return []
        return list(self._db.scalars(
            select(F).where(F.proceso_id.in_(proceso_ids), self.condicion_visible(cliente_id))
            .order_by(F.fecha.desc(), F.numero.desc()).limit(limite)
        ))

    def ultimos(self, proceso_ids: list[int], cliente_id: int) -> dict[int, models.FolioExpediente]:
        """El folio visible más reciente (por fecha) de cada proceso."""
        if not proceso_ids:
            return {}
        orden = func.row_number().over(partition_by=F.proceso_id, order_by=(F.fecha.desc(), F.numero.desc()))
        candidatos = (
            select(F.id, orden.label("puesto"))
            .where(F.proceso_id.in_(proceso_ids), self.condicion_visible(cliente_id))
            .subquery()
        )
        filas = self._db.scalars(select(F).join(candidatos, F.id == candidatos.c.id).where(candidatos.c.puesto == 1))
        return {folio.proceso_id: folio for folio in filas}

    def contar(self, proceso_id: int, cliente_id: int) -> int:
        return self._db.scalar(
            select(func.count()).select_from(F).where(F.proceso_id == proceso_id, self.condicion_visible(cliente_id))
        ) or 0

    def condicion_nuevo(self, vistas: dict[int, int], proceso_ids: list[int], desde: datetime) -> ColumnElement[bool]:
        """Posterior al último folio que el cliente vio; si nunca abrió el proceso, lo de los últimos días."""
        partes = [
            and_(F.proceso_id == pid, F.numero > vistas[pid]) if pid in vistas else and_(F.proceso_id == pid, F.fecha >= desde)
            for pid in proceso_ids
        ]
        return or_(*partes) if partes else false()

    def contar_nuevos(self, proceso_ids: list[int], cliente_id: int, vistas: dict[int, int], desde: datetime) -> dict[int, int]:
        if not proceso_ids:
            return {}
        filas = self._db.execute(
            select(F.proceso_id, func.count())
            .where(
                F.proceso_id.in_(proceso_ids),
                self.condicion_visible(cliente_id, sin_lo_propio=True),
                self.condicion_nuevo(vistas, proceso_ids, desde),
            )
            .group_by(F.proceso_id)
        )
        return dict(filas.all())

    def numeros_nuevos(self, folios: list[models.FolioExpediente], cliente_id: int, vistas: dict[int, int],
                       desde: datetime) -> set[tuple[int, int]]:
        if not folios:
            return set()
        proceso_ids = sorted({f.proceso_id for f in folios})
        filas = self._db.execute(
            select(F.proceso_id, F.numero).where(
                F.id.in_([f.id for f in folios]),
                self.condicion_visible(cliente_id, sin_lo_propio=True),
                self.condicion_nuevo(vistas, proceso_ids, desde),
            )
        )
        return {(pid, numero) for pid, numero in filas}

    def ultimo_folio(self, proceso_id: int) -> int:
        return self._db.scalar(select(func.max(F.numero)).where(F.proceso_id == proceso_id)) or 0

    # ---- Lo que el cliente ya vio ---------------------------------------

    def vistas(self, cliente_id: int, proceso_ids: list[int]) -> dict[int, int]:
        if not proceso_ids:
            return {}
        V = models.VistaProcesoCliente
        return dict(self._db.execute(
            select(V.proceso_id, V.ultimo_folio).where(V.usuario_id == cliente_id, V.proceso_id.in_(proceso_ids))
        ).all())

    def vista(self, cliente_id: int, proceso_id: int) -> models.VistaProcesoCliente | None:
        V = models.VistaProcesoCliente
        return self._db.scalar(select(V).where(V.usuario_id == cliente_id, V.proceso_id == proceso_id))

    def agregar(self, registro) -> None:
        self._db.add(registro)

    # ---- Origen de cada folio -------------------------------------------

    def por_id(self, modelo, ids: list[int]) -> dict[int, object]:
        if not ids:
            return {}
        return {fila.id: fila for fila in self._db.scalars(select(modelo).where(modelo.id.in_(ids)))}

    # ---- Pendientes y documentos ----------------------------------------

    def solicitudes(self, cliente_id: int, proceso_ids: list[int]) -> list[models.SolicitudDocumento]:
        if not proceso_ids:
            return []
        S = models.SolicitudDocumento
        return list(self._db.scalars(
            select(S).where(S.cliente_id == cliente_id, S.proceso_id.in_(proceso_ids))
            .options(selectinload(S.documentos)).order_by(S.created_at, S.id)
        ))

    def tareas(self, cliente_id: int, proceso_ids: list[int]) -> list[models.Tarea]:
        if not proceso_ids:
            return []
        T = models.Tarea
        return list(self._db.scalars(
            select(T).where(T.cliente_id == cliente_id, T.proceso_id.in_(proceso_ids), T.estado.in_(ESTADOS_TAREA_ABIERTA))
            .order_by(T.fecha_limite, T.id)
        ))

    def subtareas(self, cliente_id: int, proceso_ids: list[int]) -> list[tuple[models.Subtarea, models.Tarea]]:
        if not proceso_ids:
            return []
        T, U = models.Tarea, models.Subtarea
        return list(self._db.execute(
            select(U, T).join(T, T.id == U.tarea_id).where(
                U.asignada_cliente.is_(True), U.cliente_id == cliente_id, U.completada.is_(False),
                T.proceso_id.in_(proceso_ids), T.estado.in_(ESTADOS_TAREA_ABIERTA),
            ).order_by(T.fecha_limite, U.orden, U.id)
        ).all())

    def tareas_hechas(self, cliente_id: int, proceso_ids: list[int], desde: datetime) -> list[models.Tarea]:
        if not proceso_ids:
            return []
        T = models.Tarea
        return list(self._db.scalars(
            select(T).where(T.cliente_id == cliente_id, T.proceso_id.in_(proceso_ids),
                            T.estado == models.EstadoTarea.COMPLETADA, T.completada_en >= desde)
        ))

    def subtareas_hechas(self, cliente_id: int, proceso_ids: list[int], desde: datetime) -> list[tuple[models.Subtarea, models.Tarea]]:
        if not proceso_ids:
            return []
        T, U = models.Tarea, models.Subtarea
        return list(self._db.execute(
            select(U, T).join(T, T.id == U.tarea_id).where(
                U.asignada_cliente.is_(True), U.cliente_id == cliente_id, U.completada.is_(True),
                U.completada_en >= desde, T.proceso_id.in_(proceso_ids),
            )
        ).all())

    def solicitud(self, cliente_id: int, solicitud_id: int, proceso_ids: list[int]) -> models.SolicitudDocumento | None:
        S = models.SolicitudDocumento
        return self._db.scalar(select(S).where(S.id == solicitud_id, S.cliente_id == cliente_id, S.proceso_id.in_(proceso_ids or [0])))

    def tarea(self, cliente_id: int, tarea_id: int, proceso_ids: list[int]) -> models.Tarea | None:
        T = models.Tarea
        return self._db.scalar(select(T).where(T.id == tarea_id, T.cliente_id == cliente_id, T.proceso_id.in_(proceso_ids or [0])))

    def subtarea(self, cliente_id: int, subtarea_id: int, proceso_ids: list[int]) -> tuple[models.Subtarea, models.Tarea] | None:
        T, U = models.Tarea, models.Subtarea
        fila = self._db.execute(
            select(U, T).join(T, T.id == U.tarea_id).where(
                U.id == subtarea_id, U.asignada_cliente.is_(True), U.cliente_id == cliente_id,
                T.proceso_id.in_(proceso_ids or [0]),
            )
        ).first()
        return (fila[0], fila[1]) if fila else None

    def documentos(self, cliente_id: int, proceso_id: int) -> list[models.DocumentoProceso]:
        D = models.DocumentoProceso
        return list(self._db.scalars(
            select(D).where(
                D.proceso_id == proceso_id, D.cliente_id == cliente_id,
                or_(D.contrato_id.is_(None), D.contrato_id.in_(_firmados())),
            ).order_by(D.created_at.desc(), D.id.desc())
        ))
