"""Listados por cursor: `{"items": [...], "total": 120, "siguiente": "eyJpZCI6IDQwfQ"}`.

El cursor es opaco para el cliente: lo recibe en `siguiente` y lo devuelve en
`?cursor=` para pedir la página que sigue. Mientras no haya más, `siguiente`
es `null`.
"""

import base64
import binascii
import json
from dataclasses import dataclass
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

from app.nucleo.errores import DatosInvalidos

T = TypeVar("T")

LIMITE_POR_DEFECTO = 25
LIMITE_MAXIMO = 100


class Pagina(BaseModel, Generic[T]):
    """Base de los listados. Cada módulo la concreta con un nombre propio
    (por ejemplo `PaginaProcesos`) para que el esquema OpenAPI quede legible."""

    items: list[T]
    total: int = Field(description="Cantidad total con los filtros aplicados, sin contar el cursor.")
    siguiente: str | None = Field(description="Cursor de la página siguiente, o null si no hay más.")


@dataclass(frozen=True)
class ParametrosPagina:
    limite: int
    cursor: dict | None


def codificar_cursor(valores: dict) -> str:
    crudo = json.dumps(valores, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(crudo).decode().rstrip("=")


def decodificar_cursor(cursor: str) -> dict:
    try:
        relleno = "=" * (-len(cursor) % 4)
        valores = json.loads(base64.urlsafe_b64decode(cursor + relleno))
    except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
        raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
    if not isinstance(valores, dict):
        raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."})
    return valores


def parametros_pagina(
    limite: int = Query(LIMITE_POR_DEFECTO, ge=1, le=LIMITE_MAXIMO, description="Elementos por página."),
    cursor: str | None = Query(None, max_length=500, description="Valor de `siguiente` de la página anterior."),
) -> ParametrosPagina:
    return ParametrosPagina(limite=limite, cursor=decodificar_cursor(cursor) if cursor else None)
