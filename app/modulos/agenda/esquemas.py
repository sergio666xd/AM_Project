from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

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
