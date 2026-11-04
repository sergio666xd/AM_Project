from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app import models
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


def test_password_reset_requests_are_limited_per_email():
    from app.modulos.identidad.repositorio import RepositorioUsuarios
    from app.modulos.identidad.servicio import ServicioSesion

    with _db() as db:
        servicio = ServicioSesion(db, RepositorioUsuarios(db))
        for _ in range(5):
            servicio.pedir_recuperacion("nadie@example.com", ip="203.0.113.7")
        clave = clave_intento("recuperar:email", "nadie@example.com")
        assert db.query(models.IntentoLimitado).filter_by(clave=clave).count() == 3
