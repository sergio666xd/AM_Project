"""Plantillas de correo y WhatsApp según las skills correos-despacho-am y whatsapp-despacho-am."""

import importlib.util
import re
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import models
from app.email_service import _html_correo, texto_plano
from app.message_templates import preparar_valores, render_message
from app.migraciones import aplicar_migraciones
from app.whatsapp import PIE_WHATSAPP, formatear_mensaje_whatsapp

RAIZ = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "mensajes_legibles", RAIZ / "alembic_migrations" / "versions" / "2026_10_29_0011_mensajes_legibles.py"
)
MIGRACION = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(MIGRACION)
CLAVES = [plantilla["clave"] for plantilla in MIGRACION.PLANTILLAS]
# Tuteo que las plantillas anteriores usaban y que no debe volver.
TUTEO = re.compile(r"\b(tu|tus|te|ti|tienes|puedes|ingresa|recuerda|revisa|comparte)\b", re.IGNORECASE)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    with Session(engine) as sesion:
        yield sesion


def _ejemplo(db: Session, clave: str, canal: str) -> tuple[str, str]:
    plantilla = db.query(models.PlantillaMensaje).filter_by(clave=clave).one()
    return render_message(
        db, clave, plantilla.variables_ejemplo or {}, canal=canal,
        link_label="Ver", link_url=plantilla.enlace_ejemplo,
    )


def test_la_semilla_sql_coincide_con_la_migracion(db):
    for plantilla in MIGRACION.PLANTILLAS:
        fila = db.query(models.PlantillaMensaje).filter_by(clave=plantilla["clave"]).one()
        assert fila.asunto_email == plantilla["asunto_email"]
        assert fila.cuerpo_email.replace("\\n", "\n") == plantilla["cuerpo_email"]
        assert fila.cuerpo_whatsapp.replace("\\n", "\n") == plantilla["cuerpo_whatsapp"]
        assert fila.enlace_ejemplo == plantilla["enlace_ejemplo"]


@pytest.mark.parametrize("clave", CLAVES)
def test_cada_plantilla_se_lee_completa_y_en_usted(db, clave):
    asunto, correo = _ejemplo(db, clave, "EMAIL")
    _, whatsapp = _ejemplo(db, clave, "WHATSAPP")
    final = formatear_mensaje_whatsapp(whatsapp)
    for texto in (asunto, correo, final):
        assert "{{" not in texto
        assert not TUTEO.search(texto), texto
        assert not re.search(r"\b[A-Z]{3,}_[A-Z_]+\b", texto), texto
        assert "No asociad" not in texto and "Sin detalles" not in texto and "No indicada" not in texto
    assert len(asunto) <= 70
    assert correo.startswith("# ") or clave == "PRUEBA_INTEGRACION"
    assert final.count("👋") == 1
    assert final.count(PIE_WHATSAPP) == 1
    plantilla = db.query(models.PlantillaMensaje).filter_by(clave=clave).one()
    if plantilla.enlace_ejemplo:
        # Un solo enlace, con su propio texto de acción y en su propia línea.
        assert correo.count("Abrir enlace:") == 1 and "| Ver |" not in correo
        assert final.count("🔗") == 1


def test_la_contrasena_nunca_viaja_por_whatsapp(db):
    variables = {"nombre": "María Pérez", "actor": "Alejandra", "correo": "m@example.com",
                 "password": "Secreta123", "canal": "WHATSAPP"}
    _, correo = render_message(db, "CLIENTE_CREDENCIALES", variables, canal="EMAIL")
    assert "Secreta123" in correo
    db.query(models.PlantillaMensaje).filter_by(clave="CLIENTE_CREDENCIALES").update(
        {"cuerpo_whatsapp": "Hola {{nombre}}. Su clave es {{password}}."}
    )
    _, whatsapp = render_message(db, "CLIENTE_CREDENCIALES", variables, canal="WHATSAPP")
    assert "Secreta123" not in whatsapp


def test_los_valores_se_vuelven_legibles():
    valores = preparar_valores({
        "nombre": "MARÍA PÉREZ", "estado": "REQUIERE_CORRECCION", "prioridad": "ALTA",
        "fecha_limite": "20/11/2026 23:59", "inicio": "03/11/2026 09:00", "fecha": "2026-10-15T00:00:00",
        "radicado": "05001311001220250035600", "detalle": "Pasó a EN_CURSO.", "comentario": "Sin comentarios adicionales",
        "canal": "EMAIL",
    })
    assert valores["primer_nombre"] == "María"
    assert valores["estado"] == "necesita corrección"
    assert valores["prioridad"] == "alta"
    assert valores["fecha_limite"] == "viernes 20 de noviembre de 2026"
    assert valores["inicio"] == "martes 3 de noviembre de 2026, 9:00 a. m."
    assert valores["fecha"] == "jueves 15 de octubre de 2026"
    assert valores["radicado"] == "05001 31 10 012 2025 00356 00"
    assert valores["detalle"] == "Pasó a en curso."
    assert valores["comentario"] == ""
    assert valores["canal"] == "correo electrónico"


