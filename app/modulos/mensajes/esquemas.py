from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.nucleo.zona_horaria import FechaHora

TipoConversacion = Literal["cliente", "colaboradores", "equipo_proceso", "equipo"]
EstadoEntrega = Literal["enviado", "entregado", "entregado_parcial", "leido"]
TipoReferencia = Literal["RADICADO", "ACTUACION", "TAREA", "SUBTAREA", "EVENTO", "DOCUMENTO"]


class Contacto(BaseModel):
    id: int
    nombre: str
    rol: Literal["cliente", "abogado", "administrador"]


class UltimoMensaje(BaseModel):
    texto: str
    autor: str | None
    es_mio: bool
    enviado_en: FechaHora


class Conversacion(BaseModel):
    id: int
    clave: str = Field(description="Ruta estable de la conversación, como «process:12:34» o «direct:5».")
    tipo: TipoConversacion = Field(description=(
        "cliente: con un cliente sobre un proceso; colaboradores: el equipo del proceso; "
        "equipo_proceso: dos abogados sobre un proceso; equipo: dos integrantes de la firma."
    ))
    titulo: str
    proceso: ProcesoBreve | None
    contacto: Contacto | None = Field(description="La otra persona, si la conversación es entre dos.")
    participantes: int
    en_linea: int = Field(description="Cuántos de los demás participantes tienen el panel abierto ahora.")
    sin_leer: int
    primer_sin_leer_id: int | None
    por_responder: bool = Field(description="El último mensaje es de un cliente y nadie de la firma ha respondido.")
    ultimo: UltimoMensaje | None
    actualizada_en: FechaHora


class ResumenMensajes(BaseModel):
    sin_leer: int = Field(description="Conversaciones con mensajes sin leer.")
    por_responder: int = Field(description="Conversaciones con clientes cuyo último mensaje espera respuesta.")


class ListaConversaciones(BaseModel):
    items: list[Conversacion]
    resumen: ResumenMensajes


class Entrega(BaseModel):
    estado: EstadoEntrega
    entregados: int
    leidos: int
    destinatarios: int


class Autor(BaseModel):
    id: int
    nombre: str


class Referencia(BaseModel):
    tipo: TipoReferencia
    id: int
    titulo: str
    enlace: str | None


class Mensaje(BaseModel):
    id: int
    texto: str
    autor: Autor | None = Field(description="Vacío si la cuenta del autor ya no existe.")
    es_mio: bool
    enviado_en: FechaHora
    entrega: Entrega | None = Field(description="Solo en los mensajes propios.")
    referencia: Referencia | None
    folio: int | None = Field(description="Número de folio en el expediente, en las conversaciones de un proceso.")


class EntregaDeMensaje(BaseModel):
    id: int
    entrega: Entrega


class Hilo(BaseModel):
    conversacion: Conversacion
    mensajes: list[Mensaje] = Field(description="En orden cronológico.")
    hay_mas: bool = Field(description="Hay mensajes anteriores al primero de la página.")
    entregas: list[EntregaDeMensaje] = Field(description="Estado actual de los mensajes propios recientes, para refrescarlos.")


class OpcionReferencia(BaseModel):
    tipo: TipoReferencia
    id: int
    titulo: str
    grupo: str | None = Field(None, description="Radicado de la actuación, tarea de la subtarea o solicitud del documento.")
    radicado: str | None = None
    padre_id: int | None = None
    solicitud_id: int | None = None


class ReferenciaElegida(BaseModel):
    tipo: TipoReferencia
    id: int


class NuevoMensaje(BaseModel):
    texto: str = Field(max_length=12000)
    referencia: ReferenciaElegida | None = None

    @field_validator("texto")
    @classmethod
    def _limpiar(cls, valor: str) -> str:
        return valor.strip()


class Leido(BaseModel):
    hasta: int = Field(description="Id del último mensaje leído.")
