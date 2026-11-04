from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

EstadoConsulta = Literal["consultado", "sin_consultar", "consultando", "no_encontrado", "privado", "error"]


class ConsultaRadicado(BaseModel):
    estado: EstadoConsulta
    etiqueta: str = Field(description="El estado en palabras, para mostrarlo tal cual.")
    detalle: str | None = Field(None, description="Qué falló, cuando la consulta terminó en error.")
    consultado_en: str | None = Field(None, description="Última consulta, en hora de Bogotá (ISO sin zona).")


class ProcesoDelRadicado(BaseModel):
    id: int
    nombre: str
    archivado: bool


class ActuacionResumen(BaseModel):
    id: int
    texto: str
    fecha: date | None = None


class RadicadoFila(BaseModel):
    id: int
    numero: str
    despacho: str | None = None
    demandante: str | None = None
    demandado: str | None = None
    consulta: ConsultaRadicado
    procesos: list[ProcesoDelRadicado] = Field(description="Procesos de la firma que siguen este radicado y usted puede ver.")
    ultima_actuacion: ActuacionResumen | None = None
    total_actuaciones: int
    novedades: int = Field(description="Actuaciones nuevas que usted aún no revisa.")


class ResumenRadicados(BaseModel):
    total: int
    con_novedades: int
    con_problemas: int = Field(description="No encontrados en la Rama Judicial o con error en la última consulta.")
    sin_consultar: int


class ListaRadicados(BaseModel):
    items: list[RadicadoFila]
    resumen: ResumenRadicados


class ActuacionDelRadicado(BaseModel):
    id: int
    orden: int
    fecha: date | None = None
    actuacion: str
    anotacion: str | None = None
    inicia_termino: date | None = None
    finaliza_termino: date | None = None
    registrada: date | None = None
    fijacion: bool = Field(description="Se notificó por estado (fijación).")
    nueva: bool = Field(description="Llegó en una consulta que usted no había revisado.")


class RadicadoDetalle(RadicadoFila):
    actuaciones: list[ActuacionDelRadicado] = Field(description="De la más reciente a la más antigua.")
    puede_consultar: bool = Field(description="Puede pedir una consulta inmediata (solo la administración).")
