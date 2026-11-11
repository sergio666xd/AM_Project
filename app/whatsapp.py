"""Envío de avisos por WhatsApp.

La vía principal es la WhatsApp Cloud API de Meta (graph.facebook.com), que
envía plantillas aprobadas (ver `app/whatsapp_plantillas.py`). Sus credenciales
solo se leen de variables de entorno. Mientras no estén, se usa el proveedor
anterior (URL + token guardados en Admin > Operación > Integraciones).
"""

import logging
import os
import re

import requests

from app.integration_settings import get_integration_settings
from app.whatsapp_plantillas import componentes, plantilla_para

logger = logging.getLogger(__name__)


_ETIQUETAS = {
    "proceso": "📁",
    "radicado": "⚖️",
    "actuación": "📝",
    "actuacion": "📝",
    "tarea": "✅",
    "documento": "📄",
    "documentos": "📄",
    "detalle": "📋",
    "fecha": "📅",
    "fecha límite": "⏰",
    "entregar antes del": "⏰",
    "vencimiento": "⏰",
    "responsable": "👤",
    "estado": "📌",
    "prioridad": "🚦",
    "asunto": "💬",
    "solicitud": "📥",
    "actividad": "🗓️",
    "evento": "🗓️",
    "cuándo": "🗓️",
    "permiso": "🔐",
    "anotación": "🗒️",
    "anotacion": "🗒️",
    "comentarios del abogado": "💬",
}

PIE_WHATSAPP = "Alejandra Muñoz | Abogada y Asociados\nMensaje automático. Si tiene dudas, escríbanos por el chat del portal."
_PIES_ANTERIORES = ("🤖 _Mensaje automático de Gestión de Procesos._",)


def formatear_mensaje_whatsapp(mensaje: str) -> str:
    """Adapta el texto de la plantilla a un formato legible en WhatsApp.

    Los emojis los pone este formateador, no las plantillas: el saludo lleva 👋,
    las etiquetas conocidas su ícono y el enlace 🔗.
    """
    texto = mensaje.replace("\r\n", "\n").replace("\r", "\n").strip()
    for pie in _PIES_ANTERIORES:
        texto = texto.replace(pie, "").strip()
    texto = re.sub(r"\n[ \t]+", "\n", texto)

    # Marcas del correo (# > ! ?) por si una plantilla de correo se reutiliza aquí.
    texto = re.sub(r"(?m)^# (.+)$", r"*\1*", texto)
    texto = re.sub(r"(?m)^[>!?] ", "", texto)

    # El enlace va en su propia línea, con una etiqueta que diga qué se hace.
    texto = re.sub(
        r"(?im)^Abrir (?:enlace|tarea|radicado):\s*(?:(.*?)\s*\|\s*)?(https?://\S+)\s*$",
        lambda match: f"🔗 *{match.group(1).strip() if match.group(1) else 'Ver los detalles'}*\n{match.group(2)}",
        texto,
    )
    # Un solo 👋: las plantillas anteriores lo traían al final del saludo.
    primera, _, resto = texto.partition("\n")
    primera = primera.replace("👋", "").rstrip()
    texto = f"{primera}\n{resto}" if resto else primera
    texto = re.sub(r"(?i)^Hola(?=[\s,.:!])", "👋 Hola", texto, count=1)
    if texto and texto[0].isalnum() and not texto.startswith("👋 Hola"):
        texto = f"👋 Hola.\n\n{texto}"

    etiquetas = "|".join(sorted((re.escape(label) for label in _ETIQUETAS), key=len, reverse=True))
    texto = re.sub(
        rf"(?im)^({etiquetas}):",
        lambda match: f"{_ETIQUETAS[match.group(1).casefold()]} {match.group(1)}:",
        texto,
    )
    texto = re.sub(r"\n{3,}", "\n\n", texto).strip()

    if PIE_WHATSAPP not in texto:
        texto = f"{texto}\n\n{PIE_WHATSAPP}"
    return texto


class ErrorWhatsapp(RuntimeError):
    """Fallo del proveedor con un mensaje apto para Alertas (nunca incluye el token)."""


# ---- WhatsApp Cloud API (Meta) ---------------------------------------------------

GRAPH_URL = "https://graph.facebook.com"
VERSION_GRAPH_POR_DEFECTO = "v23.0"

