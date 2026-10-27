"""Aplica las migraciones de Alembic al arrancar la API."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app import models

RAIZ = Path(__file__).resolve().parents[1]
RUTA_VERSIONES = RAIZ / "alembic_migrations" / "versions"
REVISION_BASE = "0001"
# Clave arbitraria del bloqueo de PostgreSQL que serializa las migraciones
# cuando varias instancias de Vercel arrancan a la vez.
CLAVE_BLOQUEO = 6_041_200_001


def _configuracion(conexion) -> Config:
    config = Config(str(RAIZ / "alembic.ini"))
    config.set_main_option("script_location", str(RAIZ / "alembic_migrations"))
    config.attributes["connection"] = conexion
    config.attributes["configure_logger"] = False
    return config


def aplicar_migraciones(engine: Engine) -> None:
    """Lleva la base a la última revisión.

    - Base vacía: crea todas las tablas desde los modelos y la marca en la última revisión.
    - Base anterior a Alembic: la marca en la revisión base y aplica las posteriores.
    - Base ya versionada: aplica solo las revisiones pendientes.
    """
    with engine.begin() as conexion:
        if conexion.dialect.name == "postgresql":
            conexion.execute(text("SELECT pg_advisory_xact_lock(:clave)"), {"clave": CLAVE_BLOQUEO})
        config = _configuracion(conexion)
        inspector = inspect(conexion)
        if not inspector.has_table("alembic_version"):
            if not inspector.has_table(models.Usuario.__tablename__):
                models.Base.metadata.create_all(conexion)
                command.stamp(config, "head")
                return
            command.stamp(config, REVISION_BASE)
        command.upgrade(config, "head")


def huella_versiones() -> bytes:
    """Contenido de las revisiones, para detectar cuándo hay migraciones nuevas."""
    return b"".join(path.read_bytes() for path in sorted(RUTA_VERSIONES.glob("*.py")))
