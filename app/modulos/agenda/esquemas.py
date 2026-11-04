from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.nucleo.zona_horaria import FechaHora

TipoElemento = Literal["evento", "tarea"]


class ElementoAgenda(BaseModel):
    clave: str = Field(description="Identificador estable, como «evento:4» o «tarea:12».")
    tipo: TipoElemento
    etiqueta: str = Field(description="Audiencia, Reunión, Firma de contrato, Evento o Vence tarea.")
    titulo: str
    detalle: str | None = None
    inicio: FechaHora
    fin: FechaHora | None = None
    todo_el_dia: bool = Field(description="Las tareas vencen en un día, sin hora de inicio.")
    estado: str = Field(description="PROGRAMADO, COMPLETADO o CANCELADO en eventos; el estado de la tarea en tareas.")
    vencida: bool = False
    proceso: ProcesoBreve | None = None
    responsable: str | None = None
    enlace: str = Field(description="Ruta del panel del abogado donde se atiende.")


class Agenda(BaseModel):
    desde: date
    hasta: date
    items: list[ElementoAgenda] = Field(description="Ordenados por inicio.")


class Suscripcion(BaseModel):
    activa: bool
    creada_en: FechaHora | None = None
    ultimo_uso: FechaHora | None = Field(None, description="Última vez que un calendario leyó el enlace.")


class EnlaceSuscripcion(BaseModel):
    ruta: str = Field(description="Ruta del feed con el token, para unir al dominio del sitio. Solo se muestra esta vez.")
    creada_en: FechaHora


TipoEvento = Literal["AUDIENCIA", "REUNION", "EVENTO"]
EstadoEvento = Literal["PROGRAMADO", "COMPLETADO", "CANCELADO"]


class PersonaBreve(BaseModel):
    id: int
    nombre: str


class EventoDelProceso(BaseModel):
    id: int
    tipo: str = Field(description="AUDIENCIA, REUNION, EVENTO o FIRMA_CONTRATO.")
    etiqueta: str
    titulo: str
    descripcion: str | None = None
    inicio: FechaHora
    fin: FechaHora | None = None
    estado: EstadoEvento
    proceso: ProcesoBreve
    responsable: PersonaBreve | None = None
    cliente: PersonaBreve | None = Field(None, description="Cliente al que se avisó. Vacío: se avisó a todos los del proceso.")
    contrato_id: int | None = Field(None, description="Las firmas de contrato se cambian desde el contrato.")


class EventosDelProceso(BaseModel):
    items: list[EventoDelProceso] = Field(description="Del más próximo al más lejano; los pasados, al final.")


def _titulo(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    if not valor:
        raise ValueError("Escriba de qué se trata.")
    return valor


def _descripcion(valor: str | None) -> str | None:
    return (valor or "").strip() or None


def _con_zona(valor: datetime | None) -> datetime | None:
    if valor is not None and valor.tzinfo is None:
        raise ValueError("Indique la hora con su zona horaria.")
    return valor


class DatosEvento(BaseModel):
    proceso_id: int
    tipo: TipoEvento = "AUDIENCIA"
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=4000)
    inicio: datetime = Field(description="Con zona horaria, p. ej. 2026-11-20T09:00:00-05:00.")
    fin: datetime | None = None
    cliente_id: int | None = Field(None, description="Avisar solo a este cliente del proceso. Vacío: a todos.")

    _limpiar_titulo = field_validator("titulo")(_titulo)
    _limpiar_descripcion = field_validator("descripcion")(_descripcion)
    _zona = field_validator("inicio", "fin")(_con_zona)

    @model_validator(mode="after")
    def _orden(self) -> "DatosEvento":
        if self.fin is not None and self.fin <= self.inicio:
            raise ValueError("La hora final va después del inicio.")
        return self


class CambiosEvento(BaseModel):
    """Solo se cambian los campos enviados."""

    tipo: TipoEvento | None = None
    titulo: str | None = Field(None, min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=4000)
    inicio: datetime | None = None
    fin: datetime | None = None
    estado: EstadoEvento | None = None
    cliente_id: int | None = None

    _limpiar_titulo = field_validator("titulo")(_titulo)
    _limpiar_descripcion = field_validator("descripcion")(_descripcion)
    _zona = field_validator("inicio", "fin")(_con_zona)

    @model_validator(mode="after")
    def _algo(self) -> "CambiosEvento":
        if not self.model_fields_set:
            raise ValueError("Indique qué cambiar en el evento.")
        for campo in ("tipo", "titulo", "inicio", "estado"):
            if campo in self.model_fields_set and getattr(self, campo) is None:
                raise ValueError(f"El campo {campo} no puede quedar vacío.")
        return self
