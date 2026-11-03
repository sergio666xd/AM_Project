from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import ColumnElement, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modulos.expedientes.modelos import (
    Actuacion,
    EtapaProceso,
    Proceso,
    ProcesoCliente,
    ProcesoColaborador,
    ProcesoRadicado,
    Radicado,
)
from app.modulos.documentos.modelos import DocumentoProceso, SolicitudDocumento
from app.modulos.etapas.linea import cargas_etapa
from app.modulos.identidad.modelos import EstadoUsuario, RolUsuario, Usuario
from app.modulos.tareas.modelos import EstadoTarea, Tarea
from app.timezone import COLOMBIA

ABIERTAS = (EstadoTarea.PENDIENTE, EstadoTarea.EN_CURSO)
SIN_REVISAR = ("RECIBIDO", "EN_REVISION")


@dataclass(frozen=True)
class FiltroProcesos:
    texto: str | None = None
    archivados: bool = False


def _cargas():
    return (
        selectinload(Proceso.abogado),
        selectinload(Proceso.clientes).selectinload(ProcesoCliente.cliente),
        selectinload(Proceso.radicados).selectinload(ProcesoRadicado.radicado),
        *cargas_etapa(),
    )


def _condicion_texto(texto: str) -> ColumnElement[bool]:
    """Busca en el nombre del proceso, los radicados (por dígitos) y los nombres de los clientes."""
    escapado = texto.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    patron = f"%{escapado}%"
    condiciones = [func.lower(Proceso.nombre).like(patron, escape="\\")]
    digitos = "".join(caracter for caracter in texto if caracter.isdigit())
    if len(digitos) >= 4:
        condiciones.append(
            exists().where(
                ProcesoRadicado.proceso_id == Proceso.id,
                ProcesoRadicado.radicado_id == Radicado.id,
                Radicado.numero_normalizado.like(f"%{digitos}%"),
            )
        )
    condiciones.append(
        exists().where(
            ProcesoCliente.proceso_id == Proceso.id,
            ProcesoCliente.cliente_id == Usuario.id,
            func.lower(Usuario.nombre_completo).like(patron, escape="\\"),
        )
    )
    return or_(*condiciones)


