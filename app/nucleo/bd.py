"""Sesión de base de datos para la API v2.

Reutiliza el motor de `app.database` para que v1 y v2 compartan conexión
mientras conviven. Los servicios abren y confirman la transacción; los
repositorios solo consultan y agregan objetos.
"""

from app.database import Base, SessionLocal, engine, get_db

obtener_bd = get_db

__all__ = ["Base", "SessionLocal", "engine", "obtener_bd"]
