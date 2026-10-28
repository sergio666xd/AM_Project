from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.zona_horaria import FechaHora

EstadoRevision = Literal["RECIBIDO", "EN_REVISION", "APROBADO", "REQUIERE_CORRECCION", "RECHAZADO"]
EstadoPedido = Literal["FALTANTE", "RECIBIDO", "EN_REVISION", "APROBADO", "REQUIERE_CORRECCION", "RECHAZADO"]
GrupoArchivos = Literal["por_revisar", "por_corregir", "aprobados", "todos"]
GrupoSolicitudes = Literal["abiertas", "vencidas", "completas", "todas"]
EstadoSolicitud = Literal["esperando_cliente", "por_revisar", "completa"]
Decision = Literal["APROBADO", "REQUIERE_CORRECCION"]


class SolicitudBreve(BaseModel):
    id: int
    titulo: str


class Version(BaseModel):
    id: int
    numero: int = Field(description="1 es la primera entrega; la más alta es la vigente.")
    nombre_archivo: str
    tipo_archivo: str = Field(description="MIME del archivo.")
    vista_previa: bool = Field(description="PDF o imagen: el navegador lo puede mostrar.")
    estado_revision: EstadoRevision
    comentario: str | None = None
    revisado_por: str | None = None
    revisado_en: FechaHora | None = None
    recibido_en: FechaHora


class Archivo(BaseModel):
    """Un documento del proceso. Si responde a una solicitud, es la versión vigente
    de lo pedido y `versiones` trae todas las entregas, de la más reciente a la primera."""

    id: int
    nombre: str = Field(description="Lo que se pidió, o el nombre del archivo si no responde a una solicitud.")
    nombre_archivo: str
    tipo_archivo: str
    vista_previa: bool
    estado_revision: EstadoRevision
    comentario: str | None = None
    entregado_por_cliente: bool
    proceso: ProcesoBreve
    cliente: PersonaBreve | None = None
    solicitud: SolicitudBreve | None = None
    versiones: list[Version]
    recibido_en: FechaHora


class ResumenDocumentos(BaseModel):
    por_revisar: int = Field(description="Entregas del cliente sin revisar.")
    por_corregir: int = Field(description="Entregas devueltas al cliente para que las corrija.")
    solicitudes_abiertas: int
    solicitudes_vencidas: int


class ListaArchivos(BaseModel):
    items: list[Archivo]
    total: int
    resumen: ResumenDocumentos


class Pedido(BaseModel):
    """Un documento de los que pide la solicitud."""

    id: str
    nombre: str
    estado: EstadoPedido
    archivo_id: int | None = Field(None, description="Versión vigente, si ya entregó algo.")
    versiones: int


class Solicitud(BaseModel):
    id: int
    titulo: str
    instrucciones: str | None = None
    proceso: ProcesoBreve
    cliente: PersonaBreve
    estado: EstadoSolicitud
    pedidos: list[Pedido]
    entregados: int = Field(description="Pedidos con una entrega que no está devuelta para corregir.")
    fecha_limite: date | None = None
    vencida: bool = Field(description="Abierta y con la fecha límite ya pasada.")
    ultimo_recordatorio_en: FechaHora | None = None
    puede_recordar: bool = Field(description="Está abierta y no se le recordó al cliente en las últimas 12 horas.")
    creada_en: FechaHora


class ListaSolicitudes(BaseModel):
    items: list[Solicitud]
    total: int


class NuevaSolicitud(BaseModel):
    proceso_id: int
    cliente_id: int
    titulo: str = Field(min_length=1, max_length=255)
    documentos: list[str] = Field(min_length=1, max_length=30, description="Un nombre por documento pedido.")
    instrucciones: str | None = Field(None, max_length=4000)
    fecha_limite: date | None = None

    @field_validator("titulo", "instrucciones")
    @classmethod
    def _recortar(cls, valor: str | None) -> str | None:
        return valor.strip() or None if valor is not None else None

    @field_validator("documentos")
    @classmethod
    def _documentos(cls, valores: list[str]) -> list[str]:
        nombres = [valor.strip()[:180] for valor in valores if valor and valor.strip()]
        if not nombres:
            raise ValueError("Escribe al menos un documento.")
        if len({nombre.casefold() for nombre in nombres}) != len(nombres):
            raise ValueError("Cada documento debe tener un nombre distinto.")
        return nombres

    @model_validator(mode="after")
    def _titulo(self):
        if not self.titulo:
            raise ValueError("Escribe el nombre de la solicitud.")
        return self


class CambioFecha(BaseModel):
    fecha_limite: date | None = Field(description="null quita la fecha límite.")


class Revision(BaseModel):
    estado: Decision
    comentario: str | None = Field(None, max_length=4000)

    @field_validator("comentario")
    @classmethod
    def _recortar(cls, valor: str | None) -> str | None:
        return (valor or "").strip() or None

    @model_validator(mode="after")
    def _comentario_al_devolver(self):
        if self.estado == "REQUIERE_CORRECCION" and not self.comentario:
            raise ValueError("Dile al cliente qué debe corregir.")
        return self


class RecordatoriosEnviados(BaseModel):
    enviados: int
    solicitudes: list[int]
