"""Correos de un mensaje del sitio: el aviso a la firma y la confirmación a quien escribió.

Corren después de responderle al visitante, para que el formulario no espere
al servidor de correo. El resultado del aviso a la firma queda en la
solicitud: si falla, la administración lo ve en la bandeja.
"""

import logging
from urllib.parse import quote

from sqlalchemy import Connection, Engine
from sqlalchemy.orm import Session

from app import models
from app.message_templates import fecha_legible, render_direct_message
from app.modulos.sitio.esquemas import AREAS
from app.nucleo.zona_horaria import a_colombia
from app.workflow_service import user_portal_url

logger = logging.getLogger(__name__)


def enviar_correo(destinatario: str, asunto: str, cuerpo: str, *, reply_to: str | None = None) -> bool:
    from app.email_service import enviar_correo as enviar

    return enviar(destinatario, asunto, cuerpo, reply_to=reply_to)


def digitos_whatsapp(telefono: str | None) -> str:
    """'315 222 3344' o '+57 315…' → número internacional para wa.me; vacío si no sirve."""
    digitos = "".join(c for c in telefono or "" if c.isdigit())
    if len(digitos) == 10 and digitos.startswith("3"):
        return f"57{digitos}"
    return digitos if len(digitos) >= 11 else ""


def telefono_legible(telefono: str | None) -> str:
    digitos = "".join(c for c in telefono or "" if c.isdigit())
    if len(digitos) == 12 and digitos.startswith("57"):
        digitos = digitos[2:]
    if len(digitos) == 10:
        return f"{digitos[:3]} {digitos[3:6]} {digitos[6:]}"
    return (telefono or "").strip()


def whatsapp_url(solicitud: models.SolicitudContacto, firma: str) -> str | None:
    numero = digitos_whatsapp(solicitud.telefono)
    if not numero:
        return None
    primer = solicitud.nombre.split()[0]
    texto = f"Hola, {primer}. Le escribimos de {firma} por el mensaje que nos dejó en el sitio web."
    return f"https://wa.me/{numero}?text={quote(texto)}"


def _mensaje_en_correo(mensaje: str) -> str:
    """El texto de la persona en un solo párrafo entre comillas, sin que sus líneas se lean como marcas."""
    plano = " ".join(mensaje.split())
    return f"«{plano[:1500]}{'…' if len(plano) > 1500 else ''}»"


def _accion(solicitud: models.SolicitudContacto) -> str:
    telefono = telefono_legible(solicitud.telefono)
    if telefono and solicitud.correo:
        return f"Escríbale por WhatsApp al {telefono} o responda este correo: la respuesta le llega directamente."
    if telefono:
        return f"Comuníquese al {telefono}, por WhatsApp o con una llamada. No dejó correo."
    return f"Responda este correo: la respuesta le llega directamente a {solicitud.correo}."


def _medio(solicitud: models.SolicitudContacto) -> str:
    telefono = telefono_legible(solicitud.telefono)
    if telefono and digitos_whatsapp(solicitud.telefono):
        return f"por WhatsApp al {telefono} o por correo"
    if telefono:
        return f"al {telefono} o por correo"
    return "a este correo"


def avisar_firma(db: Session, solicitud: models.SolicitudContacto) -> None:
    config = db.get(models.ConfiguracionFirma, 1)
    firma = config.nombre if config else "Alejandra Muñoz | Abogada y Asociados"
    destino = (config.correo_contacto if config else None) or ""
    valores = {
        "nombre": solicitud.nombre, "area": AREAS.get(solicitud.area, "otro asunto"),
        "mensaje": _mensaje_en_correo(solicitud.mensaje), "accion": _accion(solicitud),
        "boton": "Escribirle por WhatsApp", "telefono": telefono_legible(solicitud.telefono), "correo": solicitud.correo or "",
        "fecha": fecha_legible(a_colombia(solicitud.created_at)),
        "panel": user_portal_url("ADMIN", f"/gestion-procesos/admin/sitio/mensajes?mensaje={solicitud.id}"),
    }
    try:
        if not destino:
            raise ValueError("Falta el correo de contacto en los datos de la firma.")
        asunto, cuerpo = render_direct_message(db, "SITIO_SOLICITUD_FIRMA", valores,
                                               link_label=None, link_url=whatsapp_url(solicitud, firma))
        if not enviar_correo(destino, asunto, cuerpo, reply_to=solicitud.correo):
            raise RuntimeError("El correo saliente no está configurado.")
        solicitud.aviso_firma, solicitud.aviso_error = "ENVIADO", None
    except Exception as exc:  # noqa: BLE001 - el mensaje ya quedó guardado; la bandeja muestra el fallo.
        solicitud.aviso_firma = "FALLIDO"
        solicitud.aviso_error = str(getattr(exc, "detail", exc))[:500]
        logger.warning("No se pudo avisar a la firma del mensaje %s: %s", solicitud.id, solicitud.aviso_error)


def confirmar_a_quien_escribio(db: Session, solicitud: models.SolicitudContacto) -> None:
    if not solicitud.correo:
        return
    config = db.get(models.ConfiguracionFirma, 1)
    whatsapp = telefono_legible(config.whatsapp) if config and config.whatsapp else ""
    ayuda = "Si quiere agregar algo, responda este correo" + (f" o escríbanos por WhatsApp al {whatsapp}." if whatsapp else ".")
    valores = {
        "nombre": solicitud.nombre, "area": AREAS.get(solicitud.area, "otro asunto"), "medio": _medio(solicitud),
        "fecha": fecha_legible(a_colombia(solicitud.created_at)), "ayuda": ayuda,
    }
    try:
        asunto, cuerpo = render_direct_message(db, "SITIO_SOLICITUD_ACUSE", valores)
        enviar_correo(solicitud.correo, asunto, cuerpo, reply_to=(config.correo_contacto if config else None) or None)
    except Exception as exc:  # noqa: BLE001 - la confirmación es una cortesía; el mensaje ya llegó.
        logger.warning("No se pudo confirmar el mensaje %s a quien escribió: %s", solicitud.id, exc)


def procesar(solicitud_id: int, conexion: Engine | Connection) -> None:
    """Tarea de fondo: abre su propia sesión, sobre la misma base, porque la de la petición ya se cerró."""
    with Session(bind=conexion) as db:
        solicitud = db.get(models.SolicitudContacto, solicitud_id)
        if solicitud is None:
            return
        avisar_firma(db, solicitud)
        db.commit()
        confirmar_a_quien_escribio(db, solicitud)
