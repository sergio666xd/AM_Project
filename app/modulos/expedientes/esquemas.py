from pydantic import BaseModel, Field

from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora


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
    archivado_en: FechaHora | None
    creado_en: FechaHora
    puede_administrar: bool = Field(description="Si el usuario puede archivar, reabrir o cambiar el equipo.")


class ProcesoDetalle(ProcesoResumen):
    colaboradores: list[PersonaBreve] = Field(
        description="Abogados que colaboran. Al cliente solo le llegan los marcados como visibles."
    )


class PaginaProcesos(Pagina[ProcesoResumen]):
    pass
