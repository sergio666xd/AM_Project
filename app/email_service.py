"""Entrega de correo transaccional mediante SMTP configurado por entorno."""

import smtplib
import re
from datetime import date
from email.message import EmailMessage
from email.policy import SMTP
from html import escape
from app.integration_settings import get_firm_settings, get_integration_settings


_LOGO_URL = "https://www.alejandramunozabogada.com/AM_logo_Recurso%202_Landscape_web.png"
_NAVY = "#002060"
_GOLD = "#ccb56b"


def _html_correo(cuerpo: str, firma: dict[str, str | bool] | None = None) -> str:
    """Envuelve el contenido del mensaje con el diseño común de la firma."""
    lineas = []
    for line in cuerpo.splitlines():
        match = re.fullmatch(r"Abrir (radicado|tarea):\s*(https?://\S+)", line.strip())
        if match:
            tipo, url = match.groups()
            label = "Ver radicado" if tipo == "radicado" else "Ver tarea"
            lineas.append(
                f'<a href="{escape(url, quote=True)}" style="display:inline-block;margin:5px 0;padding:10px 16px;background:{_NAVY};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">{label}</a>'
            )
        else:
            lineas.append(escape(line))
    contenido = "<br>\n".join(lineas)
    anio = date.today().year
    firma = firma or {}
    logo_url = escape(str(firma.get("logo_url") or _LOGO_URL), quote=True)
    nombre_firma = escape(str(firma.get("nombre") or "Alejandra Muñoz | Abogada y Asociados"))
    correo_contacto = escape(str(firma.get("correo_contacto") or "contacto@alejandramunozabogada.com"), quote=True)
    correo_pqr = escape(str(firma.get("correo_pqr") or "pqr@alejandramunozabogada.com"), quote=True)
    whatsapp = str(firma.get("whatsapp") or "3508809878")
    whatsapp_digits = "".join(filter(str.isdigit, whatsapp))
    whatsapp_link = f"https://wa.me/{'57' if len(whatsapp_digits) == 10 else ''}{whatsapp_digits}"
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 12px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:{_NAVY};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e8ef;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:25px 32px;text-align:center;border-bottom:3px solid {_GOLD};">
      <img src="{logo_url}" alt="{nombre_firma}" width="250" style="display:block;width:100%;max-width:250px;height:auto;margin:0 auto;border:0;">
    </td></tr>
    <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;color:#26364f;">{contenido}</td></tr>
    <tr><td style="padding:23px 32px;background:#f7f8fb;border-top:1px solid #e5e9f0;font-size:12px;line-height:1.7;color:#526078;">
      <p style="margin:0 0 8px;">Este es un mensaje generado automáticamente por nuestro sistema.</p>
      <p style="margin:0 0 8px;font-weight:bold;color:{_NAVY};">Por favor, no responda a este correo.</p>
      <p style="margin:0 0 12px;">Para consultas, solicitudes o atención personalizada, comuníquese con nuestros canales oficiales.</p>
      <p style="margin:0 0 5px;"><strong style="color:{_NAVY};">Correos:</strong>
        <a href="mailto:{correo_contacto}" style="color:{_NAVY};">{correo_contacto}</a> ·
        <a href="mailto:{correo_pqr}" style="color:{_NAVY};">{correo_pqr}</a>
      </p>
      <p style="margin:0 0 16px;"><strong style="color:{_NAVY};">WhatsApp:</strong>
        <a href="{escape(whatsapp_link, quote=True)}" style="color:{_NAVY};">{escape(whatsapp)}</a>
      </p>
      <p style="margin:0;font-weight:bold;color:{_NAVY};">{nombre_firma}</p>
      <p style="margin:0;">{escape(str(firma.get("direccion") or "Sabaneta, Antioquia, Colombia"))}</p>
      <p style="margin:9px 0 0;color:#748096;">© {anio} • Alejandra Muñoz | Abogada y Asociados. Todos los derechos reservados.</p>
    </td></tr>
  </table>
</body></html>"""


def enviar_correo(destinatario: str, asunto: str, cuerpo: str) -> bool:
    config = get_integration_settings()
    firma = get_firm_settings()
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
    mensaje.add_alternative(_html_correo(cuerpo, firma), subtype="html", charset="utf-8")
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
