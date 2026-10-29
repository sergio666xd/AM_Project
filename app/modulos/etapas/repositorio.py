from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import EtapaPlantilla, EtapaProceso, PlantillaEtapas, Proceso


class RepositorioEtapas:
    def __init__(self, db: Session):
        self._db = db

    def plantillas(self, solo_activas: bool = False) -> list[PlantillaEtapas]:
        consulta = select(PlantillaEtapas).options(selectinload(PlantillaEtapas.etapas))
        if solo_activas:
            consulta = consulta.where(PlantillaEtapas.activa.is_(True))
        return list(self._db.scalars(consulta.order_by(PlantillaEtapas.predeterminada.desc(), PlantillaEtapas.nombre)))

    def plantilla(self, plantilla_id: int) -> PlantillaEtapas | None:
        return self._db.scalar(
            select(PlantillaEtapas).where(PlantillaEtapas.id == plantilla_id).options(selectinload(PlantillaEtapas.etapas))
        )

    def etapa(self, etapa_id: int) -> EtapaPlantilla | None:
        return self._db.scalar(
            select(EtapaPlantilla).where(EtapaPlantilla.id == etapa_id).options(selectinload(EtapaPlantilla.plantilla))
        )

    def procesos_por_plantilla(self) -> dict[int | None, int]:
        """Procesos por plantilla elegida; la clave None son los que usan la predeterminada sin elegirla."""
        filas = self._db.execute(select(Proceso.plantilla_etapas_id, func.count()).group_by(Proceso.plantilla_etapas_id))
        return {plantilla_id: total for plantilla_id, total in filas}

    def procesos_por_etapa(self) -> dict[int, int]:
        filas = self._db.execute(
            select(Proceso.etapa_id, func.count()).where(Proceso.etapa_id.is_not(None)).group_by(Proceso.etapa_id)
        )
        return {etapa_id: total for etapa_id, total in filas}

    def etapas_usadas(self, ids: list[int]) -> set[int]:
        """De esas etapas, las que algún proceso tiene o tuvo."""
        if not ids:
            return set()
        actuales = self._db.scalars(select(Proceso.etapa_id).where(Proceso.etapa_id.in_(ids)))
        historial = self._db.scalars(select(EtapaProceso.etapa_id).where(EtapaProceso.etapa_id.in_(ids)))
        return set(actuales) | set(historial)

    def usa_plantilla(self, plantilla_id: int) -> bool:
        return bool(self._db.scalar(
            select(func.count()).select_from(Proceso).where(
                (Proceso.plantilla_etapas_id == plantilla_id)
                | Proceso.etapa_id.in_(select(EtapaPlantilla.id).where(EtapaPlantilla.plantilla_id == plantilla_id))
            )
        ))
