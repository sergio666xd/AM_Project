from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.nucleo.paginacion import Pagina
from app.nucleo.zona_horaria import FechaHora

AreaConsulta = Literal["familia", "empresas", "propiedad_horizontal", "publico", "poliza", "otro"]
EstadoSolicitud = Literal["nueva", "atendida", "descartada"]
AvisoFirma = Literal["pendiente", "enviado", "fallido"]

AREAS: dict[str, str] = {
    "familia": "familia o herencias",
    "empresas": "empresas o contratos",
    "propiedad_horizontal": "propiedad horizontal",
    "publico": "un asunto con una entidad pública",
    "poliza": "la póliza jurídica",
    "otro": "otro asunto",
}


# ---- Público ---------------------------------------------------------------

class ContactoPublico(BaseModel):
    """Lo que el sitio muestra de la firma. Si la administración oculta el contacto, solo va el nombre."""

    nombre: str
    mostrar_contacto: bool
    correo_contacto: str | None = None
    correo_pqr: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    direccion: str | None = None
    ciudad: str | None = None
    pais: str | None = None


class PaginaPublica(BaseModel):
    slug: str
    contenido: dict[str, Any] | None = Field(description="Lo que la administración cambió; null si la página usa su texto base.")
    actualizada_en: FechaHora | None


def _limpio(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    return valor or None


class NuevoMensajeSitio(BaseModel):
    nombre: str = Field(max_length=150)
    telefono: str | None = Field(default=None, max_length=40, description="WhatsApp o teléfono.")
    correo: EmailStr | None = None
    area: AreaConsulta
    mensaje: str = Field(max_length=3000)
    autorizacion: bool = Field(description="Autoriza el tratamiento de sus datos (Ley 1581 de 2012).")
    website: str = Field(default="", max_length=200, description="Campo trampa: las personas lo dejan vacío.")

    @field_validator("correo", mode="before")
    @classmethod
    def _correo_vacio(cls, valor):
        return (valor.strip() or None) if isinstance(valor, str) else valor

    @field_validator("nombre", "telefono", mode="after")
    @classmethod
    def _espacios(cls, valor):
        return _limpio(valor) if valor is not None else valor

    @field_validator("mensaje", mode="after")
    @classmethod
    def _mensaje(cls, valor: str):
        return "\n".join(linea.rstrip() for linea in valor.strip().splitlines())


class MensajeSitioRecibido(BaseModel):
    mensaje: str


# ---- Administración --------------------------------------------------------

class MensajeSitio(BaseModel):
    id: int
    nombre: str
    telefono: str | None
    correo: str | None
    area: AreaConsulta
    mensaje: str
    estado: EstadoSolicitud
    nota: str | None
    aviso_firma: AvisoFirma = Field(description="Si el correo de aviso a la firma salió.")
    aviso_error: str | None
    whatsapp_url: str | None = Field(description="Enlace para escribirle por WhatsApp, si dejó un número.")
    recibida_en: FechaHora
    atendida_en: FechaHora | None
    atendida_por: str | None


class ConteoMensajesSitio(BaseModel):
    nueva: int
    atendida: int
    descartada: int


class PaginaMensajesSitio(Pagina[MensajeSitio]):
    conteo: ConteoMensajesSitio


class CambioMensajeSitio(BaseModel):
    estado: EstadoSolicitud | None = None
    nota: str | None = Field(default=None, max_length=2000)


# ---- Contenido de las páginas ----------------------------------------------

class PaginaSitio(BaseModel):
    slug: str
    nombre: str
    ruta: str
    editada: bool = Field(description="False mientras la página use su texto base.")
    actualizada_en: FechaHora | None
    actualizada_por: str | None


class PaginaSitioDetalle(PaginaSitio):
    contenido: dict[str, Any] | None = Field(description="Lo guardado por la administración; null si usa el texto base.")


class CambioPaginaSitio(BaseModel):
    contenido: dict[str, Any] = Field(description="La página completa. La ruta no se cambia desde aquí.")

