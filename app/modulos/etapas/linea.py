"""La línea de etapas de un proceso, según su plantilla.

Lo usan el expediente, el portal del cliente y los folios. Un proceso sin
plantilla toma la predeterminada; si no existe ninguna plantilla (una base
nueva), se crea «General» con las cinco etapas de siempre.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import EtapaPlantilla, PlantillaEtapas, Proceso

# La misma plantilla que siembra la migración 0015.
GENERAL = "General"
ETAPAS_GENERALES: tuple[tuple[str, str], ...] = (
    ("Demanda", "Se prepara y se presenta la demanda o la solicitud ante el juzgado."),
    ("Admisión", "El juzgado revisa la demanda y decide si la acepta; después se le avisa a la otra parte."),
    ("Pruebas", "Cada parte presenta sus pruebas, como documentos, testigos o peritajes, para demostrar lo que dice."),
    ("Audiencia", "El juez reúne a las partes para escucharlas, revisar las pruebas y, si se puede, buscar un acuerdo."),
    ("Sentencia", "El juez decide el caso. Si una parte no está de acuerdo, puede apelar en un plazo corto."),
)


def plantilla_predeterminada(db: Session) -> PlantillaEtapas:
    plantilla = db.scalar(
        select(PlantillaEtapas)
        .where(PlantillaEtapas.predeterminada.is_(True))
        .options(selectinload(PlantillaEtapas.etapas))
        .order_by(PlantillaEtapas.id)
        .limit(1)
    )
    if plantilla is not None:
        return plantilla
    plantilla = db.scalar(select(PlantillaEtapas).order_by(PlantillaEtapas.id).limit(1))
    if plantilla is None:
        plantilla = PlantillaEtapas(
            nombre=GENERAL, descripcion="Las cinco etapas de un proceso judicial.", activa=True,
            etapas=[EtapaPlantilla(nombre=n, explicacion=e, orden=i) for i, (n, e) in enumerate(ETAPAS_GENERALES)],
        )
        db.add(plantilla)
    plantilla.predeterminada = True
    db.flush()
    return plantilla


def plantilla_de(proceso: Proceso, predeterminada: PlantillaEtapas) -> PlantillaEtapas:
    if proceso.plantilla_etapas is not None:
        return proceso.plantilla_etapas
    if proceso.etapa is not None:
        return proceso.etapa.plantilla
    return predeterminada


def linea(plantilla: PlantillaEtapas, actual: EtapaPlantilla | None) -> list[EtapaPlantilla]:
    """Las etapas activas en orden; la actual entra aunque ya esté desactivada."""
    etapas = [e for e in plantilla.etapas if e.activa or (actual is not None and e.id == actual.id)]
    return sorted(etapas, key=lambda e: (e.orden, e.id))


def cargas_etapa(entidad=Proceso):
    """Opciones de carga para mostrar la etapa de muchos procesos sin una consulta por proceso."""
    return (
        selectinload(entidad.plantilla_etapas).selectinload(PlantillaEtapas.etapas),
        selectinload(entidad.etapa).selectinload(EtapaPlantilla.plantilla).selectinload(PlantillaEtapas.etapas),
    )
