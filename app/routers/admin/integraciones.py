"""Configuración y diagnóstico de integraciones (SMTP, WhatsApp, Workflow, Rama Judicial)."""

import os
import smtplib
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import requests
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.email_service import enviar_correo
from app.integration_settings import encrypt_secret, get_integration_settings
from app.message_templates import render_message
from app.rama_judicial_api import API_BASE_URL
from app.routers.admin.comun import verificar_admin
from app.whatsapp import enviar_mensaje_whatsapp
from app.workflow_service import (
    workflow_401_reason,
    workflow_frontend_url,
    workflow_service_headers,
)

router = APIRouter(prefix="/api/admin", tags=["Administración"])


def _estado_integraciones_admin() -> dict:
    settings = get_integration_settings()
    smtp_configurado = bool(settings["smtp_host"] and settings["smtp_from"])
    whatsapp_configurado = bool(
        str(settings["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and settings["whatsapp_token"]
        and settings["whatsapp_token"] != "TU_TOKEN_AQUI"
    )
    return {
        "smtp_host": settings["smtp_host"] or "",
        "smtp_port": settings["smtp_port"],
        "smtp_from": settings["smtp_from"] or "",
        "smtp_starttls": bool(settings["smtp_starttls"]),
        "smtp_user": settings["smtp_user"] or "",
        "smtp_password_configurada": bool(settings["smtp_password"]),
        "whatsapp_api_url": settings["whatsapp_api_url"] or "",
        "whatsapp_token_configurado": bool(settings["whatsapp_token"]),
        "smtp_configurado": smtp_configurado,
        "whatsapp_configurado": whatsapp_configurado,
    }


@router.get("/integraciones/configuracion")
def obtener_configuracion_integraciones_admin(
    admin: models.Usuario = Depends(verificar_admin),
):
    return _estado_integraciones_admin()


@router.put("/integraciones/configuracion")
def actualizar_configuracion_integraciones_admin(
    datos: schemas.ConfiguracionIntegracionesUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if datos.whatsapp_api_url and not datos.whatsapp_api_url.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="La URL de WhatsApp debe usar HTTP o HTTPS.")
    if datos.borrar_smtp_password and datos.smtp_password:
        raise HTTPException(status_code=400, detail="No puedes guardar y borrar la clave SMTP en la misma solicitud.")
    if datos.borrar_whatsapp_token and datos.whatsapp_token:
        raise HTTPException(status_code=400, detail="No puedes guardar y borrar el token de WhatsApp en la misma solicitud.")

    config = db.query(models.ConfiguracionIntegraciones).filter_by(id=1).with_for_update().first()
    if config is None:
        config = models.ConfiguracionIntegraciones(id=1)
        db.add(config)
    for field in ("smtp_host", "smtp_port", "smtp_from", "smtp_starttls", "smtp_user"):
        value = getattr(datos, field)
        if value is not None:
            setattr(config, field, value.strip() if isinstance(value, str) else value)
    if datos.whatsapp_api_url is not None:
        config.whatsapp_api_url_encrypted = encrypt_secret(datos.whatsapp_api_url.strip())
    if datos.smtp_password is not None:
        config.smtp_password_encrypted = encrypt_secret(datos.smtp_password)
    elif datos.borrar_smtp_password:
        config.smtp_password_encrypted = encrypt_secret("")
    if datos.whatsapp_token is not None:
        config.whatsapp_token_encrypted = encrypt_secret(datos.whatsapp_token)
    elif datos.borrar_whatsapp_token:
        config.whatsapp_token_encrypted = encrypt_secret("")

    config.actualizado_por_id = admin.id
    registrar_evento_auditoria(db, admin, "admin.integraciones.configuracion.actualizar", "configuracion_integraciones", 1)
    db.commit()
    return _estado_integraciones_admin()


@router.get("/diagnosticos/configuracion")
def obtener_estado_configuracion_integraciones(
    admin: models.Usuario = Depends(verificar_admin),
):
    settings = get_integration_settings()
    smtp_configurado = bool(settings["smtp_host"] and settings["smtp_from"])
    whatsapp_configurado = bool(
        str(settings["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and settings["whatsapp_token"]
        and settings["whatsapp_token"] != "TU_TOKEN_AQUI"
    )
    workflow_configurado = bool(
        workflow_frontend_url()
        and os.getenv("WORKFLOW_SERVICE_TOKEN")
    )
    return {
        "integraciones": {
            "RAMA": {"configurada": True, "estado": "PUBLICA"},
            "WORKFLOW": {"configurada": workflow_configurado, "estado": "CONFIGURADA" if workflow_configurado else "FALTAN_VARIABLES"},
            "SMTP": {"configurada": smtp_configurado, "estado": "CONFIGURADA" if smtp_configurado else "FALTAN_VARIABLES"},
            "WHATSAPP": {"configurada": whatsapp_configurado, "estado": "CONFIGURADA" if whatsapp_configurado else "FALTAN_VARIABLES"},
        }
    }


@router.post("/diagnosticos/conexion")
def probar_conexion_integracion(
    datos: schemas.DiagnosticoIntegracion,
    admin: models.Usuario = Depends(verificar_admin),
):
    if datos.integracion == "RAMA":
        try:
            with urlopen(UrlRequest(API_BASE_URL), timeout=8) as response:
                codigo = response.status
        except HTTPError as exc:
            codigo = exc.code
            if codigo >= 500:
                return {"integracion": "RAMA", "estado": "FALLO", "codigo_http": codigo}
            return {
                "integracion": "RAMA",
                "estado": "ALCANZABLE",
                "codigo_http": codigo,
                "detalle": "El host respondió; la URL base no es un endpoint de consulta.",
            }
        except (URLError, TimeoutError, OSError):
            return {"integracion": "RAMA", "estado": "FALLO", "detalle": "No fue posible conectar con la API pública."}
        return {"integracion": "RAMA", "estado": "CONECTADA", "codigo_http": codigo}

    if datos.integracion == "WORKFLOW":
        base_url = workflow_frontend_url()
        headers = workflow_service_headers()
        if not base_url or "Authorization" not in headers:
            return {"integracion": "WORKFLOW", "estado": "FALTAN_VARIABLES"}
        try:
            response = requests.post(
                urljoin(base_url.rstrip("/") + "/", "workflow-internal/diagnosticos"),
                headers=headers,
                json={},
                timeout=10,
            )
        except requests.RequestException:
            return {"integracion": "WORKFLOW", "estado": "FALLO", "detalle": "No fue posible contactar el servicio Workflow."}
        if not response.ok:
            if response.status_code == 401:
                code = workflow_401_reason(response)
                return {
                    "integracion": "WORKFLOW",
                    "estado": "FALLO",
                    "codigo_http": 401,
                    "causa": code,
                    "launcher_host": urlsplit(base_url).hostname or "unknown",
                    "content_type": response.headers.get("content-type", "unknown"),
                }
            return {"integracion": "WORKFLOW", "estado": "FALLO", "codigo_http": response.status_code}
        try:
            resultado = response.json()
        except requests.RequestException:
            return {"integracion": "WORKFLOW", "estado": "FALLO", "detalle": "El servicio Workflow respondió un formato no válido."}
        return {"integracion": "WORKFLOW", "estado": "ACEPTADO", "workflow_run_id": resultado.get("workflow_run_id")}

    if datos.integracion == "SMTP":
        settings = get_integration_settings()
        host = settings["smtp_host"]
        remitente = settings["smtp_from"]
        if not host or not remitente:
            return {"integracion": "SMTP", "estado": "FALTAN_VARIABLES"}
        try:
            with smtplib.SMTP(host, int(settings["smtp_port"] or 587), timeout=8) as servidor:
                servidor.ehlo()
                if settings["smtp_starttls"]:
                    servidor.starttls()
                    servidor.ehlo()
        except (OSError, smtplib.SMTPException, ValueError):
            return {"integracion": "SMTP", "estado": "FALLO", "detalle": "No fue posible establecer la conexión SMTP."}
        return {"integracion": "SMTP", "estado": "CONECTADO", "detalle": "Conexión verificada; no se envió correo."}

    settings = get_integration_settings()
    configurado = bool(
        str(settings["whatsapp_api_url"] or "").startswith(("https://", "http://"))
        and settings["whatsapp_token"]
        and settings["whatsapp_token"] != "TU_TOKEN_AQUI"
    )
    return {
        "integracion": "WHATSAPP",
        "estado": "CONFIGURADA_SIN_ENVIAR" if configurado else "FALTAN_VARIABLES",
        "detalle": "Esta comprobación no envía un mensaje.",
    }


@router.post("/diagnosticos/envio")
def enviar_mensaje_prueba_integracion(
    datos: schemas.DiagnosticoEnvioPrueba,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    if not datos.confirmar_envio:
        raise HTTPException(status_code=400, detail="Confirma explícitamente el envío real de prueba.")

    destinatario = datos.destinatario.strip()
    if datos.canal == "EMAIL":
        try:
            destinatario = validate_email(destinatario, check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise HTTPException(status_code=400, detail="El correo de prueba no es válido.") from exc
    else:
        digitos = "".join(filter(str.isdigit, destinatario))
        if not 8 <= len(digitos) <= 15:
            raise HTTPException(status_code=400, detail="El teléfono de prueba debe tener entre 8 y 15 dígitos.")

    registrar_evento_auditoria(
        db,
        admin,
        "admin.integracion.envio_prueba",
        "integracion",
        datos.canal,
    )
    db.commit()
    try:
        subject, body = render_message(db, "PRUEBA_INTEGRACION", {}, canal=datos.canal)
        enviado = enviar_correo(destinatario, subject, body) if datos.canal == "EMAIL" else enviar_mensaje_whatsapp(destinatario, body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="El proveedor no pudo completar el envío de prueba.") from exc
    if not enviado:
        raise HTTPException(status_code=502, detail="El proveedor no confirmó el envío de prueba.")
    return {"estado": "ENVIADO", "canal": datos.canal, "destinatario": destinatario}
