import os
import urllib.parse

from playwright.sync_api import sync_playwright


# Directorio donde se guarda la sesión de WhatsApp Web
SESSION_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "whatsapp_session",
    )
)


def enviar_mensaje_whatsapp_web(
    numero_destino: str,
    mensaje: str,
) -> bool:
    """
    Envía un mensaje usando WhatsApp Web automatizado por Playwright.

    La sesión de WhatsApp se mantiene mediante un perfil persistente.
    """

    # ---------------------------------------------------------
    # NORMALIZAR NÚMERO
    # ---------------------------------------------------------

    numero_limpio = "".join(
        filter(str.isdigit, numero_destino)
    )

    if (
        not numero_limpio.startswith("57")
        and len(numero_limpio) == 10
    ):
        numero_limpio = f"57{numero_limpio}"

    if len(numero_limpio) != 12:
        print(
            f"❌ [WHATSAPP] Número inválido: "
            f"{numero_destino}"
        )
        return False

    # ---------------------------------------------------------
    # CONSTRUIR URL
    # ---------------------------------------------------------

    mensaje_encoded = urllib.parse.quote(mensaje)

    url_directa = (
        "https://web.whatsapp.com/send"
        f"?phone={numero_limpio}"
        f"&text={mensaje_encoded}"
    )

    try:

        with sync_playwright() as p:

            # -------------------------------------------------
            # ABRIR NAVEGADOR CON SESIÓN PERSISTENTE
            # -------------------------------------------------

            context = p.chromium.launch_persistent_context(
                user_data_dir=SESSION_DIR,
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                ],
            )

            # Reutilizar una página existente si existe
            if context.pages:
                page = context.pages[0]
            else:
                page = context.new_page()

            # -------------------------------------------------
            # ABRIR CHAT
            # -------------------------------------------------

            page.goto(
                url_directa,
                wait_until="domcontentloaded",
                timeout=60000,
            )

            # Dar tiempo a WhatsApp Web para cargar
            page.wait_for_timeout(5000)

            # -------------------------------------------------
            # BUSCAR BOTÓN DE ENVÍO
            # -------------------------------------------------

            selector_boton_enviar = (
                'button[aria-label="Enviar"], '
                'button[aria-label="Send"], '
                'span[data-icon="send"]'
            )

            try:

                boton_enviar = page.locator(
                    selector_boton_enviar
                ).first

                boton_enviar.wait_for(
                    state="visible",
                    timeout=30000,
                )

            except Exception as exc:

                print(
                    "❌ [WHATSAPP] No apareció el botón "
                    "de enviar."
                )

                print(
                    "⚠️ [WHATSAPP] Posiblemente la sesión "
                    "no está iniciada."
                )

                print(
                    f"Detalle: {exc}"
                )

                context.close()

                return False

            # -------------------------------------------------
            # ENVIAR MENSAJE
            # -------------------------------------------------

            page.wait_for_timeout(1000)

            boton_enviar.click()

            # Esperar a que WhatsApp procese el envío
            page.wait_for_timeout(3000)

            print(
                f"✅ [WHATSAPP] Mensaje enviado "
                f"correctamente a +{numero_limpio}"
            )

            context.close()

            return True

    except Exception as exc:

        print(
            f"❌ [WHATSAPP] Error crítico al enviar "
            f"mensaje: {exc}"
        )

        return False