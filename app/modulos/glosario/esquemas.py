from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.nucleo.zona_horaria import FechaHora

FuenteExplicacion = Literal["abogado", "glosario"]


class TerminoDelGlosario(BaseModel):
    id: int
    patron: str = Field(description="Fragmento del texto del juzgado que reconoce la actuación.")
    explicacion: str = Field(description="Lo que lee el cliente.")
    activo: bool
    actualizado_en: FechaHora
    actualizado_por: str | None = None


class ListaGlosario(BaseModel):
    items: list[TerminoDelGlosario]
    total: int


def _limpio(valor: str) -> str:
    return " ".join(valor.split())


class DatosTermino(BaseModel):
    patron: str = Field(min_length=3, max_length=160, description="Sin tildes ni mayúsculas también coincide.")
    explicacion: str = Field(min_length=10, max_length=600, description="Una o dos frases, tratando al cliente de usted.")
    activo: bool = True

    _limpiar = field_validator("patron", "explicacion")(_limpio)


class Explicacion(BaseModel):
    actuacion_id: int
    fecha: str | None = Field(None, description="Día de la actuación tal como lo publica la Rama Judicial (AAAA-MM-DD).")
    texto_juzgado: str = Field(description="La actuación como la escribió el juzgado.")
    anotacion: str | None = Field(None, description="Anotación del juzgado. Al cliente no le llega.")
    explicacion: str | None = Field(description="La actuación en lenguaje claro, o null si nadie la ha explicado.")
    fuente: FuenteExplicacion | None = Field(
        description="«abogado» si viene del aviso que envió la firma; «glosario» si sale del glosario."
    )
    patron: str | None = Field(None, description="Fragmento del glosario que coincidió.")
