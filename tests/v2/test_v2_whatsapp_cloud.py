"""WhatsApp Cloud API: plantillas de Meta, envío y webhook."""

import hashlib
import hmac
import json
import re
from pathlib import Path

import pytest

from app import models, whatsapp
from app.message_templates import datos_whatsapp
from app.whatsapp_plantillas import (
    CATALOGO,
    PLANTILLAS_META,
    componentes,
    definicion_meta,
    limpiar_parametro,
    parametros,
    sufijo_boton,
)

RAIZ = Path(__file__).resolve().parents[2]
SECRETO = "secreto-de-la-app"
VERIFICACION = "verificacion-de-prueba"


@pytest.fixture
def cloud(monkeypatch):
    monkeypatch.setenv("WHATSAPP_TOKEN", "token-de-prueba")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "634864400531550")
    monkeypatch.setenv("WHATSAPP_WABA_ID", "634496380588828")
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", VERIFICACION)
    monkeypatch.setenv("WHATSAPP_APP_SECRET", SECRETO)
    monkeypatch.delenv("WHATSAPP_GRAPH_VERSION", raising=False)
    monkeypatch.delenv("WHATSAPP_IDIOMA_PLANTILLAS", raising=False)


class Respuesta:
    def __init__(self, status_code=200, cuerpo=None):
        self.status_code = status_code
        self.ok = status_code < 400
        self._cuerpo = cuerpo if cuerpo is not None else {}

    def json(self):
        return self._cuerpo


# ---- Catálogo ---------------------------------------------------------------------


def _claves_enviadas_por_whatsapp() -> set[str]:
    """Avisos que la aplicación puede mandar por WhatsApp: todos necesitan plantilla de Meta."""
    claves = set()
    for archivo in (RAIZ / "app").rglob("*.py"):
        texto = archivo.read_text(encoding="utf-8")
        claves |= set(re.findall(r'plantilla_clave="([A-Z_]+)"', texto))
    # Envíos directos y la plantilla que reglas.py elige en una variable.
    return claves | {"CODIGO_SEGURIDAD", "CAMBIO_SEGURIDAD_CONFIRMADO", "PRUEBA_INTEGRACION",
                     "COMUNICACION_ABOGADO_CLIENTE", "COMUNICACION_CLIENTE_ABOGADO"}


def test_every_whatsapp_notice_has_a_meta_template():
    faltan = _claves_enviadas_por_whatsapp() - set(PLANTILLAS_META)
    assert not faltan


@pytest.mark.parametrize("plantilla", CATALOGO, ids=lambda p: p.nombre)
def test_templates_follow_meta_rules(plantilla):
    assert re.fullmatch(r"[a-z0-9_]{1,512}", plantilla.nombre)
    numeros = [int(n) for n in re.findall(r"{{(\d+)}}", plantilla.cuerpo)]
    assert numeros == list(range(1, len(plantilla.variables) + 1))
    assert len(plantilla.cuerpo) <= 1024
    if plantilla.categoria == "UTILITY":
        assert not plantilla.cuerpo.startswith("{{") and not plantilla.cuerpo.rstrip().endswith("}}")
        assert not re.search(r"}}\s*{{", plantilla.cuerpo)
    if plantilla.pie:
        assert len(plantilla.pie) <= 60
    if plantilla.boton:
        assert len(plantilla.boton) <= 25
        assert "http" not in plantilla.cuerpo
    definicion = definicion_meta(plantilla, "es")
    assert definicion["name"] == plantilla.nombre and definicion["language"] == "es"


def test_template_names_are_unique():
    nombres = [plantilla.nombre for plantilla in CATALOGO]
    assert len(nombres) == len(set(nombres))


def test_parameters_are_single_line_short_and_never_empty():
    assert limpiar_parametro("- Cédula\n\t- Registro   civil\n\nAbrir enlace: Ver | https://x.co/1") == "Cédula; Registro civil"
    assert len(limpiar_parametro("x" * 500, 100)) == 100
    plantilla = PLANTILLAS_META["SOLICITUD_DOCUMENTO"]
    valores = parametros(plantilla, {"primer_nombre": "María", "proceso": "", "documentos": "Cédula\nRUT"})
    assert valores[0] == "María" and valores[1] == "-" and valores[2] == "Cédula; RUT"
    assert valores[3] == "sin fecha límite" and len(valores) == 4
    assert all(texto and "\n" not in texto for texto in valores)


def test_notice_data_keeps_readable_values_and_never_the_password():
    datos = datos_whatsapp("CLIENTE_CREDENCIALES", {"nombre": "MARÍA López", "password": "Secreta-1", "estado": "EN_CURSO"},
                           "https://panel.example.test/")
    assert datos["clave"] == "CLIENTE_CREDENCIALES"
    assert "password" not in datos["valores"]
    assert datos["valores"]["primer_nombre"] == "María"
    assert datos["valores"]["estado"] == "en curso"
    assert datos["valores"]["enlace"] == "https://panel.example.test/"


