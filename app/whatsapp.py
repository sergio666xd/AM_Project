import os
import logging
import requests

# Configuración mediante variables de entorno (o valores directos para pruebas locales)
WHATSAPP_API_URL = os.getenv("WHATSAPP_API_URL", "")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
logger = logging.getLogger(__name__)

def enviar_mensaje_whatsapp(numero_destino: str, mensaje: str) -> bool:
    """
    Envía una alerta de WhatsApp al número del abogado.
    Soporta formato internacional (Ej: 573001234567).
    """
    # Limpiar formato del número
    numero_limpio = "".join(filter(str.isdigit, numero_destino))
    if not numero_limpio.startswith("57") and len(numero_limpio) == 10:
        numero_limpio = f"57{numero_limpio}"

    if not WHATSAPP_API_URL.startswith(("https://", "http://")) or not WHATSAPP_TOKEN or WHATSAPP_TOKEN == "TU_TOKEN_AQUI":
        logger.warning("WhatsApp API no está configurada; mensaje omitido.")
        return False

    payload = {
        "token": WHATSAPP_TOKEN,
        "to": f"+{numero_limpio}",
        "body": mensaje
    }

    try:
        response = requests.post(WHATSAPP_API_URL, data=payload, timeout=10)
        return response.status_code == 200
    except requests.RequestException:
        logger.exception("Error enviando mensaje por WhatsApp API.")
        return False