# Códigos de error de la Cloud API que conviene explicar en palabras.
_ERRORES_META = {
    0: "Meta no aceptó el token de acceso; revisa WHATSAPP_TOKEN.",
    10: "El token no tiene permiso para enviar mensajes de este número (whatsapp_business_messaging).",
    190: "El token de WhatsApp venció o fue revocado; genera uno nuevo para el usuario del sistema y actualiza WHATSAPP_TOKEN.",
    100: "Meta rechazó un dato del envío (número, plantilla o parámetros).",
    131000: "Meta tuvo un error interno al enviar; se reintentará.",
    131005: "El token no tiene permiso para enviar mensajes de este número.",
    131008: "Falta un parámetro obligatorio de la plantilla.",
    131009: "Un parámetro de la plantilla no es válido.",
    131016: "El servicio de WhatsApp de Meta no está disponible por ahora; se reintentará.",
    131021: "El número de destino es el mismo número del despacho.",
    131026: "El destinatario no puede recibir el mensaje (número sin WhatsApp o sin aceptar las condiciones).",
    131030: "El número de destino no está en la lista de números de prueba de Meta.",
    131031: "Meta bloqueó temporalmente la cuenta de WhatsApp Business; revisa el administrador de WhatsApp.",
    131042: "Hay un problema con el método de pago de la cuenta de WhatsApp Business.",
    131045: "El número del despacho no está registrado en la Cloud API.",
    131047: "Pasaron más de 24 horas desde el último mensaje del destinatario; solo se pueden enviar plantillas aprobadas.",
    131049: "Meta no entregó el mensaje para cuidar la experiencia del usuario (límite de plantillas por persona).",
    131051: "Ese tipo de mensaje no es compatible.",
    131056: "Se enviaron demasiados mensajes seguidos a este número; se reintentará.",
    130429: "Se superó el límite de envíos por segundo de la Cloud API; se reintentará.",
    132000: "El número de parámetros no coincide con la plantilla aprobada en Meta.",
    132001: "La plantilla no existe en Meta o no está aprobada en ese idioma.",
    132005: "El texto de la plantilla con sus valores supera el largo permitido.",
    132007: "El contenido de la plantilla infringe las políticas de Meta.",
    132012: "Los parámetros no tienen el formato que espera la plantilla.",
    132015: "La plantilla está en pausa en Meta por baja calidad.",
    132016: "La plantilla fue deshabilitada en Meta por baja calidad.",
    133010: "El número del despacho no está registrado en la Cloud API.",
    368: "Meta restringió temporalmente la cuenta por infringir sus políticas.",
}


def cloud_config() -> dict[str, str]:
    """Credenciales de la Cloud API. Solo vienen de variables de entorno, nunca de la base ni del código."""
    return {
        "token": os.getenv("WHATSAPP_TOKEN", "").strip(),
        "phone_number_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip(),
        "waba_id": os.getenv("WHATSAPP_WABA_ID", "").strip(),
        "verify_token": os.getenv("WHATSAPP_VERIFY_TOKEN", "").strip(),
        "app_secret": os.getenv("WHATSAPP_APP_SECRET", "").strip(),
        "version": os.getenv("WHATSAPP_GRAPH_VERSION", "").strip() or VERSION_GRAPH_POR_DEFECTO,
        "idioma": os.getenv("WHATSAPP_IDIOMA_PLANTILLAS", "").strip() or "es",
    }


def cloud_activo(config: dict[str, str] | None = None) -> bool:
    """Con número y token de Meta configurados, todo WhatsApp sale por la Cloud API."""
    config = config or cloud_config()
    return bool(config["token"] and config["phone_number_id"])


def graph_url(config: dict[str, str], ruta: str) -> str:
    return f"{GRAPH_URL}/{config['version']}/{ruta.lstrip('/')}"


def _cabeceras(config: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {config['token']}", "Content-Type": "application/json"}


def descripcion_error_meta(respuesta: requests.Response) -> str:
    try:
        error = respuesta.json().get("error") or {}
    except ValueError:
        error = {}
    codigo = error.get("code")
    explicacion = _ERRORES_META.get(codigo) if isinstance(codigo, int) else None
    detalle = f"código {codigo}" if codigo is not None else "sin código"
    base = f"WhatsApp API respondió HTTP {respuesta.status_code} ({detalle})."
    return f"{base} {explicacion}" if explicacion else base


def numero_internacional(numero_destino: str) -> str:
    numero_limpio = "".join(filter(str.isdigit, numero_destino or ""))
    if not numero_limpio.startswith("57") and len(numero_limpio) == 10:
        numero_limpio = f"57{numero_limpio}"
    return numero_limpio


def enviar_plantilla_cloud(numero_destino: str, clave: str, valores: dict, config: dict[str, str] | None = None) -> str:
    """Envía la plantilla de Meta del aviso `clave` y devuelve el id del mensaje (wamid)."""
    config = config or cloud_config()
    plantilla = plantilla_para(clave)
    if plantilla is None:
        raise ErrorWhatsapp(
            f"WhatsApp no está configurado para el aviso {clave}: no tiene plantilla de Meta en app/whatsapp_plantillas.py."
        )
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": numero_internacional(numero_destino),
        "type": "template",
        "template": {
            "name": plantilla.nombre,
            "language": {"code": config["idioma"]},
            "components": componentes(plantilla, valores),
        },
    }
    try:
        respuesta = requests.post(
            graph_url(config, f"{config['phone_number_id']}/messages"),
            headers=_cabeceras(config), json=payload, timeout=10,
        )
    except requests.RequestException as exc:
        raise ErrorWhatsapp(f"No fue posible conectar con la API de WhatsApp ({type(exc).__name__}).") from exc
    if not respuesta.ok:
        raise ErrorWhatsapp(descripcion_error_meta(respuesta))
    try:
        mensajes = respuesta.json().get("messages") or []
    except ValueError:
        mensajes = []
    mensaje_id = str(mensajes[0].get("id") or "") if mensajes else ""
    if not mensaje_id:
        raise ErrorWhatsapp("WhatsApp API respondió sin el id del mensaje.")
    return mensaje_id


