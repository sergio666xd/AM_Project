"""Entrega de correo transaccional mediante SMTP configurado por entorno."""

import smtplib
from email.message import EmailMessage
from email.policy import SMTP
from app.integration_settings import get_integration_settings


def enviar_correo(destinatario: str, asunto: str, cuerpo: str) -> bool:
    config = get_integration_settings()
    host = config["smtp_host"]
    remitente = config["smtp_from"]
    if not host or not remitente:
        print("[EMAIL] SMTP no configurado; correo omitido.")
        return False
    mensaje = EmailMessage(policy=SMTP)
    mensaje["Subject"] = asunto
    mensaje["From"] = remitente
    mensaje["To"] = destinatario
    mensaje.set_content(
        cuerpo,
        subtype="plain",
        charset="utf-8",
        cte="quoted-printable",
    )
    puerto = int(config["smtp_port"] or 587)
    usuario = config["smtp_user"]
    password = config["smtp_password"]
    with smtplib.SMTP(host, puerto, timeout=20) as servidor:
        if config["smtp_starttls"]:
            servidor.starttls()
        if usuario and password:
            servidor.login(usuario, password)
        servidor.send_message(mensaje)
    return True