def test_las_lineas_sin_dato_desaparecen(db):
    _, cuerpo = render_message(db, "RECORDATORIO_TAREA", {
        "nombre": "Luz Gómez", "tarea": "Firmar", "proceso": "Tarea general", "radicado": "No asociado",
        "actuacion": "No asociada", "detalle": "Sin detalles adicionales", "fecha_limite": "Sin fecha límite",
        "prioridad": "MEDIA", "estado": "PENDIENTE",
    }, canal="EMAIL", link_label="Ver tarea", link_url="https://panel.example/tareas?tarea=1")
    assert "Proceso:" not in cuerpo and "Radicado:" not in cuerpo and "Fecha límite:" not in cuerpo
    assert "Hola, Luz:" in cuerpo and "Prioridad: media" in cuerpo
    assert "Abrir enlace: Ver la tarea | https://panel.example/tareas?tarea=1" in cuerpo


def test_una_plantilla_editada_sin_enlace_lo_recibe_al_final(db):
    db.query(models.PlantillaMensaje).filter_by(clave="CHAT_MENSAJE").update({"cuerpo_email": "Hola {{nombre}}"})
    _, cuerpo = render_message(db, "CHAT_MENSAJE", {"nombre": "Ana"}, canal="EMAIL",
                               link_label="Abrir chat", link_url="https://panel.example/chat/1/2")
    assert cuerpo.endswith("Abrir enlace: Abrir chat | https://panel.example/chat/1/2")


def test_el_correo_usa_la_hoja_del_expediente():
    cuerpo = (
        "# Necesitamos un documento\nHola, María:\nLa abogada necesita esto.\n"
        "> En sencillo: es un trámite normal.\n! Súbalo antes del viernes.\n"
        "Abrir enlace: Subir el documento | https://panel.example/procesos/1#documentos\n"
        "Proceso: Sucesión <b>\nRadicado: 05001 31 10 012 2025 00356 00\n"
        "Abrir enlace: Ver el proceso | https://panel.example/procesos/1\n? Escríbanos si tiene dudas."
    )
    html = _html_correo(cuerpo, {}, "https://panel.example/configuracion")
    assert "Georgia" in html and "#f6f2e8" in html and "border-top:2px solid #ccb56b" in html
    assert "Qué debe hacer" in html and "#f5eed6" in html
    assert "En palabras sencillas" in html and "#ece3cd" in html
    # Un solo botón; el segundo enlace va como texto.
    assert html.count("<v:roundrect") == 1 and "Si el botón no funciona" in html
    assert 'href="https://panel.example/procesos/1"' in html
    assert "Sucesión &lt;b&gt;" in html and "<b>" not in html
    assert "Roboto Mono" in html
    assert "Elegir qué avisos recibo" in html
    assert "Súbalo antes del viernes." in html.split("<body", 1)[1].split("</div>", 1)[0]


def test_el_correo_sin_accion_no_lleva_dorado_de_espera():
    html = _html_correo("# Novedad\nHola, María:\nNo tiene que hacer nada.", {})
    assert "Qué debe hacer" not in html


def test_el_texto_plano_dice_lo_mismo_sin_marcas():
    plano = texto_plano("# Título\nHola:\n! Haga esto.\nAbrir enlace: Ver | https://x.example/1\n? Ayuda.")
    assert plano == "Título\nHola:\nHaga esto.\nVer: https://x.example/1\nAyuda."


def test_whatsapp_formatea_un_solo_saludo_y_el_enlace():
    final = formatear_mensaje_whatsapp(
        "Hola María 👋\n\nProceso: Sucesión\nAbrir enlace: Ver la actuación | https://panel.example/1"
    )
    assert final.startswith("👋 Hola María\n")
    assert "📁 Proceso: Sucesión" in final
    assert "🔗 *Ver la actuación*\nhttps://panel.example/1" in final
    assert final.endswith(PIE_WHATSAPP)


def test_la_migracion_reescribe_plantillas_existentes(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'anterior.db'}")
    models.Base.metadata.create_all(engine)
    with engine.begin() as conexion:
        conexion.execute(text(
            "UPDATE plantillas_mensaje SET cuerpo_whatsapp = 'Hola {{nombre}} 👋 Contraseña: {{password}}' "
            "WHERE clave = 'CLIENTE_CREDENCIALES'"
        ))
        conexion.execute(text("DELETE FROM plantillas_mensaje WHERE clave = 'CHAT_MENSAJE'"))

    aplicar_migraciones(engine)

    with engine.connect() as conexion:
        whatsapp = conexion.execute(text(
            "SELECT cuerpo_whatsapp FROM plantillas_mensaje WHERE clave = 'CLIENTE_CREDENCIALES'"
        )).scalar()
        assert "{{password}}" not in whatsapp
        assert conexion.execute(text("SELECT COUNT(*) FROM plantillas_mensaje WHERE clave = 'CHAT_MENSAJE'")).scalar() == 1
