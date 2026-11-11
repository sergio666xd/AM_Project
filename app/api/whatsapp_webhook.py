"""Webhook de la WhatsApp Cloud API: `/api/whatsapp/webhook`.

Meta lo llama con GET una sola vez para verificarlo (`hub.verify_token`) y con
POST por cada novedad: el estado de los mensajes enviados (enviado, entregado,
leído, fallido), los mensajes que las personas escriben al número del despacho
(campo `messages`) y el resultado de la revisión de cada plantilla (campo
`message_template_status_update`).

Cada POST se valida con la firma `X-Hub-Signature-256` (HMAC SHA-256 del cuerpo
con el secreto de la app de Meta). La ruta queda fuera del contrato de la API v2.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.timezone import utc_ahora
from app.whatsapp import cloud_config, numero_internacional

router = APIRouter(prefix="/api/whatsapp", include_in_schema=False)
logger = logging.getLogger(__name__)

# Orden de los estados de Meta: uno anterior no reemplaza a uno posterior
# (los webhooks pueden llegar desordenados).
_ORDEN_ESTADOS = {"accepted": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 4}


def firma_valida(cuerpo: bytes, firma: str | None, secreto: str) -> bool:
    if not secreto or not firma or not firma.startswith("sha256="):
        return False
    esperada = hmac.new(secreto.encode("utf-8"), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, firma.removeprefix("sha256="))


def _momento(timestamp: object) -> datetime:
    try:
        return datetime.fromtimestamp(int(str(timestamp)), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OverflowError, OSError):
        return utc_ahora()


def _error_estado(estado: dict) -> str:
    errores = estado.get("errors") or []
    if not errores:
        return "Meta informó que el mensaje de WhatsApp no se pudo entregar."
    error = errores[0]
    codigo = error.get("code")
    titulo = (error.get("error_data") or {}).get("details") or error.get("title") or error.get("message") or ""
    return f"Meta no entregó el WhatsApp (código {codigo}): {str(titulo)[:300]}".rstrip(": ")


def registrar_estado(db: Session, estado: dict) -> None:
    mensaje_id = str(estado.get("id") or "")
    nuevo = str(estado.get("status") or "").lower()
    if not mensaje_id or nuevo not in _ORDEN_ESTADOS:
        return
    entrega = db.query(models.EntregaNotificacion).filter_by(proveedor_mensaje_id=mensaje_id).first()
    if entrega is None:
        # Mensajes de prueba o enviados por fuera de las entregas (códigos, confirmaciones).
        return
    actual = _ORDEN_ESTADOS.get(entrega.estado_proveedor or "", -1)
    if _ORDEN_ESTADOS[nuevo] < actual:
        return
    entrega.estado_proveedor = nuevo
    entrega.estado_proveedor_en = _momento(estado.get("timestamp"))
    if nuevo == "failed":
        # Meta aceptó el envío pero no pudo entregarlo: se muestra como error en Alertas.
        entrega.estado = "ERROR"
        entrega.error = _error_estado(estado)


def registrar_mensaje(db: Session, mensaje: dict, contactos: list[dict]) -> None:
    mensaje_id = str(mensaje.get("id") or "")
    telefono = numero_internacional(str(mensaje.get("from") or ""))
    if not mensaje_id or not telefono:
        return
    if db.query(models.MensajeWhatsappRecibido.id).filter_by(mensaje_id=mensaje_id).first():
        return
    tipo = str(mensaje.get("type") or "desconocido")[:32]
    texto = None
    if tipo == "text":
        texto = (mensaje.get("text") or {}).get("body")
    elif tipo == "button":
        texto = (mensaje.get("button") or {}).get("text")
    elif tipo == "interactive":
        interactivo = mensaje.get("interactive") or {}
        respuesta = interactivo.get("button_reply") or interactivo.get("list_reply") or {}
        texto = respuesta.get("title")
    elif tipo in {"image", "document", "video", "audio", "sticker"}:
        texto = (mensaje.get(tipo) or {}).get("caption")
    nombre = next(
        ((contacto.get("profile") or {}).get("name") for contacto in contactos
         if numero_internacional(str(contacto.get("wa_id") or "")) == telefono),
        None,
    )
    usuario = next(
        (candidato for candidato in db.query(models.Usuario).filter(models.Usuario.whatsapp_numero.isnot(None)).all()
         if numero_internacional(candidato.whatsapp_numero) == telefono),
        None,
    )
    db.add(models.MensajeWhatsappRecibido(
        mensaje_id=mensaje_id[:128],
        telefono=telefono[:32],
        nombre_perfil=(str(nombre)[:150] if nombre else None),
        usuario_id=usuario.id if usuario else None,
        tipo=tipo,
        texto=texto,
        recibido_en=_momento(mensaje.get("timestamp")),
    ))


def registrar_estado_plantilla(db: Session, valor: dict, momento: datetime) -> None:
    """Guarda lo que Meta decidió de una plantilla: APPROVED, REJECTED, PAUSED, DISABLED..."""
    nombre = str(valor.get("message_template_name") or "")[:512]
    idioma = str(valor.get("message_template_language") or "")[:16]
    estado = str(valor.get("event") or "").upper()[:32]
    if not nombre or not idioma or not estado:
        return
    motivo = valor.get("reason")
    detalle = (valor.get("other_info") or {}).get("description")
    motivo = " ".join(str(parte) for parte in (motivo, detalle) if parte and parte != "NONE") or None
    fila = db.query(models.PlantillaWhatsappMeta).filter_by(nombre=nombre, idioma=idioma).first()
    if fila is None:
        db.add(models.PlantillaWhatsappMeta(nombre=nombre, idioma=idioma, estado=estado, motivo=motivo, actualizado_en=momento))
        db.flush()
        return
    if fila.actualizado_en and momento < fila.actualizado_en:
        # Llegó tarde un aviso anterior al que ya se guardó.
        return
    fila.estado, fila.motivo, fila.actualizado_en = estado, motivo, momento


def procesar_evento(db: Session, evento: dict, phone_number_id: str, waba_id: str = "") -> None:
    for entrada in evento.get("entry") or []:
        for cambio in entrada.get("changes") or []:
            if cambio.get("field") == "message_template_status_update":
                if waba_id and str(entrada.get("id") or "") not in {"", waba_id}:
                    continue
                momento = _momento(entrada["time"]) if entrada.get("time") else utc_ahora()
                registrar_estado_plantilla(db, cambio.get("value") or {}, momento)
                continue
            if cambio.get("field") != "messages":
                continue
            valor = cambio.get("value") or {}
            numero = str((valor.get("metadata") or {}).get("phone_number_id") or "")
            if phone_number_id and numero and numero != phone_number_id:
                continue
            for estado in valor.get("statuses") or []:
                registrar_estado(db, estado)
            for mensaje in valor.get("messages") or []:
                registrar_mensaje(db, mensaje, valor.get("contacts") or [])
    db.commit()


@router.get("/webhook")
def verificar_webhook(request: Request):
    """Meta envía `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; se responde el challenge."""
    params = request.query_params
    esperado = cloud_config()["verify_token"]
    recibido = params.get("hub.verify_token") or ""
    if params.get("hub.mode") == "subscribe" and esperado and hmac.compare_digest(recibido, esperado):
        return PlainTextResponse(params.get("hub.challenge") or "")
    return PlainTextResponse("Verificación rechazada.", status_code=403)


@router.post("/webhook")
async def recibir_webhook(request: Request, db: Session = Depends(get_db)):
    config = cloud_config()
    cuerpo = await request.body()
    if not config["app_secret"]:
        logger.error("Llegó un webhook de WhatsApp pero falta WHATSAPP_APP_SECRET para validar su firma.")
        return JSONResponse({"detalle": "Webhook sin configurar."}, status_code=503)
    if not firma_valida(cuerpo, request.headers.get("X-Hub-Signature-256"), config["app_secret"]):
        return JSONResponse({"detalle": "Firma inválida."}, status_code=401)
    try:
        evento = json.loads(cuerpo or b"{}")
    except ValueError:
        return JSONResponse({"detalle": "Cuerpo inválido."}, status_code=400)
    try:
        procesar_evento(db, evento, config["phone_number_id"], config["waba_id"])
    except Exception:
        # Meta reintenta durante días si no recibe 200; un evento que no se puede
        # guardar se registra en el log y no se vuelve a pedir.
        db.rollback()
        logger.exception("No se pudo procesar un webhook de WhatsApp.")
    return {"ok": True}
