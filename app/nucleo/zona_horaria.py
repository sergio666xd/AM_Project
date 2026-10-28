"""Fechas de la API v2 en hora de Colombia.

La base guarda instantes en UTC, a veces sin zona (columnas TIMESTAMP). En la
API v2 toda fecha y hora sale en ISO 8601 con la zona de Bogotá
(`2026-10-27T08:20:00-05:00`), así el navegador no tiene que adivinar.
"""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer, WithJsonSchema

from app.timezone import COLOMBIA, utc_ahora


def a_colombia(valor: datetime) -> datetime:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(COLOMBIA)


def ahora_utc() -> datetime:
    """Instante actual con zona UTC, para columnas `DateTime(timezone=True)`."""
    return datetime.now(timezone.utc)


FechaHora = Annotated[
    datetime,
    PlainSerializer(lambda valor: a_colombia(valor).isoformat(), return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "format": "date-time"}),
]

__all__ = ["COLOMBIA", "FechaHora", "a_colombia", "ahora_utc", "utc_ahora"]
