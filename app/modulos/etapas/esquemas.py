from pydantic import BaseModel, Field, field_validator

from app.nucleo.zona_horaria import FechaHora


def _limpio(valor: str | None) -> str | None:
    if valor is None:
        return None
    limpio = " ".join(valor.split())
    return limpio or None


class EtapaBreve(BaseModel):
    id: int
    nombre: str


class EtapaDeLinea(EtapaBreve):
    explicacion: str | None = Field(description="Qué pasa en la etapa, en palabras sencillas. Lo lee el cliente.")


class EtapaActual(EtapaBreve):
    posicion: int = Field(description="Lugar de la etapa en la línea del proceso, desde 1.")
    total: int = Field(description="Cuántas etapas tiene la línea del proceso.")


class PlantillaBreve(BaseModel):
    id: int
    nombre: str


class EtapaDePlantilla(BaseModel):
    id: int
    nombre: str
    explicacion: str | None = Field(description="Qué pasa en la etapa, en palabras sencillas. Lo lee el cliente.")
    activa: bool
    procesos: int = Field(description="Procesos que están hoy en esta etapa.")


class PlantillaDeEtapas(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    activa: bool
    predeterminada: bool = Field(description="La que toman los procesos que no eligen otra.")
    etapas: list[EtapaDePlantilla] = Field(description="En orden, incluidas las desactivadas.")
    procesos: int = Field(description="Procesos que usan la plantilla.")
    actualizada_en: FechaHora


class ListaPlantillasEtapas(BaseModel):
    items: list[PlantillaDeEtapas]


class DatosEtapa(BaseModel):
    id: int | None = Field(None, description="Vacío para una etapa nueva.")
    nombre: str = Field(min_length=2, max_length=80)
    explicacion: str | None = Field(None, max_length=600)
    activa: bool = True

    _limpiar = field_validator("nombre", "explicacion")(_limpio)


class DatosPlantillaEtapas(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    descripcion: str | None = Field(None, max_length=300)
    activa: bool = True
    predeterminada: bool = False
    etapas: list[DatosEtapa] = Field(
        min_length=1, max_length=20,
        description="Todas las etapas, en orden. Las que falten se borran si ningún proceso las usó; si no, se desactivan.",
    )

    _limpiar = field_validator("nombre", "descripcion")(_limpio)


class DatosEtapasProceso(BaseModel):
    etapas: list[DatosEtapa] = Field(
        min_length=1, max_length=30,
        description=(
            "Todas las etapas del proceso, en orden, con los ids de `linea_etapas` (vacío para una nueva). "
            "Las que falten se borran si el proceso nunca estuvo en ellas; si estuvo, quedan solo en el historial."
        ),
    )
