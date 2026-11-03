from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

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


# ---- Redacción, firma y entrega (el contrato dentro del expediente) ----------

class VersionContrato(BaseModel):
    version: int
    estado: EstadoContrato
    creado_en: FechaHora


class FirmaAgendada(BaseModel):
    evento_id: int
    inicio: FechaHora
    fin: FechaHora | None = None
    estado: str = Field(description="PROGRAMADO, COMPLETADO o CANCELADO.")


class EntregaCopia(BaseModel):
    estado: Literal["ENVIADO", "ERROR"]
    destinatario: str
    enviado_en: FechaHora
    error: str | None = None


class ContratoDetalle(Contrato):
    campos: dict[str, str] = Field(description="Los datos que llenan la plantilla CPS.")
    versiones: list[VersionContrato]
    firma: FirmaAgendada | None = Field(description="La cita de firma vigente, si ya se agendó.")
    ultima_entrega: EntregaCopia | None = Field(description="El último envío de la copia firmada al cliente.")
    puede_editar: bool = Field(description="Es el responsable o la administración y el expediente no está archivado.")


class ContratosDelProceso(BaseModel):
    items: list[ContratoDetalle] = Field(description="Del más reciente al más antiguo.")
    clientes: list[PersonaBreve] = Field(description="Clientes del proceso a los que se les puede hacer contrato.")
    puede_crear: bool


class PlantillaContrato(BaseModel):
    campos: dict[str, str] = Field(description="Datos iniciales: el abogado responsable y lo que se sabe del cliente.")


def _campos(valor: dict[str, str]) -> dict[str, str]:
    if len(valor) > 40 or any(len(k) > 40 or not isinstance(v, str) or len(v) > 5000 for k, v in valor.items()):
        raise ValueError("Los datos del contrato no tienen el formato esperado.")
    return valor


class NuevoContrato(BaseModel):
    cliente_id: int
    campos: dict[str, str]

    @field_validator("campos")
    @classmethod
    def _formato(cls, valor: dict[str, str]) -> dict[str, str]:
        return _campos(valor)


class CambiosContrato(BaseModel):
    campos: dict[str, str]

    @field_validator("campos")
    @classmethod
    def _formato(cls, valor: dict[str, str]) -> dict[str, str]:
        return _campos(valor)


class MotivoContrato(BaseModel):
    motivo: str = Field(min_length=3, max_length=500, description="Queda en el historial del contrato.")

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, valor: str) -> str:
        valor = " ".join(valor.split())
        if len(valor) < 3:
            raise ValueError("Escriba el motivo.")
        return valor


class CitaDeFirma(BaseModel):
    inicio: datetime = Field(description="Con zona horaria.")
    fin: datetime | None = None
    lugar: str | None = Field(None, max_length=500, description="Dónde se firma; va en la descripción de la cita.")

    @model_validator(mode="after")
    def _fechas(self):
        if self.inicio.tzinfo is None or (self.fin is not None and self.fin.tzinfo is None):
            raise ValueError("Las fechas deben traer zona horaria.")
        if self.fin is not None and self.fin <= self.inicio:
            raise ValueError("La hora final va después del inicio.")
        self.lugar = (self.lugar or "").strip() or None
        return self


class ContratoCargado(BaseModel):
    contrato: ContratoDetalle
    entrega: EntregaCopia
    mensaje: str
