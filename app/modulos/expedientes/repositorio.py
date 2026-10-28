from dataclasses import dataclass

from sqlalchemy import ColumnElement, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modulos.expedientes.modelos import (
    EtapaProceso,
    Proceso,
    ProcesoCliente,
    ProcesoColaborador,
    ProcesoRadicado,
    Radicado,
)
from app.modulos.identidad.modelos import Usuario


@dataclass(frozen=True)
class FiltroProcesos:
    texto: str | None = None
    archivados: bool = False


def _cargas():
    return (
        selectinload(Proceso.abogado),
        selectinload(Proceso.clientes).selectinload(ProcesoCliente.cliente),
        selectinload(Proceso.radicados).selectinload(ProcesoRadicado.radicado),
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
            .order_by(EtapaProceso.fecha, EtapaProceso.id)
        )]
