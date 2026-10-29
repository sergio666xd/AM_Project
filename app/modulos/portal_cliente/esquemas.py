from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.modulos.expedientes.esquemas import Etapa, PersonaBreve
from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora

TipoEntrada = Literal["actuacion", "documento", "solicitud", "contrato", "evento", "tarea", "etapa"]
TipoPendiente = Literal["documento", "tarea"]


class ProcesoBreve(BaseModel):
    id: int
    nombre: str


class ArchivoEntrada(BaseModel):
    nombre: str
    url: str = Field(description="Ruta de descarga del archivo, con la sesión del cliente.")


class EntradaHistoria(BaseModel):
    """Un folio del expediente contado al cliente."""

    folio: int = Field(description="El mismo número de folio que ve la firma.")
    tipo: TipoEntrada
    fecha: FechaHora
    con_hora: bool = Field(description="Falso cuando el origen solo trae el día (las actuaciones).")
    texto: str = Field(description="Lo que pasó, en lenguaje claro.")
    texto_juzgado: str | None = Field(
        None, description="Cómo lo escribió el juzgado, cuando `texto` es su explicación en lenguaje claro."
    )
    explicada: bool = Field(True, description="Falso en una actuación que nadie ha explicado todavía.")
    estado: str | None = Field(None, description="Estado corto cuando aplica: «en revisión», «aprobado»...")
    nota: str | None = Field(None, description="Comentario de la firma, como el motivo de una corrección.")
    archivo: ArchivoEntrada | None = None
    actuacion_id: int | None = None
    nuevo: bool = Field(description="Llegó después de la última vez que el cliente abrió el proceso.")


class EntradaReciente(EntradaHistoria):
    proceso: ProcesoBreve


class PaginaHistoria(Pagina[EntradaHistoria]):
    nuevos: int = Field(description="Entradas nuevas para el cliente en todo el proceso.")


class FechaProxima(BaseModel):
    id: int
    titulo: str
    tipo: str = Field(description="AUDIENCIA, REUNION, FIRMA_CONTRATO o EVENTO.")
    tipo_legible: str
    inicio: FechaHora
    fin: FechaHora | None
    descripcion: str | None


class PendienteCliente(BaseModel):
    """Algo que la firma le pidió al cliente."""

    clave: str = Field(description="«solicitud:3», «tarea:5» o «subtarea:9».")
    tipo: TipoPendiente
    titulo: str
    detalle: str | None = Field(None, description="Qué falta: «Faltan 2 de 3 documentos», «Parte de: …».")
    proceso: ProcesoBreve
    vence: date | None
    vencido: bool


class EtapaCliente(BaseModel):
    clave: Etapa
    nombre: str
    fecha: FechaHora | None = Field(description="Cuándo llegó el proceso a esta etapa, si ya pasó por ella.")


class ResumenProcesoCliente(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    abogado: PersonaBreve
    etapa: Etapa | None
    etapa_explicacion: str | None = Field(description="Qué se hace en la etapa actual, en lenguaje claro.")
    etapas: list[EtapaCliente] = Field(description="Las cinco etapas en orden, con la fecha de las ya recorridas.")
    proxima_fecha: FechaProxima | None
    nuevos: int
    ultima: EntradaHistoria | None


class InicioCliente(BaseModel):
    nombre: str = Field(description="Nombre de pila del cliente, para saludarlo.")
    pendientes: list[PendienteCliente]
    procesos: list[ResumenProcesoCliente]
    recientes: list[EntradaReciente] = Field(description="Lo último en todos sus procesos.")


class DocumentoCliente(BaseModel):
    id: int
    nombre: str
    fecha: FechaHora
    origen: Literal["cliente", "firma", "contrato"]
    estado: str | None = Field(None, description="Revisión de lo que envió el cliente: «en revisión», «aprobado»...")
    nota: str | None = None
    url: str


class ProcesoCliente(ResumenProcesoCliente):
    despacho: str | None
    radicados: list[str]
    equipo: list[PersonaBreve] = Field(description="Abogados colaboradores que la firma muestra al cliente.")
    pendientes: list[PendienteCliente]
    documentos: list[DocumentoCliente]
