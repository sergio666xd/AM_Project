from typing import Literal

from pydantic import BaseModel, Field

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.zona_horaria import FechaHora

EstadoContrato = Literal["BORRADOR", "LISTO_PARA_FIRMA", "EN_FIRMA", "FIRMADO", "TERMINADO", "ANULADO"]
GrupoContratos = Literal["en_curso", "firmados", "cerrados", "todos"]


class DocumentoFirmado(BaseModel):
    id: int
    nombre_archivo: str
    subido_en: FechaHora


class Contrato(BaseModel):
    id: int
    estado: EstadoContrato
    version: int
    proceso: ProcesoBreve
    expediente_archivado: bool
    cliente: PersonaBreve | None = Field(description="Si el cliente ya no existe, el nombre con el que se firmó.")
    creado_en: FechaHora
    emitido_en: FechaHora | None = Field(description="Cuando quedó listo para firmar.")
    firmado_en: FechaHora | None
    cerrado_en: FechaHora | None = Field(description="Cuando se terminó o se anuló.")
    motivo_cierre: str | None
    documento_firmado: DocumentoFirmado | None


class ResumenContratos(BaseModel):
    en_preparacion: int = Field(description="Borradores.")
    por_firmar: int = Field(description="Listos para firmar o con la firma agendada.")
    firmados: int
    sin_contrato: int = Field(description="Procesos activos con cliente y sin contrato vigente.")


class ListaContratos(BaseModel):
    items: list[Contrato]
    resumen: ResumenContratos


class ProcesoSinContrato(BaseModel):
    id: int
    nombre: str
    clientes: list[PersonaBreve]
    responsable: str
    creado_en: FechaHora
    ultimo_contrato: EstadoContrato | None = Field(description="TERMINADO o ANULADO si tuvo uno; vacío si nunca.")


class ListaSinContrato(BaseModel):
    items: list[ProcesoSinContrato]
