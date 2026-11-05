from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modulos.tareas.esquemas import ActuacionBreve
from app.modulos.etapas.esquemas import EtapaActual, EtapaBreve, EtapaDeLinea, PlantillaBreve
from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora


class PersonaBreve(BaseModel):
    id: int
    nombre: str


class ActividadProceso(BaseModel):
    """Lo que el proceso tiene abierto. Solo para el equipo de la firma."""

    tareas_abiertas: int
    tareas_vencidas: int
    por_revisar: int = Field(description="Entregas del cliente sin revisar.")
    pendiente_cliente: int = Field(description="Solicitudes de documentos que el cliente no ha completado.")
    proximo_vencimiento: date | None = Field(None, description="Día en que vence la próxima tarea abierta.")


class ProcesoResumen(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    responsable: PersonaBreve
    clientes: list[PersonaBreve]
    radicados: list[str] = Field(description="Números de radicado de 23 dígitos vinculados al proceso.")
    etapa: EtapaActual | None = Field(description="Etapa actual; vacía mientras la firma no la fije.")
    archivado_en: FechaHora | None
    creado_en: FechaHora
    puede_administrar: bool = Field(description="Si el usuario puede archivar, reabrir o cambiar el equipo.")
    actividad: ActividadProceso | None = Field(None, description="Solo en el listado y para el equipo de la firma.")


class CambioEtapa(BaseModel):
    etapa: EtapaBreve
    fecha: FechaHora
    nota: str | None = Field(None, description="Nota de la firma. Al cliente no le llega.")
    autor: str | None = None


class ProcesoDetalle(ProcesoResumen):
    colaboradores: list[PersonaBreve] = Field(
        description="Abogados que colaboran. Al cliente solo le llegan los marcados como visibles."
    )
    plantilla: PlantillaBreve = Field(
        description="Plantilla de etapas que sigue el proceso. Si tiene etapas propias, la plantilla de la que salieron."
    )
    etapas_propias: bool = Field(description="Si el abogado ajustó las etapas de este proceso; los cambios de la plantilla ya no lo afectan.")
    linea_etapas: list[EtapaDeLinea] = Field(description="Las etapas del proceso, en orden.")
    etapas: list[CambioEtapa] = Field(description="Historial de cambios de etapa, del más antiguo al más reciente.")


class CambiarEtapa(BaseModel):
    etapa_id: int = Field(
        description=(
            "Una etapa de la línea del proceso, o una etapa activa de otra plantilla activa: entonces el proceso pasa "
            "a seguir esa plantilla (si tenía etapas propias, se reemplazan por las de la plantilla)."
        )
    )
    nota: str | None = Field(None, max_length=500)


class PaginaProcesos(Pagina[ProcesoResumen]):
    pass


class RadicadoConActuaciones(BaseModel):
    id: int
    numero: str
    actuaciones: list[ActuacionBreve] = Field(description="Las 40 más recientes, de la más nueva a la más antigua.")


class VinculosProceso(BaseModel):
    """Con qué se puede relacionar algo del proceso: sus clientes, radicados y actuaciones."""

    clientes: list[PersonaBreve]
    radicados: list[RadicadoConActuaciones]


def _nombre(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    if not valor:
        raise ValueError("Escriba el nombre del proceso.")
    return valor


def _descripcion(valor: str | None) -> str | None:
    return (valor or "").strip() or None


class DatosProceso(BaseModel):
    nombre: str = Field(min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=4000)

    _limpiar_nombre = field_validator("nombre")(_nombre)
    _limpiar_descripcion = field_validator("descripcion")(_descripcion)


class CambiosProceso(BaseModel):
    """Solo se cambian los campos enviados."""

    nombre: str | None = Field(None, min_length=1, max_length=255)
    descripcion: str | None = Field(None, max_length=4000)

    _limpiar_nombre = field_validator("nombre")(_nombre)
    _limpiar_descripcion = field_validator("descripcion")(_descripcion)

    @model_validator(mode="after")
    def _algo(self) -> "CambiosProceso":
        if not self.model_fields_set:
            raise ValueError("Indique qué cambiar en el proceso.")
        if "nombre" in self.model_fields_set and self.nombre is None:
            raise ValueError("El nombre del proceso no puede quedar vacío.")
        return self


class ClienteDelProceso(BaseModel):
    id: int
    nombre: str
    email: str
    whatsapp: str | None = None


class RadicadoDelProceso(BaseModel):
    id: int
    numero: str
    estado_consulta: str | None = Field(None, description="Cómo terminó la última consulta a la Rama Judicial.")
    total_actuaciones: int
    actuaciones: list[ActuacionBreve] = Field(description="Las 5 más recientes, de la más nueva a la más antigua.")


class RelacionesProceso(BaseModel):
    """Clientes con acceso al proceso y radicados que se siguen en él."""

    clientes: list[ClienteDelProceso]
    radicados: list[RadicadoDelProceso]
    puede_editar: bool = Field(description="El cliente nunca edita; el equipo del proceso sí.")


class VincularCliente(BaseModel):
    cliente_id: int


class NuevoRadicado(BaseModel):
    numero: str = Field(min_length=23, max_length=40, description="Los 23 dígitos, con o sin espacios o guiones.")


class RadicadoAgregado(BaseModel):
    relaciones: RelacionesProceso
    radicado_id: int
    consulta_id: int | None = Field(None, description="Consulta a la Rama Judicial que quedó en cola para este radicado.")
    mensaje: str


class MiembroEquipo(BaseModel):
    id: int
    nombre: str
    visible_cliente: bool = Field(description="Abogado participante: el cliente lo ve en su portal.")


class EquipoProceso(BaseModel):
    admite_equipo: bool = Field(description="Solo los procesos de la firma admiten colaboradores.")
    puede_gestionar: bool = Field(description="El responsable y la administración cambian el equipo.")
    responsable: PersonaBreve
    miembros: list[MiembroEquipo]
    disponibles: list[PersonaBreve] = Field(description="Abogados activos de la firma que aún no están en el equipo.")


class NuevoMiembro(BaseModel):
    abogado_id: int
    visible_cliente: bool = False


class CambioMiembro(BaseModel):
    visible_cliente: bool
