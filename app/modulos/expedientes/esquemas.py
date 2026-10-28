from typing import Literal

from pydantic import BaseModel, Field

from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora


Etapa = Literal["demanda", "admision", "pruebas", "audiencia", "sentencia"]
ETAPAS: tuple[Etapa, ...] = ("demanda", "admision", "pruebas", "audiencia", "sentencia")
NOMBRES_ETAPA: dict[str, str] = {
    "demanda": "Demanda",
    "admision": "Admisión",
    "pruebas": "Pruebas",
    "audiencia": "Audiencia",
    "sentencia": "Sentencia",
}


class PersonaBreve(BaseModel):
    id: int
    nombre: str


class ProcesoResumen(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    responsable: PersonaBreve
    clientes: list[PersonaBreve]
    radicados: list[str] = Field(description="Números de radicado de 23 dígitos vinculados al proceso.")
    etapa: Etapa | None = Field(description="Etapa actual; vacía mientras la firma no la fije.")
    archivado_en: FechaHora | None
    creado_en: FechaHora
    puede_administrar: bool = Field(description="Si el usuario puede archivar, reabrir o cambiar el equipo.")


class CambioEtapa(BaseModel):
    etapa: Etapa
    fecha: FechaHora
    nota: str | None = Field(None, description="Nota de la firma. Al cliente no le llega.")
    autor: str | None = None


class ProcesoDetalle(ProcesoResumen):
    colaboradores: list[PersonaBreve] = Field(
        description="Abogados que colaboran. Al cliente solo le llegan los marcados como visibles."
    )
    etapas: list[CambioEtapa] = Field(description="Historial de cambios de etapa, del más antiguo al más reciente.")


class CambiarEtapa(BaseModel):
    etapa: Etapa
    nota: str | None = Field(None, max_length=500)


class PaginaProcesos(Pagina[ProcesoResumen]):
    pass
