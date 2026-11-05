"""La línea de etapas de un proceso, según su plantilla.

Lo usan el expediente, el portal del cliente y los folios. Un proceso sin
plantilla toma la predeterminada; si no existe ninguna plantilla (una base
nueva), se crea «General» con las cinco etapas de siempre.

Cuando el abogado ajusta las etapas de un proceso, el proceso pasa a tener su
línea propia: una copia de la plantilla con `proceso_id`, que ya no cambia
cuando cambia la plantilla.
"""

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.models import EtapaPlantilla, EtapaProceso, PlantillaEtapas, Proceso

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
        .where(PlantillaEtapas.predeterminada.is_(True), PlantillaEtapas.proceso_id.is_(None))
        .options(selectinload(PlantillaEtapas.etapas))
        .order_by(PlantillaEtapas.id)
        .limit(1)
    )
    if plantilla is not None:
        return plantilla
    plantilla = db.scalar(
        select(PlantillaEtapas).where(PlantillaEtapas.proceso_id.is_(None)).order_by(PlantillaEtapas.id).limit(1)
    )
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


def es_propia(plantilla: PlantillaEtapas, proceso: Proceso) -> bool:
    return plantilla.proceso_id is not None and plantilla.proceso_id == proceso.id


def linea_propia(db: Session, proceso: Proceso) -> tuple[PlantillaEtapas, dict[int, int]]:
    """La línea propia del proceso; si aún no la tiene, la copia de la plantilla que sigue.

    Devuelve también qué etapa de la plantilla pasó a ser cuál de la copia, para
    traducir los ids que el expediente mostró antes de la copia.
    """
    base = plantilla_de(proceso, plantilla_predeterminada(db))
    if es_propia(base, proceso):
        return base, {}
    propia = db.scalar(select(PlantillaEtapas).where(PlantillaEtapas.proceso_id == proceso.id))
    if propia is None:
        propia = PlantillaEtapas(proceso_id=proceso.id, nombre=base.nombre, descripcion=base.descripcion, activa=True)
        db.add(propia)
        db.flush()
    return propia, cargar_plantilla(db, proceso, propia, base)


def cargar_plantilla(db: Session, proceso: Proceso, propia: PlantillaEtapas, base: PlantillaEtapas) -> dict[int, int]:
    """Reemplaza la línea propia del proceso por una copia de `base`.

    Las etapas que el proceso ya usó quedan desactivadas para que el historial se
    siga leyendo; las demás se borran. El proceso y su historial pasan a apuntar a
    las copias de las etapas de `base` que tenían.
    """
    usadas = _usadas_por(db, proceso, [e.id for e in propia.etapas])
    for etapa in list(propia.etapas):
        if etapa.id in usadas:
            etapa.activa = False
        else:
            propia.etapas.remove(etapa)
    db.flush()
    copias = {}
    for i, etapa in enumerate(linea(base, proceso.etapa if proceso.etapa in base.etapas else None)):
        copia = EtapaPlantilla(nombre=etapa.nombre, explicacion=etapa.explicacion, activa=etapa.activa, orden=i)
        propia.etapas.append(copia)
        copias[etapa.id] = copia
    # Las desactivadas que conservan el historial van al final de la línea.
    for i, etapa in enumerate(e for e in propia.etapas if e not in copias.values()):
        etapa.orden = len(copias) + i
    propia.nombre, propia.descripcion = base.nombre, base.descripcion
    db.flush()
    mapa = {original: copia.id for original, copia in copias.items()}
    for original, nuevo in mapa.items():
        db.execute(
            update(EtapaProceso)
            .where(EtapaProceso.proceso_id == proceso.id, EtapaProceso.etapa_id == original)
            .values(etapa_id=nuevo)
        )
    if proceso.etapa_id in mapa:
        proceso.etapa_id = mapa[proceso.etapa_id]
    proceso.plantilla_etapas_id = propia.id
    db.flush()
    db.expire(proceso, ["etapa", "plantilla_etapas"])
    return mapa


def _usadas_por(db: Session, proceso: Proceso, ids: list[int]) -> set[int]:
    if not ids:
        return set()
    historial = set(db.scalars(
        select(EtapaProceso.etapa_id).where(EtapaProceso.proceso_id == proceso.id, EtapaProceso.etapa_id.in_(ids))
    ))
    return historial | ({proceso.etapa_id} & set(ids))
