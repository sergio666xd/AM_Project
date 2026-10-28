"""Configuración compartida de las pruebas."""

import os
from pathlib import Path

# app.security exige una clave JWT al importarse; en CI no existe el .env local.
os.environ.setdefault("JWT_SECRET_KEY", "clave-solo-para-pruebas")


from sqlalchemy import event

from app import models

RUTA_PLANTILLAS = Path(__file__).resolve().parents[1] / "migrations" / "2026_10_10_mensajes_configurables.sql"


def _insert_plantillas_por_defecto() -> str:
    """Devuelve el INSERT de plantillas de la migración, sin la cláusula exclusiva de PostgreSQL."""
    _, datos = RUTA_PLANTILLAS.read_text(encoding="utf-8").split("\n\n", maxsplit=1)
    insert = datos.split(";\n", maxsplit=1)[0].split("\nON CONFLICT", maxsplit=1)[0]
    encabezado, valores = insert.split(" VALUES", maxsplit=1)
    columnas = encabezado[encabezado.index("(") + 1:encabezado.rindex(")")]
    seleccion = ", ".join(f"column{i}" for i in range(1, columnas.count(",") + 2))
    # SQLite no aplica los valores por defecto del ORM; se fijan aquí activo y updated_at.
    return (
        f"INSERT INTO plantillas_mensaje ({columnas}, activo, updated_at) "
        f"SELECT {seleccion}, 1, CURRENT_TIMESTAMP FROM (VALUES {valores})"
    )


@event.listens_for(models.PlantillaMensaje.__table__, "after_create")
def _sembrar_plantillas(target, connection, **kw):
    if connection.dialect.name != "sqlite":
        # Las pruebas sobre PostgreSQL (tests/v2) no usan las plantillas.
        return
    # En producción las plantillas se siembran con la migración SQL al arrancar;
    # las bases SQLite de las pruebas reciben el mismo contenido al crear la tabla.
    connection.exec_driver_sql(_insert_plantillas_por_defecto())
