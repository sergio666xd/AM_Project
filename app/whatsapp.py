import os
import requests

# Configuración mediante variables de entorno (o valores directos para pruebas locales)
WHATSAPP_API_URL = os.getenv("WHATSAPP_API_URL", "https://api.ultramsg.com/INSTANCE_ID/messages/chat")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "TU_TOKEN_AQUI")

def enviar_mensaje_whatsapp(numero_destino: str, mensaje: str) -> bool:
    """
    Envía una alerta de WhatsApp al número del abogado.
    Soporta formato internacional (Ej: 573001234567).
    """
    # Limpiar formato del número
    numero_limpio = "".join(filter(str.isdigit, numero_destino))
    if not numero_limpio.startswith("57") and len(numero_limpio) == 10:
        numero_limpio = f"57{numero_limpio}"

    payload = {
        "token": WHATSAPP_TOKEN,
        "to": f"+{numero_limpio}",
        "body": mensaje
    }

    try:
        # En entorno local sin API conectada, imprimimos el mensaje en consola
        if WHATSAPP_TOKEN == "TU_TOKEN_AQUI":
            print("\n" + "="*50)
            print(f"📱 [SIMULACIÓN WHATSAPP] Enviando a: +{numero_limpio}")
            print(mensaje)
            print("="*50 + "\n")
            return True

        response = requests.post(WHATSAPP_API_URL, data=payload, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Error enviando mensaje de WhatsApp: {e}")
        return False