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
    palabras_clave: list[str]
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


# ---- Detalle y edición de una tarea ------------------------------------------


def _titulo(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    if not valor:
        raise ValueError("Escriba qué hay que hacer.")
    return valor


def _notas(valor: str | None) -> str | None:
    return (valor or "").strip() or None


class RadicadoBreve(BaseModel):
    id: int
    numero: str


class ActuacionBreve(BaseModel):
    id: int
    texto: str
    fecha: date | None = None


class SubtareaDetalle(BaseModel):
    id: int
    titulo: str
    completada: bool
    completada_en: FechaHora | None = None
    cliente: PersonaBreve | None = Field(None, description="Cliente al que se le pidió; la ve en su portal.")
    avisar_correo: bool
    avisar_whatsapp: bool


class Recordatorio(BaseModel):
    id: int
    fecha_hora: FechaHora | None = Field(None, description="Momento exacto, si se programó así.")
    anticipacion_minutos: int | None = Field(None, description="Minutos antes del vencimiento, si se programó así.")
    cuando: FechaHora | None = Field(None, description="Cuándo sale; vacío si depende de una fecha límite que ya no hay.")
    correo: bool
    whatsapp: bool
    activo: bool
    enviado_en: FechaHora | None = None


class TareaDetalle(BaseModel):
    id: int
    titulo: str
    descripcion: str | None = None
    estado: Estado
    prioridad: Prioridad
    fecha_limite: FechaHora | None = None
    completada_en: FechaHora | None = None
    vencida: bool
    creada_en: FechaHora
    actualizada_en: FechaHora
    responsable: PersonaBreve
    proceso: ProcesoBreve | None = None
    radicado: RadicadoBreve | None = None
    actuacion: ActuacionBreve | None = None
    cliente: PersonaBreve | None = Field(None, description="Cliente al que se le asignó la tarea.")
    subtareas: list[SubtareaDetalle]
    recordatorios: list[Recordatorio] = Field(description="Los que programó el equipo, en orden de salida.")
    avisos_automaticos: list[FechaHora] = Field(
        description="Avisos que la plataforma manda sola antes del vencimiento a quien debe hacer la tarea."
    )


class DatosTarea(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=4000)
    prioridad: Prioridad = "MEDIA"
    fecha_limite: date | None = Field(None, description="Vence al final de ese día, hora de Colombia.")
    proceso_id: int | None = Field(None, description="Sin proceso es una tarea general, sin radicado ni cliente.")
    radicado_id: int | None = Field(None, description="Un radicado del proceso.")
    actuacion_id: int | None = Field(None, description="Una actuación de ese radicado.")
    cliente_id: int | None = Field(None, description="Un cliente del proceso; la tarea le llega a su portal.")

    _limpiar_titulo = field_validator("titulo")(_titulo)
    _limpiar_notas = field_validator("descripcion")(_notas)


class CambiosTarea(BaseModel):
    """Solo se cambian los campos enviados. `null` en una relación la quita."""

    titulo: str | None = Field(None, min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=4000)
    estado: Estado | None = None
    prioridad: Prioridad | None = None
    fecha_limite: date | None = None
    proceso_id: int | None = None
    radicado_id: int | None = None
    actuacion_id: int | None = None
    cliente_id: int | None = None

    _limpiar_titulo = field_validator("titulo")(_titulo)
    _limpiar_notas = field_validator("descripcion")(_notas)

    @model_validator(mode="after")
    def _algo(self) -> "CambiosTarea":
        if not self.model_fields_set:
            raise ValueError("Indique qué cambiar en la tarea.")
        for campo in ("titulo", "estado", "prioridad"):
            if campo in self.model_fields_set and getattr(self, campo) is None:
                raise ValueError(f"El campo {campo} no puede quedar vacío.")
        return self


class DatosSubtarea(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    cliente_id: int | None = Field(None, description="Pedírsela a un cliente del proceso.")
    avisar_correo: bool = True
    avisar_whatsapp: bool = True

    _limpiar_titulo = field_validator("titulo")(_titulo)


class CambiosSubtarea(BaseModel):
    titulo: str | None = Field(None, min_length=1, max_length=255)
    completada: bool | None = None
    orden: int | None = Field(None, ge=0)
    cliente_id: int | None = None
    avisar_correo: bool | None = None
    avisar_whatsapp: bool | None = None

    _limpiar_titulo = field_validator("titulo")(_titulo)


class DatosRecordatorio(BaseModel):
    fecha_hora: FechaHora | None = Field(None, description="Un momento exacto, en el futuro.")
    anticipacion_minutos: int | None = Field(None, ge=5, le=60 * 24 * 30, description="O minutos antes del vencimiento.")
    correo: bool = True
    whatsapp: bool = False

    @model_validator(mode="after")
    def _uno(self) -> "DatosRecordatorio":
        if (self.fecha_hora is None) == (self.anticipacion_minutos is None):
            raise ValueError("Indique un momento exacto o una anticipación, no las dos.")
        if not self.correo and not self.whatsapp:
            raise ValueError("Elija al menos un canal: correo o WhatsApp.")
        return self


class CambiosRecordatorio(BaseModel):
    activo: bool | None = None
    fecha_hora: FechaHora | None = None
    anticipacion_minutos: int | None = Field(None, ge=5, le=60 * 24 * 30)
