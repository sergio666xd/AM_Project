from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.nucleo.zona_horaria import FechaHora

Estado = Literal["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"]
Prioridad = Literal["BAJA", "MEDIA", "ALTA", "URGENTE"]
Grupo = Literal["abiertas", "vencidas", "semana", "completadas", "todas"]


class PersonaBreve(BaseModel):
    id: int
    nombre: str


class AvanceSubtareas(BaseModel):
    total: int
    hechas: int


class TareaResumen(BaseModel):
    id: int
    titulo: str
    descripcion: str | None = None
    estado: Estado
    prioridad: Prioridad
    fecha_limite: FechaHora | None = None
    completada_en: FechaHora | None = None
    vencida: bool = Field(description="Abierta y con la fecha límite ya pasada.")
    proceso: ProcesoBreve | None = None
    radicado: str | None = None
    cliente: PersonaBreve | None = Field(None, description="Cliente al que se le asignó la tarea.")
    responsable: PersonaBreve
    subtareas: AvanceSubtareas


class ResumenTareas(BaseModel):
    abiertas: int
    vencidas: int
    semana: int = Field(description="Abiertas que vencen en los próximos 7 días.")
    completadas: int = Field(description="Completadas en los últimos 30 días.")


class ListaTareas(BaseModel):
    items: list[TareaResumen]
    total: int = Field(description="Tareas que cumplen los filtros; `items` trae como máximo 500.")
    resumen: ResumenTareas


class CambioEnLote(BaseModel):
    """Lo que se cambia a todas las tareas elegidas. Solo se aplican los campos enviados."""

    ids: list[int] = Field(min_length=1, max_length=200)
    estado: Estado | None = None
    prioridad: Prioridad | None = None
    fecha_limite: date | None = Field(None, description="Vencen al final de ese día. `null` quita la fecha.")
    eliminar: bool = False

    @field_validator("ids")
    @classmethod
    def _sin_repetidos(cls, ids: list[int]) -> list[int]:
        return list(dict.fromkeys(ids))

    @model_validator(mode="after")
    def _algo_que_cambiar(self) -> "CambioEnLote":
        cambios = self.model_fields_set & {"estado", "prioridad", "fecha_limite"}
        if self.eliminar and cambios:
            raise ValueError("Elimina las tareas o cámbialas, no las dos cosas a la vez.")
        if not self.eliminar and not cambios:
            raise ValueError("Indica qué cambiar en las tareas.")
        return self


class ResultadoLote(BaseModel):
    ids: list[int]
    mensaje: str


class PasoPlantilla(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    dias_habiles: int | None = Field(None, ge=0, le=365, description="Días hábiles desde la notificación; null: sin fecha.")
    prioridad: Prioridad = "MEDIA"

    @field_validator("titulo")
    @classmethod
    def _recortar(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("Escribe qué hay que hacer.")
        return valor


class DatosPlantilla(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    descripcion: str | None = Field(None, max_length=1000)
    palabras_clave: list[str] = Field(default_factory=list, max_length=20)
    pasos: list[PasoPlantilla] = Field(min_length=1, max_length=20)

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("Ponle un nombre a la plantilla.")
        return valor

    @field_validator("palabras_clave")
    @classmethod
    def _palabras(cls, palabras: list[str]) -> list[str]:
        limpias = [p.strip().lower() for p in palabras if p.strip()]
        return list(dict.fromkeys(p[:60] for p in limpias))


class Plantilla(DatosPlantilla):
    id: int
    coincide: bool = Field(False, description="Si sus palabras clave aparecen en el texto de `para`.")
    puede_editar: bool


class ListaPlantillas(BaseModel):
    items: list[Plantilla]


class AplicarPlantilla(BaseModel):
    proceso_id: int
    notificacion: date = Field(description="Desde cuándo se cuentan los días hábiles de cada paso.")
    folio: int | None = Field(None, ge=1, description="Folio del expediente que originó las tareas, para la descripción.")


class TareasCreadas(BaseModel):
    items: list[TareaResumen]
