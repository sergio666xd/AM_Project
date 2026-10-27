import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

def _normalizar_url(database_url: str) -> str:
    """Usa psycopg 3, el único driver de PostgreSQL declarado en las dependencias.

    Sin driver explícito SQLAlchemy elige psycopg2, que no se instala en Vercel.
    """
    for prefijo in ("postgresql://", "postgres://"):
        if database_url.startswith(prefijo):
            return "postgresql+psycopg://" + database_url[len(prefijo):]
    return database_url


DATABASE_URL = _normalizar_url(os.getenv(
    "DATABASE_URL",
    "postgresql://dev_user:dev_password@localhost:5432/saas_procesos"
))


def _crear_engine(database_url: str, *, serverless: bool | None = None):
    if serverless is None:
        serverless = os.getenv("VERCEL") == "1"
    if serverless:
        return create_engine(database_url, pool_pre_ping=True, poolclass=NullPool)
    return create_engine(database_url, pool_pre_ping=True)


engine = _crear_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()