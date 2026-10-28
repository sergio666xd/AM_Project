"""Base de datos y cliente HTTP para las pruebas de la API v2.

Por defecto usan SQLite. Con `PRUEBAS_DATABASE_URL` apuntando a PostgreSQL
(como en CI) corren sobre una base real: el esquema se crea con las mismas
migraciones que producción y cada prueba empieza con las tablas vacías.
"""

import os
from itertools import count

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import models, security
from app.database import _normalizar_url, get_db
from app.main import _fastapi_app
from app.migraciones import aplicar_migraciones

PASSWORD = "Clave-de-prueba-1"
_secuencia = count(1)


@pytest.fixture(scope="session")
def motor(tmp_path_factory):
    url = os.getenv("PRUEBAS_DATABASE_URL")
    if url:
        engine = create_engine(_normalizar_url(url))
        with engine.begin() as conexion:
            conexion.execute(text("DROP SCHEMA public CASCADE"))
            conexion.execute(text("CREATE SCHEMA public"))
    else:
        engine = create_engine(f"sqlite:///{tmp_path_factory.mktemp('v2') / 'pruebas.db'}")
    aplicar_migraciones(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def sesion_bd(motor):
    tablas = [tabla.name for tabla in reversed(models.Base.metadata.sorted_tables)]
    with motor.begin() as conexion:
        if motor.dialect.name == "postgresql":
            conexion.execute(text(f"TRUNCATE {', '.join(tablas)} RESTART IDENTITY CASCADE"))
        else:
            for tabla in tablas:
                conexion.execute(text(f"DELETE FROM {tabla}"))
    Sesion = sessionmaker(bind=motor, autoflush=False, expire_on_commit=False)
    with Sesion() as db:
        yield db


@pytest.fixture
def cliente_http(motor, sesion_bd):
    Sesion = sessionmaker(bind=motor, autoflush=False)

    def bd_de_prueba():
        db = Sesion()
        try:
            yield db
        finally:
            db.close()

    _fastapi_app.dependency_overrides[get_db] = bd_de_prueba
    # Sin `with`: no corre el arranque (migraciones y datos iniciales de producción).
    yield TestClient(_fastapi_app, base_url="https://testserver")
    _fastapi_app.dependency_overrides.clear()


@pytest.fixture
def crear_usuario(sesion_bd):
    def crear(rol="ABOGADO", *, nombre=None, estado="ACTIVO", debe_cambiar_password=False):
        n = next(_secuencia)
        usuario = models.Usuario(
            email=f"usuario{n}@example.test",
            password_hash=security.hash_password(PASSWORD),
            nombre_completo=nombre or f"Usuario {n}",
            whatsapp_numero="3000000000",
            rol=models.RolUsuario(rol),
            estado=models.EstadoUsuario(estado),
            debe_cambiar_password=debe_cambiar_password,
        )
        sesion_bd.add(usuario)
        sesion_bd.commit()
        return usuario

    return crear


@pytest.fixture
def crear_proceso(sesion_bd):
    def crear(abogado, nombre="Proceso", *, clientes=(), colaboradores=(), radicados=(), archivado=False):
        proceso = models.Proceso(abogado_id=abogado.id, nombre=nombre)
        sesion_bd.add(proceso)
        sesion_bd.flush()
        for cliente in clientes:
            sesion_bd.add(models.ProcesoCliente(proceso_id=proceso.id, cliente_id=cliente.id))
        for colaborador, visible in colaboradores:
            sesion_bd.add(models.ProcesoColaborador(
                proceso_id=proceso.id, abogado_id=colaborador.id, visible_cliente=visible,
            ))
        for numero in radicados:
            radicado = models.Radicado(numero=numero, creado_por_id=abogado.id)
            sesion_bd.add(radicado)
            sesion_bd.flush()
            sesion_bd.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
        if archivado:
            from app.nucleo.zona_horaria import ahora_utc

            proceso.archivado_en = ahora_utc()
        sesion_bd.commit()
        return proceso

    return crear


@pytest.fixture
def iniciar(cliente_http):
    """Inicia sesión por la API v2; el cliente queda con la cookie."""

    def iniciar_sesion(usuario, recordarme=True):
        respuesta = cliente_http.post(
            "/api/v2/sesion",
            json={"email": usuario.email, "password": PASSWORD, "recordarme": recordarme},
            # El frontend lo manda siempre; hace falta cuando ya hay una cookie de sesión.
            headers={"X-AM-Solicitud": "1"},
        )
        assert respuesta.status_code == 200, respuesta.text
        return respuesta

    return iniciar_sesion


