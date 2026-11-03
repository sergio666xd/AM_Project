from typing import Literal

from pydantic import BaseModel, Field

from app.nucleo.zona_horaria import FechaHora

AccionSegura = Literal["email", "whatsapp", "password"]
CanalCodigo = Literal["correo", "whatsapp"]


class TipoAviso(BaseModel):
    clave: str
    nombre: str
    descripcion: str
    correo: bool
    whatsapp: bool


class MiCuenta(BaseModel):
    id: int
    nombre: str
    email: str
    whatsapp: str
    rol: Literal["ADMIN", "ABOGADO_ADMIN", "ABOGADO", "CLIENTE"]
    genero: Literal["MASCULINO", "FEMENINO"] | None = None
    numero_documento: str | None = None
    domicilio: str | None = None
    tarjeta_profesional: str | None = None
    avisos: list[TipoAviso] = Field(description="Canales por tipo de aviso. Vacío para clientes, que los eligen en su perfil.")
    silenciar_correo_si_push: bool
    silenciar_whatsapp_si_push: bool


class CambioMiCuenta(BaseModel):
    """Datos que el equipo cambia sin código. Correo, WhatsApp y contraseña van con código."""

    nombre: str | None = Field(default=None, max_length=150)
    genero: Literal["MASCULINO", "FEMENINO", ""] | None = None
    numero_documento: str | None = Field(default=None, max_length=40)
    domicilio: str | None = Field(default=None, max_length=120)
    tarjeta_profesional: str | None = Field(default=None, max_length=40)


class CanalesAviso(BaseModel):
    correo: bool
    whatsapp: bool


class CambioMisAvisos(BaseModel):
    tipos: dict[str, CanalesAviso] | None = Field(default=None, description="Solo el equipo de la firma.")
    silenciar_correo_si_push: bool | None = None
    silenciar_whatsapp_si_push: bool | None = None


class NuevoCodigo(BaseModel):
    accion: AccionSegura
    canal: CanalCodigo


class CodigoSeguridad(BaseModel):
    id: str
    accion: AccionSegura
    canal: CanalCodigo
    destino: str = Field(description="Correo o número enmascarado al que llegó el código.")
    expira_en: FechaHora
    reenviar_desde: FechaHora
    verificado: bool


class Reenvio(BaseModel):
    canal: CanalCodigo


class CodigoIngresado(BaseModel):
    codigo: str = Field(pattern=r"^\d{6}$")


class CambioSeguro(BaseModel):
    valor: str | None = Field(default=None, max_length=320, description="El correo o el número nuevo.")
    contrasena_actual: str | None = Field(default=None, max_length=128)
    contrasena_nueva: str | None = Field(default=None, max_length=72)


class CambioAplicado(BaseModel):
    email: str
    whatsapp: str
