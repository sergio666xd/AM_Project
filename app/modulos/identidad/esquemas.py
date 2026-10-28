from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.nucleo.zona_horaria import FechaHora

Rol = Literal["ADMIN", "ABOGADO_ADMIN", "ABOGADO", "CLIENTE"]


class IniciarSesion(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=1, max_length=200)
    recordarme: bool = Field(True, description="Mantiene la sesión abierta 15 días en este dispositivo.")

    @field_validator("email")
    @classmethod
    def normalizar_email(cls, valor: str) -> str:
        valor = valor.strip().lower()
        if "@" not in valor:
            raise ValueError("Escribe un correo válido.")
        return valor


class UsuarioSesion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str = Field(validation_alias="nombre_completo")
    email: str
    rol: Rol
    debe_cambiar_password: bool
    ultimo_acceso: FechaHora | None = None

    @field_validator("rol", mode="before")
    @classmethod
    def valor_del_rol(cls, valor):
        return getattr(valor, "value", valor)
