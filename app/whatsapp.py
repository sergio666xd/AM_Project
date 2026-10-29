import logging
import re
import requests
from app.integration_settings import get_integration_settings

# Configuración mediante variables de entorno (o valores directos para pruebas locales)
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


def enviar_mensaje_whatsapp(numero_destino: str, mensaje: str, *, raise_on_error: bool = False) -> bool:
    """
    Envía una alerta de WhatsApp al número del abogado.
    Soporta formato internacional (Ej: 573001234567).
    """
    # Limpiar formato del número
    numero_limpio = "".join(filter(str.isdigit, numero_destino))
    if not numero_limpio.startswith("57") and len(numero_limpio) == 10:
        numero_limpio = f"57{numero_limpio}"

    config = get_integration_settings()
    api_url = str(config["whatsapp_api_url"] or "")
    token = str(config["whatsapp_token"] or "")
    if not api_url.startswith(("https://", "http://")) or not token or token == "TU_TOKEN_AQUI":
        logger.warning("WhatsApp API no está configurada; mensaje omitido.")
        if raise_on_error:
            raise RuntimeError("WhatsApp no está configurado: revisa la URL de API y el token en Admin > Operación > Integraciones.")
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