class RepositorioProcesos:
    def __init__(self, db: Session):
        self._db = db

    def listar(
        self,
        visibles: ColumnElement[bool],
        filtro: FiltroProcesos,
        *,
        limite: int,
        antes_de_id: int | None = None,
    ) -> tuple[list[Proceso], int]:
        """Procesos del más reciente al más antiguo, y el total con los filtros."""
        condiciones = [visibles]
        condiciones.append(Proceso.archivado_en.is_not(None) if filtro.archivados else Proceso.archivado_en.is_(None))
        if filtro.texto:
            condiciones.append(_condicion_texto(filtro.texto))

        total = self._db.scalar(select(func.count()).select_from(Proceso).where(*condiciones)) or 0
        consulta = select(Proceso).where(*condiciones)
        if antes_de_id is not None:
            consulta = consulta.where(Proceso.id < antes_de_id)
        procesos = self._db.scalars(
            consulta.options(*_cargas()).order_by(Proceso.id.desc()).limit(limite)
        ).all()
        return list(procesos), total

    def obtener(self, proceso_id: int, visibles: ColumnElement[bool]) -> Proceso | None:
        return self._db.scalar(
            select(Proceso)
            .where(Proceso.id == proceso_id, visibles)
            .options(
                *_cargas(),
                selectinload(Proceso.colaboradores).selectinload(ProcesoColaborador.abogado),
            )
        )

    def historial_etapas(self, proceso_id: int) -> list[tuple[EtapaProceso, str | None]]:
        return [(cambio, autor) for cambio, autor in self._db.execute(
            select(EtapaProceso, Usuario.nombre_completo)
            .outerjoin(Usuario, Usuario.id == EtapaProceso.usuario_id)
            .where(EtapaProceso.proceso_id == proceso_id)
            .options(selectinload(EtapaProceso.etapa))
            .order_by(EtapaProceso.fecha, EtapaProceso.id)
        )]

    def actuaciones_recientes(self, radicado_ids: list[int], por_radicado: int = 40) -> dict[int, list]:
        """Actuaciones de cada radicado, de la más reciente a la más antigua (por fecha y luego el orden del juzgado)."""
        filas = self._db.scalars(
            select(Actuacion).where(Actuacion.radicado_id.in_(radicado_ids))
            .order_by(Actuacion.radicado_id, Actuacion.fecha_actuacion.desc(), Actuacion.orden.asc(), Actuacion.id.desc())
        ).all()
        resultado: dict[int, list] = {i: [] for i in radicado_ids}
        for actuacion in filas:
            if len(resultado[actuacion.radicado_id]) < por_radicado:
                resultado[actuacion.radicado_id].append(actuacion)
        return resultado

    def total_actuaciones(self, radicado_ids: list[int]) -> dict[int, int]:
        if not radicado_ids:
            return {}
        return dict(self._db.execute(
            select(Actuacion.radicado_id, func.count()).where(Actuacion.radicado_id.in_(radicado_ids))
            .group_by(Actuacion.radicado_id)
        ).all())

    def actividad(self, proceso_ids: list[int], ahora: datetime) -> dict[int, dict]:
        """Tareas abiertas y vencidas, entregas sin revisar y solicitudes abiertas de cada proceso."""
        resultado = {i: {"tareas_abiertas": 0, "tareas_vencidas": 0, "por_revisar": 0, "pendiente_cliente": 0,
                         "proximo_vencimiento": None} for i in proceso_ids}
        if not proceso_ids:
            return resultado
        vencida = (Tarea.fecha_limite.is_not(None)) & (Tarea.fecha_limite < ahora)
        for proceso_id, abiertas, vencidas, proximo in self._db.execute(
            select(
                Tarea.proceso_id,
                func.count(),
                func.count().filter(vencida),
                func.min(Tarea.fecha_limite).filter(Tarea.fecha_limite >= ahora),
            ).where(Tarea.proceso_id.in_(proceso_ids), Tarea.estado.in_(ABIERTAS)).group_by(Tarea.proceso_id)
        ).all():
            dia = proximo.replace(tzinfo=timezone.utc).astimezone(COLOMBIA).date() if proximo else None
            resultado[proceso_id].update(tareas_abiertas=abiertas, tareas_vencidas=vencidas, proximo_vencimiento=dia)
        for proceso_id, total in self._db.execute(
            select(DocumentoProceso.proceso_id, func.count()).where(
                DocumentoProceso.proceso_id.in_(proceso_ids),
                DocumentoProceso.solicitud_id.is_not(None),
                DocumentoProceso.contrato_id.is_(None),
                DocumentoProceso.estado_revision.in_(SIN_REVISAR),
            ).group_by(DocumentoProceso.proceso_id)
        ).all():
            resultado[proceso_id]["por_revisar"] = total
        for proceso_id, total in self._db.execute(
            select(SolicitudDocumento.proceso_id, func.count()).where(
                SolicitudDocumento.proceso_id.in_(proceso_ids), SolicitudDocumento.atendida_en.is_(None),
            ).group_by(SolicitudDocumento.proceso_id)
        ).all():
            resultado[proceso_id]["pendiente_cliente"] = total
        return resultado

    def abogados_de_la_firma(self) -> list[Usuario]:
        return list(self._db.scalars(
            select(Usuario).where(Usuario.rol == RolUsuario.ABOGADO_ADMIN, Usuario.estado == EstadoUsuario.ACTIVO)
            .order_by(Usuario.nombre_completo, Usuario.id)
        ).all())

    def colaboracion(self, proceso_id: int, abogado_id: int) -> ProcesoColaborador | None:
        return self._db.scalar(select(ProcesoColaborador).where(
            ProcesoColaborador.proceso_id == proceso_id, ProcesoColaborador.abogado_id == abogado_id,
        ))
