from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.routers.publico import obtener_contacto_publico


def _db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_contacto_publico_usa_la_configuracion_del_panel():
    db = _db()
    try:
        db.add(models.ConfiguracionFirma(
            id=1, nombre="Alejandra Muñoz", correo_contacto="hola@example.com",
            whatsapp="3001234567", ciudad="Sabaneta, Antioquia", mostrar_contacto_publico=True,
        ))
        db.commit()
        datos = obtener_contacto_publico(db)
        assert datos["nombre"] == "Alejandra Muñoz"
        assert datos["correo_contacto"] == "hola@example.com"
        assert datos["whatsapp"] == "3001234567"
        assert datos["mostrar_contacto"] is True
    finally:
        db.close()


def test_contacto_publico_oculta_canales_si_el_panel_lo_desactiva():
    db = _db()
    try:
        db.add(models.ConfiguracionFirma(id=1, nombre="Alejandra Muñoz", mostrar_contacto_publico=False))
        db.commit()
        datos = obtener_contacto_publico(db)
        assert datos == {"nombre": "Alejandra Muñoz", "mostrar_contacto": False}
    finally:
        db.close()


def test_contacto_publico_crea_valores_base_si_no_hay_configuracion():
    db = _db()
    try:
        datos = obtener_contacto_publico(db)
        assert datos["nombre"]
        assert datos["whatsapp"] == "3508809878"
    finally:
        db.close()
