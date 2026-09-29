"""Entrega de correo transaccional mediante SMTP configurado por entorno."""

import os
import smtplib
from email.message import EmailMessage
from email.policy import SMTP


def enviar_correo(destinatario: str, asunto: str, cuerpo: str) -> bool:
    host = os.getenv("SMTP_HOST")
    remitente = os.getenv("SMTP_FROM")
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
    puerto = int(os.getenv("SMTP_PORT", "587"))
    usuario = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    with smtplib.SMTP(host, puerto, timeout=20) as servidor:
        if os.getenv("SMTP_STARTTLS", "true").lower() == "true":
            servidor.starttls()
        if usuario and password:
            servidor.login(usuario, password)
        servidor.send_message(mensaje)
    return True
