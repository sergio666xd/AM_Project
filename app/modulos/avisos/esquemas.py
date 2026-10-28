from pydantic import BaseModel, Field

from app.nucleo.zona_horaria import FechaHora


class Aviso(BaseModel):
    id: str = Field(description="Identificador estable del aviso; sirve para marcarlo como leído.")
    titulo: str
    detalle: str | None = None
    proceso: str | None = Field(None, description="Nombre del proceso relacionado, si lo hay.")
    fecha: FechaHora | None = None
    href: str = Field(description="Ruta del panel donde se atiende el aviso.")
    leido: bool


class Avisos(BaseModel):
    items: list[Aviso]
    sin_leer: int = Field(description="Avisos sin leer en total, no solo en `items`.")


class MarcarLeidos(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class Marcados(BaseModel):
    marcados: int
