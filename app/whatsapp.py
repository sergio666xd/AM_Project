import logging
import requests
from app.integration_settings import get_integration_settings

# Configuración mediante variables de entorno (o valores directos para pruebas locales)
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

    config = get_integration_settings()
    api_url = str(config["whatsapp_api_url"] or "")
    token = str(config["whatsapp_token"] or "")
    if not api_url.startswith(("https://", "http://")) or not token or token == "TU_TOKEN_AQUI":
        logger.warning("WhatsApp API no está configurada; mensaje omitido.")
        return False

    payload = {
        "token": token,
        "to": f"+{numero_limpio}",
        "body": mensaje
    }

    try:
        response = requests.post(api_url, data=payload, timeout=10)
        return response.status_code == 200
    except requests.RequestException:
        logger.exception("Error enviando mensaje por WhatsApp API.")
        return False
