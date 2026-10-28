from typing import Literal

from pydantic import BaseModel, Field


class Resultado(BaseModel):
    tipo: Literal["proceso", "cliente", "tarea"]
    id: int
    titulo: str
    detalle: str | None = None
    radicado: str | None = Field(None, description="Primer radicado del proceso, para mostrarlo por segmentos.")
    href: str


class Resultados(BaseModel):
    items: list[Resultado] = Field(description="Agrupados por tipo: procesos, clientes y tareas.")
