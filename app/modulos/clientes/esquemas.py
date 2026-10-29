from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.expedientes.esquemas import Etapa
from app.nucleo.zona_horaria import FechaHora

Acceso = Literal["activo", "sin_ingreso", "suspendido"]
GrupoClientes = Literal["todos", "con_pendientes", "sin_ingreso", "sin_procesos"]
Canal = Literal["EMAIL", "WHATSAPP"]
Genero = Literal["FEMENINO", "MASCULINO"]


class ClienteResumen(BaseModel):
    id: int
    nombre: str
    email: str
    whatsapp: str | None
    documento: str | None
    acceso: Acceso = Field(description="sin_ingreso: aún no entra al portal con su contraseña temporal.")
    ultimo_acceso: FechaHora | None
    procesos: list[ProcesoBreve] = Field(description="Procesos activos del cliente que el usuario ve.")
    documentos_pendientes: int = Field(description="Documentos pedidos que el cliente no ha entregado o debe corregir.")
    solicitudes_vencidas: int
    proceso_chat_id: int | None = Field(description="Proceso con el que se abre la conversación con el cliente.")
    creado_en: FechaHora


class ResumenClientes(BaseModel):
    total: int
    con_pendientes: int
    sin_ingreso: int
    sin_procesos: int


class ListaClientes(BaseModel):
    items: list[ClienteResumen]
    resumen: ResumenClientes


class ProcesoDelCliente(BaseModel):
    id: int
    nombre: str
    etapa: Etapa | None
    radicados: list[str]
    responsable: str


class PendienteDelCliente(BaseModel):
    solicitud_id: int
    titulo: str
    proceso: ProcesoBreve
    faltan: list[str] = Field(description="Nombres de lo que no ha entregado o debe corregir.")
    total: int
    fecha_limite: date | None
    vencida: bool


class ContratoDelCliente(BaseModel):
    id: int
    estado: str
    proceso: ProcesoBreve
    firmado_en: FechaHora | None


class AvisoAlCliente(BaseModel):
    asunto: str
    proceso: ProcesoBreve
    enviado_en: FechaHora


class ClienteFicha(ClienteResumen):
    genero: Genero | None
    domicilio: str | None
    direccion: str | None
    canal: Canal | None = Field(description="Canal que eligió para los avisos.")
    expedientes: list[ProcesoDelCliente]
    pendientes: list[PendienteDelCliente]
    contratos: list[ContratoDelCliente] | None = Field(
        description="Contratos de servicios. Vacío (null) si el usuario no gestiona contratos."
    )
    avisos: list[AvisoAlCliente] = Field(description="Los últimos avisos de actuaciones que la firma le envió.")


def _limpio(valor: str | None) -> str | None:
    valor = " ".join((valor or "").split())
    return valor or None


class DatosCliente(BaseModel):
    nombre: str | None = Field(None, min_length=3, max_length=150)
    whatsapp: str | None = Field(None, max_length=20)
    documento: str | None = Field(None, max_length=40)
    genero: Genero | None = None
    domicilio: str | None = Field(None, max_length=120)
    direccion: str | None = Field(None, max_length=300)

    @field_validator("nombre", "whatsapp", "domicilio", "direccion")
    @classmethod
    def _sin_espacios_de_mas(cls, valor: str | None) -> str | None:
        return _limpio(valor)

    @field_validator("documento")
    @classmethod
    def _documento_sin_puntos(cls, valor: str | None) -> str | None:
        valor = _limpio(valor)
        return valor.replace(".", "") if valor else None


class NuevoCliente(DatosCliente):
    nombre: str = Field(min_length=3, max_length=150)
    email: EmailStr
    canal: Canal = Field("EMAIL", description="Por dónde le llegan las credenciales y los avisos.")


class AccesoEnviado(BaseModel):
    canal: Canal
    destino: str = Field(description="Correo o WhatsApp al que se envió.")
