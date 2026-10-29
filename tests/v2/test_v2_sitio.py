import importlib.util
from datetime import timedelta
from pathlib import Path

import pytest

from app import models
from app.modulos.sitio import avisos
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}
MIGRACION = Path(__file__).resolve().parents[2] / "alembic_migrations" / "versions" / "2026_10_29_0014_solicitudes_contacto.py"


def _plantillas(sesion_bd):
    """Las plantillas de la migración 0014; las pruebas vacían la tabla antes de cada caso."""
    spec = importlib.util.spec_from_file_location("migracion_0014", MIGRACION)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    sesion_bd.add_all(models.PlantillaMensaje(**p, activo=True) for p in modulo.PLANTILLAS)
    sesion_bd.commit()


@pytest.fixture
def correos(monkeypatch):
    enviados = []

    def enviar(destinatario, asunto, cuerpo, *, reply_to=None):
        enviados.append({"a": destinatario, "asunto": asunto, "cuerpo": cuerpo, "reply_to": reply_to})
        return True

    monkeypatch.setattr(avisos, "enviar_correo", enviar)
    return enviados


def _mensaje(**cambios):
    datos = {
        "nombre": "  Carlos   Andrés Mejía ", "telefono": "315 222 3344", "correo": "Carlos.Mejia@correo.co",
        "area": "familia", "mensaje": "Mi papá falleció en agosto.\n# Queremos hacer la sucesión de la casa.",
        "autorizacion": True,
    }
    return {**datos, **cambios}


def test_contacto_y_paginas_publicas(cliente_http, sesion_bd):
    base = cliente_http.get("/api/v2/sitio/contacto").json()
    assert base["mostrar_contacto"] and base["whatsapp"] == "3508809878" and base["ciudad"] == "Sabaneta, Antioquia"

    sesion_bd.add(models.ConfiguracionFirma(id=1, nombre="Firma de prueba", mostrar_contacto_publico=False, whatsapp="3001112233"))
    sesion_bd.commit()
    oculto = cliente_http.get("/api/v2/sitio/contacto").json()
    assert oculto["nombre"] == "Firma de prueba" and not oculto["mostrar_contacto"] and oculto["whatsapp"] is None

    assert cliente_http.get("/api/v2/sitio/paginas/no-existe").status_code == 404
    assert cliente_http.get("/api/v2/sitio/paginas/inicio").json() == {"slug": "inicio", "contenido": None, "actualizada_en": None}
    sesion_bd.add(models.ContenidoPagina(slug="inicio", contenido={"heroTitle": "Hola"}))
    sesion_bd.commit()
    assert cliente_http.get("/api/v2/sitio/paginas/inicio").json()["contenido"] == {"heroTitle": "Hola"}
    sesion_bd.add(models.ContenidoPagina(slug="contacto", contenido='{"title": "Consulte antes de firmar."}'))
    sesion_bd.commit()
    assert cliente_http.get("/api/v2/sitio/paginas/contacto").json()["contenido"] == {"title": "Consulte antes de firmar."}


def test_validacion_y_campo_trampa(cliente_http, sesion_bd, correos):
    r = cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje(telefono=None, correo="", mensaje="Hola", autorizacion=False))
    assert r.status_code == 422
    assert set(r.json()["campos"]) == {"telefono", "mensaje", "autorizacion"}
    assert cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje(telefono="12")).json()["campos"] == {
        "telefono": "Revise el número: debe tener entre 7 y 15 dígitos."}

    # Un robot llena el campo trampa: se le responde igual, pero no se guarda ni se avisa.
    r = cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje(website="https://spam.example"))
    assert r.status_code == 201
    assert sesion_bd.query(models.SolicitudContacto).count() == 0 and correos == []