def test_button_suffix_is_the_portal_route_without_anchor():
    assert sufijo_boton("https://panel.alejandramunozabogada.com/procesos/12#documentos") == "procesos/12"
    assert sufijo_boton("https://panel.alejandramunozabogada.com/chat/3/9?x=1") == "chat/3/9?x=1"
    assert sufijo_boton("https://admin.alejandramunozabogada.com/operacion") == "operacion"
    assert sufijo_boton("") == sufijo_boton("https://panel.alejandramunozabogada.com/") == "?origen=whatsapp"
    definicion = definicion_meta(PLANTILLAS_META["RECORDATORIO_TAREA"], "es")
    boton = definicion["components"][-1]["buttons"][0]
    assert boton["type"] == "URL" and boton["url"] == "https://panel.alejandramunozabogada.com/{{1}}"


def test_authentication_template_also_fills_the_copy_code_button():
    partes = componentes(PLANTILLAS_META["CODIGO_SEGURIDAD"], {"codigo": "483920"})
    assert partes[0]["parameters"] == [{"type": "text", "text": "483920"}]
    assert partes[1]["sub_type"] == "url" and partes[1]["parameters"][0]["text"] == "483920"


# ---- Envío --------------------------------------------------------------------------


def test_cloud_api_sends_the_approved_template_and_returns_the_message_id(cloud, monkeypatch):
    llamadas = []
    monkeypatch.setattr(
        whatsapp.requests, "post",
        lambda url, **kwargs: llamadas.append((url, kwargs)) or Respuesta(200, {"messages": [{"id": "wamid.ABC"}]}),
    )
    datos = datos_whatsapp("RECORDATORIO_TAREA", {"nombre": "Ana Pérez", "tarea": "Firmar el poder",
                                                  "fecha_limite": "20/11/2026 17:00", "proceso": "Sucesión"},
                           "https://panel.alejandramunozabogada.com/tareas/7")

    assert whatsapp.enviar_mensaje_whatsapp("300 123 4567", "texto", plantilla=datos) == "wamid.ABC"
    url, kwargs = llamadas[0]
    assert url == "https://graph.facebook.com/v23.0/634864400531550/messages"
    assert kwargs["headers"]["Authorization"] == "Bearer token-de-prueba"
    cuerpo = kwargs["json"]
    assert cuerpo["to"] == "573001234567" and cuerpo["type"] == "template"
    assert cuerpo["template"]["name"] == "am_recordatorio_tarea"
    assert cuerpo["template"]["language"] == {"code": "es"}
    textos = [p["text"] for p in cuerpo["template"]["components"][0]["parameters"]]
    assert textos == ["Ana", "Firmar el poder", "viernes 20 de noviembre de 2026, 5:00 p. m.", "Sucesión"]
    boton = cuerpo["template"]["components"][1]
    assert boton["sub_type"] == "url" and boton["parameters"] == [{"type": "text", "text": "tareas/7"}]


def test_cloud_api_errors_are_explained_without_the_token(cloud, monkeypatch):
    monkeypatch.setattr(
        whatsapp.requests, "post",
        lambda url, **kwargs: Respuesta(404, {"error": {"code": 132001, "message": "Template name does not exist"}}),
    )
    with pytest.raises(whatsapp.ErrorWhatsapp) as error:
        whatsapp.enviar_mensaje_whatsapp("3001234567", "x", raise_on_error=True,
                                         plantilla=datos_whatsapp("PRUEBA_INTEGRACION", {"nombre": "Ana"}))
    assert "132001" in str(error.value) and "no existe" in str(error.value)
    assert "token-de-prueba" not in str(error.value)
    assert str(error.value).startswith("WhatsApp API respondió")


def test_cloud_api_never_sends_free_text_without_a_template(cloud, monkeypatch):
    monkeypatch.setattr(whatsapp.requests, "post", lambda *a, **k: pytest.fail("No debe llamar a Meta"))
    assert whatsapp.enviar_mensaje_whatsapp("3001234567", "texto libre") is False
    with pytest.raises(whatsapp.ErrorWhatsapp):
        whatsapp.enviar_mensaje_whatsapp("3001234567", "x", raise_on_error=True, plantilla={"clave": "NO_EXISTE"})


def test_without_cloud_variables_the_previous_provider_is_used(monkeypatch):
    for variable in ("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"):
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setattr(whatsapp, "get_integration_settings",
                        lambda: {"whatsapp_api_url": "https://proveedor.example.test/send", "whatsapp_token": "t"})
    llamadas = []
    monkeypatch.setattr(whatsapp.requests, "post", lambda url, **kwargs: llamadas.append(url) or Respuesta(200))
    assert whatsapp.enviar_mensaje_whatsapp("3001234567", "Hola", plantilla={"clave": "PRUEBA_INTEGRACION"}) is True
    assert llamadas == ["https://proveedor.example.test/send"]


