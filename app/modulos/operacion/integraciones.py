"""Servidor de correo, WhatsApp y comprobaciones de las integraciones.

Las claves se guardan cifradas y nunca vuelven al navegador: la configuración
solo dice si hay una guardada. Las pruebas de conexión no envían mensajes; el
envío de prueba sí, y solo al destinatario que la administración escribe.
"""

import smtplib
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import requests
from email_validator import EmailNotValidError, validate_email
from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.integration_settings import encrypt_secret, get_integration_settings
from app.message_templates import render_message
from app.modulos.administracion import salud
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.operacion.esquemas import (
    CambioCorreo,
    CambioWhatsapp,
    ClavePrueba,
    ConfiguracionCorreo,
    ConfiguracionWhatsapp,
    EnvioPrueba,
    PanelIntegraciones,
    PruebaEnviada,
    ResultadoPrueba,
)
from app.modulos.operacion.repositorio import RepositorioOperacion
from app.nucleo.errores import DatosInvalidos, ErrorDominio


class ProveedorNoDisponible(ErrorDominio):
    estado = 502
    codigo = "proveedor_no_disponible"


def _whatsapp_listo(config: dict) -> bool:
    return bool(
        str(config["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and config["whatsapp_token"] and config["whatsapp_token"] != "TU_TOKEN_AQUI"
    )


# ---- Llamadas externas (las pruebas las sustituyen) -------------------------------


def conectar_rama() -> ResultadoPrueba:
    from app.rama_judicial_api import API_BASE_URL

    try:
        with urlopen(Request(API_BASE_URL), timeout=8):
            pass
    except HTTPError as exc:
        if exc.code >= 500:
            return ResultadoPrueba(estado="falla", mensaje=f"La Rama Judicial respondió con un error ({exc.code}). Suele ser pasajero.")
    except (URLError, TimeoutError, OSError):
        return ResultadoPrueba(estado="falla", mensaje="No fue posible conectar con la Rama Judicial. Puede estar caída.")
    return ResultadoPrueba(estado="ok", mensaje="La Rama Judicial respondió.")


def conectar_correo(config: dict) -> ResultadoPrueba:
    try:
        with smtplib.SMTP(config["smtp_host"], int(config["smtp_port"] or 587), timeout=8) as servidor:
            servidor.ehlo()
            if config["smtp_starttls"]:
                servidor.starttls()
                servidor.ehlo()
            if config["smtp_user"] and config["smtp_password"]:
                servidor.login(config["smtp_user"], config["smtp_password"])
    except smtplib.SMTPAuthenticationError:
        return ResultadoPrueba(estado="falla", mensaje="El servidor rechazó el usuario o la clave.")
    except (OSError, smtplib.SMTPException, ValueError):
        return ResultadoPrueba(estado="falla", mensaje="No fue posible conectar con el servidor de correo. Revise la dirección y el puerto.")
    return ResultadoPrueba(estado="ok", mensaje="El servidor de correo aceptó la conexión. No se envió ningún correo.")


def conectar_workflows() -> ResultadoPrueba:
    from app.workflow_service import workflow_frontend_url, workflow_service_headers

    base = workflow_frontend_url()
    cabeceras = workflow_service_headers()
    if not base or "Authorization" not in cabeceras:
        return ResultadoPrueba(estado="sin_configurar", mensaje="Faltan la dirección o el token del servicio de tareas programadas.")
    try:
        respuesta = requests.post(urljoin(base.rstrip("/") + "/", "workflow-internal/diagnosticos"), headers=cabeceras, json={}, timeout=10)
    except requests.RequestException:
        return ResultadoPrueba(estado="falla", mensaje="No fue posible contactar el servicio de tareas programadas.")
    if not respuesta.ok:
        return ResultadoPrueba(estado="falla", mensaje=f"El servicio de tareas programadas respondió con un error ({respuesta.status_code}).")
    return ResultadoPrueba(estado="ok", mensaje="El servicio de tareas programadas respondió.")


def enviar_correo_prueba(destino: str, asunto: str, cuerpo: str) -> bool:
    from app.email_service import enviar_correo

    return enviar_correo(destino, asunto, cuerpo)


def enviar_whatsapp_prueba(destino: str, cuerpo: str) -> bool:
    from app.whatsapp import enviar_mensaje_whatsapp

    return enviar_mensaje_whatsapp(destino, cuerpo)


class ServicioIntegraciones:
    def __init__(self, db: Session, repositorio: RepositorioOperacion):
        self._db = db
        self._repo = repositorio

    def _panel(self) -> PanelIntegraciones:
        config = get_integration_settings(self._db)
        return PanelIntegraciones(
            estados=salud.estado_integraciones(self._db),
            correo=ConfiguracionCorreo(
                servidor=config["smtp_host"] or "", puerto=config["smtp_port"], remitente=config["smtp_from"] or "",
                starttls=bool(config["smtp_starttls"]), usuario=config["smtp_user"] or "",
                tiene_clave=bool(config["smtp_password"]), configurado=bool(config["smtp_host"] and config["smtp_from"]),
            ),
            whatsapp=ConfiguracionWhatsapp(
                url=config["whatsapp_api_url"] or "", tiene_token=bool(config["whatsapp_token"]), configurado=_whatsapp_listo(config),
            ),
        )

    def panel(self, admin: Usuario) -> PanelIntegraciones:
        exigir_admin(admin)
        return self._panel()

    def guardar_correo(self, admin: Usuario, datos: CambioCorreo) -> PanelIntegraciones:
        exigir_admin(admin)
        try:
            remitente = validate_email(datos.remitente.strip(), check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise DatosInvalidos("El remitente no es un correo válido.", campos={"remitente": "Escriba un correo válido."}) from exc
        if not datos.servidor.strip():
            raise DatosInvalidos("Falta el servidor.", campos={"servidor": "Escriba la dirección del servidor de correo."})
        config = self._repo.configuracion_integraciones()
        config.smtp_host = datos.servidor.strip()
        config.smtp_port = datos.puerto
        config.smtp_from = remitente
        config.smtp_starttls = datos.starttls
        config.smtp_user = datos.usuario.strip()
        if datos.clave:
            config.smtp_password_encrypted = encrypt_secret(datos.clave)
        elif datos.borrar_clave:
            config.smtp_password_encrypted = encrypt_secret("")
        config.actualizado_por_id = admin.id
        registrar_evento_auditoria(self._db, admin, "admin.integraciones.configuracion.actualizar", "configuracion_integraciones", 1, {"parte": "correo"})
        self._db.commit()
        return self._panel()

    def guardar_whatsapp(self, admin: Usuario, datos: CambioWhatsapp) -> PanelIntegraciones:
        exigir_admin(admin)
        config = self._repo.configuracion_integraciones()
        config.whatsapp_api_url_encrypted = encrypt_secret(datos.url)
        if datos.token:
            config.whatsapp_token_encrypted = encrypt_secret(datos.token)
        elif datos.borrar_token:
            config.whatsapp_token_encrypted = encrypt_secret("")
        config.actualizado_por_id = admin.id
        registrar_evento_auditoria(self._db, admin, "admin.integraciones.configuracion.actualizar", "configuracion_integraciones", 1, {"parte": "whatsapp"})
        self._db.commit()
        return self._panel()

    def probar(self, admin: Usuario, clave: ClavePrueba) -> ResultadoPrueba:
        exigir_admin(admin)
        if clave == "rama_judicial":
            return conectar_rama()
        if clave == "tareas_programadas":
            return conectar_workflows()
        config = get_integration_settings(self._db)
        if clave == "correo":
            if not config["smtp_host"] or not config["smtp_from"]:
                return ResultadoPrueba(estado="sin_configurar", mensaje="Faltan el servidor y el remitente.")
            return conectar_correo(config)
        if not _whatsapp_listo(config):
            return ResultadoPrueba(estado="sin_configurar", mensaje="Faltan la dirección o el token del proveedor.")
        return ResultadoPrueba(estado="ok", mensaje="Está configurado. Esta prueba no envía mensajes; use el envío de prueba.")

    def enviar_prueba(self, admin: Usuario, datos: EnvioPrueba) -> PruebaEnviada:
        exigir_admin(admin)
        destino = datos.destinatario.strip()
        if datos.canal == "EMAIL":
            try:
                destino = validate_email(destino, check_deliverability=False).normalized
            except EmailNotValidError as exc:
                raise DatosInvalidos("Ese correo no es válido.", campos={"destinatario": "Escriba un correo válido."}) from exc
        elif not 8 <= len("".join(filter(str.isdigit, destino))) <= 15:
            raise DatosInvalidos("Ese número no es válido.", campos={"destinatario": "Escriba el número con indicativo, por ejemplo 300 123 4567."})
        registrar_evento_auditoria(self._db, admin, "admin.integracion.envio_prueba", "integracion", datos.canal)
        self._db.commit()
        asunto, cuerpo = render_message(self._db, "PRUEBA_INTEGRACION", {"nombre": admin.nombre_completo}, canal=datos.canal)
        try:
            enviado = enviar_correo_prueba(destino, asunto, cuerpo) if datos.canal == "EMAIL" else enviar_whatsapp_prueba(destino, cuerpo)
        except Exception as exc:  # noqa: BLE001 - cualquier fallo del proveedor se informa igual
            raise ProveedorNoDisponible("El proveedor no pudo enviar el mensaje de prueba.") from exc
        if not enviado:
            raise ProveedorNoDisponible("El proveedor no confirmó el envío. Revise la configuración y pruebe la conexión.")
        return PruebaEnviada(destino=destino)