def test_mensaje_guardado_y_correos(cliente_http, sesion_bd, correos):
    _plantillas(sesion_bd)
    sesion_bd.add(models.ConfiguracionFirma(id=1, correo_contacto="contacto@firma.test", whatsapp="3508809878"))
    sesion_bd.commit()

    r = cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje())
    assert r.status_code == 201 and "Recibimos su mensaje" in r.json()["mensaje"]
    solicitud = sesion_bd.query(models.SolicitudContacto).one()
    sesion_bd.refresh(solicitud)
    assert solicitud.nombre == "Carlos Andrés Mejía" and solicitud.correo == "carlos.mejia@correo.co"
    assert solicitud.estado == "NUEVA" and solicitud.aviso_firma == "ENVIADO"

    firma, acuse = correos
    assert firma["a"] == "contacto@firma.test" and firma["reply_to"] == "carlos.mejia@correo.co"
    assert firma["asunto"] == "Carlos Andrés Mejía escribió desde el sitio web"
    # El texto de la persona va en un solo párrafo: su "#" no se vuelve un título del correo.
    assert "«Mi papá falleció en agosto. # Queremos hacer la sucesión de la casa.»" in firma["cuerpo"]
    assert "Abrir enlace: Escribirle por WhatsApp | https://wa.me/573152223344?text=" in firma["cuerpo"]
    assert f"/sitio/mensajes?mensaje={solicitud.id}" in firma["cuerpo"]
    assert "Escríbale por WhatsApp al 315 222 3344 o responda este correo" in firma["cuerpo"]

    assert acuse["a"] == "carlos.mejia@correo.co" and acuse["reply_to"] == "contacto@firma.test"
    assert acuse["asunto"] == "Recibimos su mensaje"
    assert "Hola, Carlos:" in acuse["cuerpo"] and "por WhatsApp al 315 222 3344 o por correo" in acuse["cuerpo"]
    assert "escríbanos por WhatsApp al 350 880 9878" in acuse["cuerpo"]


def test_sin_correo_de_la_firma_queda_el_fallo_y_la_alerta(cliente_http, sesion_bd, correos, crear_usuario, iniciar):
    _plantillas(sesion_bd)
    sesion_bd.add(models.ConfiguracionFirma(id=1, correo_contacto=""))
    sesion_bd.commit()
    r = cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje(correo=None))
    assert r.status_code == 201
    solicitud = sesion_bd.query(models.SolicitudContacto).one()
    sesion_bd.refresh(solicitud)
    assert solicitud.aviso_firma == "FALLIDO" and "correo de contacto" in solicitud.aviso_error
    assert correos == []  # sin correo de la persona tampoco hay confirmación

    iniciar(crear_usuario("ADMIN"))
    alertas = cliente_http.get("/api/v2/admin/resumen").json()["alertas"]
    alerta = next(a for a in alertas if a["tipo"] == "mensaje_sitio")
    assert alerta["titulo"] == "1 mensaje del sitio web sin atender" and alerta["enlace"].endswith("/sitio/mensajes")


def test_limite_de_intentos(cliente_http, correos):
    for i in range(3):
        assert cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje()).status_code == 201, i
    # Tres por correo por hora; con otro correo sigue hasta cinco por IP.
    assert cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje()).status_code == 429
    for i in range(2):
        assert cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje(correo=f"otra{i}@correo.co")).status_code == 201
    r = cliente_http.post("/api/v2/sitio/mensajes", json=_mensaje(correo="nueva@correo.co"))
    assert r.status_code == 429 and "WhatsApp" in r.json()["mensaje"]


