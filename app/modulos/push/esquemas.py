from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.nucleo.zona_horaria import FechaHora


class ClavePublica(BaseModel):
    clave: str = Field(description="Clave VAPID pública para suscribir el navegador.")


class NuevaSuscripcion(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    keys: dict[str, str] = Field(description="Las claves `p256dh` y `auth` que entrega el navegador.")
    user_agent: str = Field(default="", max_length=512)
    nombre: str = Field(default="", max_length=120, description="Nombre del dispositivo, si el navegador lo sugiere.")

    @field_validator("keys")
    @classmethod
    def _con_claves(cls, valor: dict[str, str]) -> dict[str, str]:
        if not valor.get("p256dh") or not valor.get("auth"):
            raise ValueError("La suscripción del navegador no incluye sus claves de cifrado.")
        return valor


class BajaSuscripcion(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class Dispositivo(BaseModel):
    id: int
    nombre: str = Field(description="«iPhone · Safari», «Windows · Chrome»…")
    activado_en: FechaHora | None
    actualizado_en: FechaHora | None


class Dispositivos(BaseModel):
    items: list[Dispositivo]
    configurado: bool = Field(description="Falso si el servidor aún no tiene claves para enviar notificaciones.")


EtapaPush = Literal[
    "clave_publica", "registrar_service_worker", "esperar_service_worker", "buscar_suscripcion",
    "eliminar_suscripcion_anterior", "crear_suscripcion", "guardar_suscripcion",
]


class Diagnostico(BaseModel):
    etapa: EtapaPush
    nombre_error: str = Field(default="Error", max_length=120)
    mensaje_error: str = Field(default="", max_length=500)


class Presencia(BaseModel):
    sesion: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$", description="Identificador de la pestaña.")


class EstadoPresencia(BaseModel):
    activo: bool
    expira_en_segundos: int | None = None


class ConfirmacionEntrega(BaseModel):
    """Lo que envía el service worker al mostrar la notificación de un mensaje."""

    usuario_id: int = Field(gt=0)
    mensaje_id: int = Field(gt=0)
    firma: str = Field(min_length=64, max_length=64)

