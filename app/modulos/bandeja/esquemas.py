from typing import Literal

from pydantic import BaseModel, Field

from app.nucleo.zona_horaria import FechaHora

TipoPendiente = Literal["tarea", "evento", "documento"]
Urgencia = Literal["vencida", "hoy", "pronto", "por_revisar"]


class ProcesoBreve(BaseModel):
    id: int
    nombre: str


class Pendiente(BaseModel):
    clave: str = Field(description="Identificador estable del pendiente, como «tarea:12».")
    tipo: TipoPendiente
    urgencia: Urgencia = Field(
        description="vencida: pasó la fecha; hoy: vence u ocurre hoy; pronto: en los próximos 7 días; "
        "por_revisar: un documento del cliente sin revisar."
    )
    titulo: str
    detalle: str | None = None
    fecha: FechaHora | None = None
    proceso: ProcesoBreve | None = None
    enlace: str = Field(description="Ruta del panel del abogado donde se atiende.")


class ResumenBandeja(BaseModel):
    procesos_activos: int
    tareas_vencidas: int
    vencen_esta_semana: int = Field(description="Tareas que vencen y audiencias o eventos en los próximos 7 días.")
    documentos_por_revisar: int


class Bandeja(BaseModel):
    resumen: ResumenBandeja
    pendientes: list[Pendiente] = Field(description="Ordenados por urgencia y fecha.")
    agenda: list[Pendiente] = Field(description="Audiencias y eventos de hoy y los próximos 7 días.")