def test_bandeja_de_administracion(cliente_http, sesion_bd, crear_usuario, iniciar):
    ahora = utc_ahora()
    for i, estado in enumerate(["NUEVA", "NUEVA", "ATENDIDA", "DESCARTADA"]):
        sesion_bd.add(models.SolicitudContacto(
            nombre=f"Persona {i}", telefono="3001234567" if i else None, correo=f"p{i}@correo.co", area="empresas",
            mensaje="Necesito revisar un contrato.", autorizo_datos_en=ahora, estado=estado, aviso_firma="ENVIADO",
            created_at=ahora - timedelta(hours=i), updated_at=ahora,
        ))
    sesion_bd.commit()
    iniciar(crear_usuario("ABOGADO_ADMIN"))
    assert cliente_http.get("/api/v2/admin/sitio/mensajes").status_code == 403

    admin = crear_usuario("ADMIN", nombre="Administración")
    iniciar(admin)
    pagina = cliente_http.get("/api/v2/admin/sitio/mensajes?limite=2").json()
    assert pagina["total"] == 4 and pagina["conteo"] == {"nueva": 2, "atendida": 1, "descartada": 1}
    assert [m["nombre"] for m in pagina["items"]] == ["Persona 0", "Persona 1"] and pagina["siguiente"]
    assert pagina["items"][0]["whatsapp_url"] is None and pagina["items"][1]["whatsapp_url"].startswith("https://wa.me/573001234567")
    resto = cliente_http.get(f"/api/v2/admin/sitio/mensajes?limite=2&cursor={pagina['siguiente']}").json()
    assert [m["nombre"] for m in resto["items"]] == ["Persona 2", "Persona 3"] and resto["siguiente"] is None
    nuevas = cliente_http.get("/api/v2/admin/sitio/mensajes?estado=nueva").json()
    assert nuevas["total"] == 2 and {m["estado"] for m in nuevas["items"]} == {"nueva"}

    mensaje_id = pagina["items"][0]["id"]
    r = cliente_http.put(f"/api/v2/admin/sitio/mensajes/{mensaje_id}", json={"estado": "atendida", "nota": " Le escribí por correo. "}, headers=H)
    assert r.status_code == 200
    atendido = r.json()
    assert atendido["estado"] == "atendida" and atendido["atendida_por"] == "Administración" and atendido["nota"] == "Le escribí por correo."
    de_nuevo = cliente_http.put(f"/api/v2/admin/sitio/mensajes/{mensaje_id}", json={"estado": "nueva"}, headers=H).json()
    assert de_nuevo["atendida_en"] is None and de_nuevo["atendida_por"] is None and de_nuevo["nota"] == "Le escribí por correo."
    acciones = [e.accion for e in sesion_bd.query(models.EventoAuditoria).order_by(models.EventoAuditoria.id)]
    assert acciones[-2:] == ["sitio.mensaje.atendida", "sitio.mensaje.nueva"]
    actividad = cliente_http.get("/api/v2/admin/actividad?area=mensajes").json()["items"]
    assert actividad[0]["frase"] == "volvió a marcar como nuevo un mensaje del sitio web"
    assert actividad[0]["enlace"] == f"/gestion-procesos/admin/sitio/mensajes?mensaje={mensaje_id}"

    assert cliente_http.get("/api/v2/admin/sitio/mensajes/999").status_code == 404


def test_contenido_de_las_paginas(cliente_http, sesion_bd, crear_usuario, iniciar):
    iniciar(crear_usuario("ABOGADO_ADMIN"))
    assert cliente_http.get("/api/v2/admin/sitio/paginas").status_code == 403

    iniciar(crear_usuario("ADMIN", nombre="Administración"))
    paginas = cliente_http.get("/api/v2/admin/sitio/paginas").json()
    assert {p["slug"] for p in paginas} >= {"inicio", "contacto", "politica-de-privacidad"}
    assert not any(p["editada"] for p in paginas)
    assert cliente_http.get("/api/v2/admin/sitio/paginas/no-existe").status_code == 404
    assert cliente_http.get("/api/v2/admin/sitio/paginas/inicio").json()["contenido"] is None

    r = cliente_http.put("/api/v2/admin/sitio/paginas/inicio", json={"contenido": {"heroTitle": "Hola", "route": "/otra"}}, headers=H)
    assert r.status_code == 200
    guardada = r.json()
    # La dirección no se puede cambiar desde el contenido.
    assert guardada["editada"] and guardada["actualizada_por"] == "Administración"
    assert guardada["contenido"] == {"heroTitle": "Hola", "route": "/"}
    assert cliente_http.get("/api/v2/sitio/paginas/inicio").json()["contenido"]["heroTitle"] == "Hola"

    largo = cliente_http.put("/api/v2/admin/sitio/paginas/inicio", json={"contenido": {"heroTitle": "x" * 260_000}}, headers=H)
    assert largo.status_code == 422 and "contenido" in largo.json()["campos"]

    actividad = cliente_http.get("/api/v2/admin/actividad").json()["items"]
    assert actividad[0]["frase"] == "editó una página del sitio web"
    assert actividad[0]["enlace"] == "/gestion-procesos/admin/sitio/contenido?pagina=inicio"

    base = cliente_http.delete("/api/v2/admin/sitio/paginas/inicio", headers=H).json()
    assert base["contenido"] is None and not base["editada"]
    assert cliente_http.get("/api/v2/sitio/paginas/inicio").json()["contenido"] is None
    acciones = [e.accion for e in sesion_bd.query(models.EventoAuditoria).order_by(models.EventoAuditoria.id)]
    assert acciones[-2:] == ["sitio.pagina.guardada", "sitio.pagina.restaurada"]