def verificar_numero_cloud(config: dict[str, str] | None = None) -> dict:
    """Consulta el número en Meta sin enviar mensajes (prueba de conexión del panel)."""
    config = config or cloud_config()
    try:
        respuesta = requests.get(
            graph_url(config, config["phone_number_id"]),
            headers=_cabeceras(config),
            params={"fields": "display_phone_number,verified_name,quality_rating"},
            timeout=8,
        )
    except requests.RequestException as exc:
        raise ErrorWhatsapp(f"No fue posible conectar con la API de WhatsApp ({type(exc).__name__}).") from exc
    if not respuesta.ok:
        raise ErrorWhatsapp(descripcion_error_meta(respuesta))
    return respuesta.json()


# ---- Envío -------------------------------------------------------------------------


def whatsapp_configurado(config: dict | None = None) -> bool:
    """Cloud API por variables de entorno o, mientras tanto, el proveedor anterior (URL + token)."""
    if cloud_activo():
        return True
    config = config if config is not None else get_integration_settings()
    api_url = str(config.get("whatsapp_api_url") or "")
    token = str(config.get("whatsapp_token") or "")
    return api_url.startswith(("https://", "http://")) and bool(token) and token != "TU_TOKEN_AQUI"


def enviar_mensaje_whatsapp(
    numero_destino: str,
    mensaje: str,
    *,
    raise_on_error: bool = False,
    plantilla: dict | None = None,
) -> bool | str:
    """Envía un aviso por WhatsApp.

    Con la Cloud API configurada se usa la plantilla aprobada de Meta del aviso
    (`plantilla = {"clave": ..., "valores": {...}}`) y se devuelve el id del
    mensaje, que el webhook usa para registrar si se entregó o se leyó. Sin ella
    se usa el proveedor anterior con el texto `mensaje` y se devuelve True.
    Si falla devuelve False, o lanza el error con `raise_on_error`.
    """
    if cloud_activo():
        try:
            if not plantilla or not plantilla.get("clave"):
                raise ErrorWhatsapp("WhatsApp no está configurado para este aviso: falta la plantilla de Meta que le corresponde.")
            return enviar_plantilla_cloud(numero_destino, plantilla["clave"], plantilla.get("valores") or {})
        except ErrorWhatsapp as exc:
            logger.error("WhatsApp Cloud API no envió el aviso: %s", exc)
            if raise_on_error:
                raise
            return False

    numero_limpio = numero_internacional(numero_destino)
    config = get_integration_settings()
    api_url = str(config["whatsapp_api_url"] or "")
    token = str(config["whatsapp_token"] or "")
    if not api_url.startswith(("https://", "http://")) or not token or token == "TU_TOKEN_AQUI":
        logger.warning("WhatsApp API no está configurada; mensaje omitido.")
        if raise_on_error:
            raise RuntimeError("WhatsApp no está configurado: faltan las variables de la Cloud API de Meta (WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID).")
        return False

    payload = {
        "token": token,
        "to": f"+{numero_limpio}",
        "body": formatear_mensaje_whatsapp(mensaje)
    }

    try:
        response = requests.post(api_url, data=payload, timeout=10)
        if response.status_code == 200:
            return True
        logger.error("WhatsApp API rechazó el mensaje con HTTP %s.", response.status_code)
        if raise_on_error:
            raise RuntimeError(f"WhatsApp API respondió HTTP {response.status_code}.")
        return False
    except requests.RequestException as exc:
        logger.exception("Error enviando mensaje por WhatsApp API.")
        if raise_on_error:
            raise RuntimeError(f"No fue posible conectar con la API de WhatsApp ({type(exc).__name__}).") from exc
        return False
