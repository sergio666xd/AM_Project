from datetime import timedelta

import pytest
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app import models, schemas
from app.rate_limit import (
    clave_intento,
    ip_cliente,
    limite_excedido,
    registrar_intentos,
)
from app.timezone import utc_ahora


def _request(ip="203.0.113.7", headers=None):
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (ip, 1234),
    })


def _db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    return Session(engine)


def test_limit_counts_only_attempts_inside_the_window():
    with _db() as db:
        clave = clave_intento("prueba", "Persona@Example.test")
        assert clave == clave_intento("prueba", "persona@example.test")
        db.add(models.IntentoLimitado(clave=clave, creado_en=utc_ahora() - timedelta(hours=2)))
        db.commit()

        registrar_intentos(db, [clave, clave])
        assert not limite_excedido(db, [(clave, 3)], timedelta(hours=1))
        registrar_intentos(db, [clave])
        assert limite_excedido(db, [(clave, 3)], timedelta(hours=1))


def test_old_attempts_are_purged_when_registering():
    with _db() as db:
        db.add(models.IntentoLimitado(clave="vieja", creado_en=utc_ahora() - timedelta(days=2)))
        db.commit()
        registrar_intentos(db, ["nueva"])
        assert [row.clave for row in db.query(models.IntentoLimitado).all()] == ["nueva"]


def test_client_ip_uses_vercel_forwarded_header_only_on_vercel(monkeypatch):
    request = _request(headers={"x-forwarded-for": "198.51.100.4, 10.0.0.1"})
    monkeypatch.delenv("VERCEL", raising=False)
    assert ip_cliente(request) == "203.0.113.7"
    monkeypatch.setenv("VERCEL", "1")
    assert ip_cliente(request) == "198.51.100.4"


def test_login_blocks_after_repeated_failures():
    from app import security
    from app.routers import auth as main

    with _db() as db:
        db.add(models.Usuario(
            email="login@example.test",
            password_hash=security.hash_password("correcta-123"),
            nombre_completo="Login",
            whatsapp_numero="",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        ))
        db.commit()

        def attempt(password):
            form = OAuth2PasswordRequestForm(username="login@example.test", password=password)
            return main.login(_request(), form_data=form, remember_me=False, db=db)

        for _ in range(10):
            with pytest.raises(HTTPException) as failed:
                attempt("incorrecta")
            assert failed.value.status_code == 400

        with pytest.raises(HTTPException) as blocked:
            attempt("correcta-123")
        assert blocked.value.status_code == 429


def test_password_reset_requests_are_limited_per_email():
    from fastapi import BackgroundTasks

    from app.routers import auth as main

    with _db() as db:
        datos = schemas.SolicitudRecuperacionPassword(email="nadie@example.com")
        for _ in range(5):
            main.solicitar_recuperacion_password(datos, _request(), BackgroundTasks(), db=db)
        clave = clave_intento("recuperar:email", "nadie@example.com")
        assert db.query(models.IntentoLimitado).filter_by(clave=clave).count() == 3