# ---- Webhook ------------------------------------------------------------------------


def _firmar(cuerpo: bytes, secreto: str = SECRETO) -> dict:
    return {"X-Hub-Signature-256": "sha256=" + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest(),
            "Content-Type": "application/json"}


def _evento(valor: dict) -> bytes:
    valor = {"messaging_product": "whatsapp", "metadata": {"phone_number_id": "634864400531550"}, **valor}
    return json.dumps({"object": "whatsapp_business_account",
                       "entry": [{"id": "634496380588828", "changes": [{"field": "messages", "value": valor}]}]}).encode()


def test_webhook_verification_returns_the_challenge_only_with_the_right_token(cloud, cliente_http):
    ok = cliente_http.get("/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": VERIFICACION,
                                                           "hub.challenge": "1158201444"})
    assert ok.status_code == 200 and ok.text == "1158201444"
    malo = cliente_http.get("/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "otro",
                                                             "hub.challenge": "1"})
    assert malo.status_code == 403


def test_webhook_rejects_unsigned_or_unconfigured_posts(cloud, cliente_http, monkeypatch):
    cuerpo = _evento({"statuses": []})
    assert cliente_http.post("/api/whatsapp/webhook", content=cuerpo, headers=_firmar(cuerpo, "otro")).status_code == 401
    monkeypatch.delenv("WHATSAPP_APP_SECRET")
    assert cliente_http.post("/api/whatsapp/webhook", content=cuerpo, headers=_firmar(cuerpo)).status_code == 503


def test_webhook_tracks_delivery_status_and_failures(cloud, cliente_http, sesion_bd, crear_usuario):
    usuario = crear_usuario("CLIENTE")
    entrega = models.EntregaNotificacion(
        clave_idempotencia="prueba-wa", usuario_id=usuario.id, tipo="TAREAS", canal="WHATSAPP",
        asunto="a", cuerpo="b", estado="ENVIADA", intentos=1,
        proveedor_mensaje_id="wamid.1", estado_proveedor="accepted",
    )
    sesion_bd.add(entrega)
    sesion_bd.commit()

    def enviar(estado, momento, **extra):
        cuerpo = _evento({"statuses": [{"id": "wamid.1", "status": estado, "timestamp": momento,
                                        "recipient_id": "573000000000", **extra}]})
        assert cliente_http.post("/api/whatsapp/webhook", content=cuerpo, headers=_firmar(cuerpo)).status_code == 200
        sesion_bd.expire_all()
        return sesion_bd.get(models.EntregaNotificacion, entrega.id)

    assert enviar("delivered", "1762880000").estado_proveedor == "delivered"
    # Un "sent" que llega tarde no retrocede el estado.
    assert enviar("sent", "1762879990").estado_proveedor == "delivered"
    fallida = enviar("failed", "1762880100", errors=[{"code": 131026, "title": "Message undeliverable"}])
    assert (fallida.estado_proveedor, fallida.estado) == ("failed", "ERROR")
    assert "131026" in fallida.error


def test_webhook_stores_incoming_messages_once_and_links_the_user(cloud, cliente_http, sesion_bd, crear_usuario):
    usuario = crear_usuario("CLIENTE")
    cuerpo = _evento({
        "contacts": [{"profile": {"name": "Ana"}, "wa_id": "573000000000"}],
        "messages": [{"from": "573000000000", "id": "wamid.IN1", "timestamp": "1762880000", "type": "text",
                      "text": {"body": "Hola, ya envié la cédula"}}],
    })
    for _ in range(2):
        assert cliente_http.post("/api/whatsapp/webhook", content=cuerpo, headers=_firmar(cuerpo)).status_code == 200
    recibidos = sesion_bd.query(models.MensajeWhatsappRecibido).all()
    assert len(recibidos) == 1
    assert (recibidos[0].usuario_id, recibidos[0].nombre_perfil, recibidos[0].texto) == (
        usuario.id, "Ana", "Hola, ya envié la cédula")


def test_webhook_ignores_events_for_another_phone_number(cloud, cliente_http, sesion_bd):
    cuerpo = json.dumps({"entry": [{"changes": [{"field": "messages", "value": {
        "metadata": {"phone_number_id": "999"},
        "messages": [{"from": "573000000000", "id": "wamid.X", "timestamp": "1", "type": "text", "text": {"body": "x"}}],
    }}]}]}).encode()
    assert cliente_http.post("/api/whatsapp/webhook", content=cuerpo, headers=_firmar(cuerpo)).status_code == 200
    assert sesion_bd.query(models.MensajeWhatsappRecibido).count() == 0
