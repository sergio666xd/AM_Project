"""Ajustes de la API leídos del entorno (prefijo `AM_`)."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Ajustes(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AM_", extra="ignore")

    cookie_sesion: str = "am_sesion"
    # Sin valor explícito la cookie solo exige HTTPS en Vercel, para que el
    # desarrollo local sobre http://localhost siga funcionando.
    cookie_segura: bool | None = None

    @property
    def cookie_es_segura(self) -> bool:
        if self.cookie_segura is not None:
            return self.cookie_segura
        return os.getenv("VERCEL") == "1"


@lru_cache
def ajustes() -> Ajustes:
    return Ajustes()
