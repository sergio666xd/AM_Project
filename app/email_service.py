"""Entrega de correo transaccional mediante SMTP configurado por entorno.

Los cuerpos llegan como texto editable desde administración y este módulo los
convierte en la hoja del expediente descrita en DESIGN.md. Marcas de línea:

    # Título                       → título en Georgia
    > Explicación sencilla         → caja manila "En palabras sencillas"
    ! Lo que debe hacer            → caja dorada "Qué debe hacer"
    Etiqueta: valor                → ficha de datos (líneas seguidas)
    Abrir enlace: Texto | URL      → botón (el primero) o enlace de texto
    ? Ayuda                        → bloque de ayuda al final
    - elemento                     → lista
"""

import re
import smtplib
from dataclasses import dataclass, field
from datetime import date
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formataddr, parseaddr
from html import escape

from app.integration_settings import get_firm_settings, get_integration_settings


_LOGO_URL = "https://www.alejandramunozabogada.com/AM_logo_Recurso%202_Landscape_web.png"
_SENDER_NAME = "Alejandra Muñoz | Abogada y Asociados"

# Tokens de DESIGN.md.
_NAVY = "#002060"
_GOLD = "#ccb56b"
_GOLD_INK = "#6f581b"
_GOLD_SOFT = "#f5eed6"
_GROUND = "#f6f2e8"
_MANILA = "#ece3cd"
_SHEET_2 = "#fbf9f4"
_LINE = "#e4ddcc"
_INK = "#18203a"
_INK_2 = "#454d63"
_SANS = "'Public Sans', Arial, Helvetica, sans-serif"
_SERIF = "Georgia, Gelasio, 'Times New Roman', serif"
_MONO = "'Roboto Mono', Consolas, 'Courier New', monospace"

_ENLACE = re.compile(r"Abrir enlace:\s*(.{1,80}?)\s*\|\s*(https?://\S+)")
_ENLACE_ANTIGUO = re.compile(r"Abrir (radicado|tarea):\s*(https?://\S+)")
_DATO = re.compile(r"([A-ZÁÉÍÓÚÑ¿][^:]{0,29}):\s+(\S.*)")


@dataclass
class _Bloque:
    tipo: str
    lineas: list = field(default_factory=list)


def _enlace(linea: str) -> tuple[str, str] | None:
    if match := _ENLACE.fullmatch(linea):
        return match.group(1), match.group(2)
    if match := _ENLACE_ANTIGUO.fullmatch(linea):
        tipo, url = match.groups()
        return ("Ver el radicado" if tipo == "radicado" else "Ver la tarea"), url
    return None


def _dato(linea: str) -> tuple[str, str] | None:
    match = _DATO.fullmatch(linea)
    if not match or match.group(1).startswith(("Hola", "Abrir ")) or len(match.group(1).split()) > 4:
        return None
    return match.group(1), match.group(2)


def _bloques(cuerpo: str) -> list[_Bloque]:
    bloques: list[_Bloque] = []

    def agregar(tipo: str, contenido) -> None:
        if bloques and bloques[-1].tipo == tipo and tipo in ("parrafo", "ficha", "lista", "sencillo", "accion", "ayuda"):
            bloques[-1].lineas.append(contenido)
        else:
            bloques.append(_Bloque(tipo, [contenido]))

    for cruda in cuerpo.replace("\r\n", "\n").split("\n"):
        linea = cruda.strip()
        if not linea:
            bloques.append(_Bloque("corte"))
            continue
        if linea.startswith("# "):
            bloques.append(_Bloque("titulo", [linea[2:].strip()]))
        elif enlace := _enlace(linea):
            bloques.append(_Bloque("enlace", [enlace]))
        elif linea[:2] in ("> ", "! ", "? "):
            agregar({">": "sencillo", "!": "accion", "?": "ayuda"}[linea[0]], linea[2:].strip())
        elif linea.startswith(("- ", "• ")):
            agregar("lista", linea[2:].strip())
        elif dato := _dato(linea):
            agregar("ficha", dato)
        else:
            agregar("parrafo", linea)
    return [bloque for bloque in bloques if bloque.tipo != "corte"]


def _texto(texto: str) -> str:
    return escape(texto).replace("\n", "<br>")


def _boton(etiqueta: str, url: str) -> str:
    href = escape(url, quote=True)
    texto = escape(etiqueta)
    return f"""<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{href}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="17%" stroke="f" fillcolor="{_NAVY}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">{texto}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-- --><table role="presentation" class="boton" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;"><tr><td bgcolor="{_NAVY}" style="border-radius:8px;background:{_NAVY};">
<a href="{href}" style="display:block;padding:14px 28px;font-family:{_SANS};font-size:17px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;text-align:center;">{texto}</a>
</td></tr></table><!--<![endif]-->
<p style="margin:0 0 20px;font-family:{_SANS};font-size:15px;line-height:1.5;color:{_INK_2};">Si el botón no funciona, copie este enlace en su navegador:<br><a href="{href}" style="color:{_NAVY};text-decoration:underline;word-break:break-all;">{escape(url)}</a></p>"""


def _caja(fondo: str, borde: str, titulo: str, color_titulo: str, contenido: str) -> str:
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:separate;"><tr><td style="padding:16px 20px;background:{fondo};border:1px solid {borde};border-radius:8px;">
<p style="margin:0 0 6px;font-family:{_SANS};font-size:15px;line-height:1.4;font-weight:600;color:{color_titulo};">{titulo}</p>
<p style="margin:0;font-family:{_SANS};font-size:17px;line-height:1.6;color:{_INK};">{contenido}</p>
</td></tr></table>"""


def _ficha(datos: list[tuple[str, str]]) -> str:
    filas = []
    for indice, (etiqueta, valor) in enumerate(datos):
        separador = f"border-top:1px solid {_LINE};" if indice else ""
        if etiqueta.casefold().startswith("radicado"):
            estilo = f"font-family:{_MONO};font-size:16px;letter-spacing:0.5px;"
        elif etiqueta.casefold().startswith("código"):
            estilo = f"font-family:{_MONO};font-size:30px;font-weight:600;letter-spacing:6px;"
        else:
            estilo = f"font-family:{_SANS};font-size:16px;"
        filas.append(
            f'<tr><td style="padding:10px 16px;{separador}">'
            f'<p style="margin:0;font-family:{_SANS};font-size:14px;line-height:1.4;font-weight:600;color:{_INK_2};">{escape(etiqueta)}</p>'
            f'<p style="margin:2px 0 0;{estilo}line-height:1.5;color:{_INK};">{_texto(valor)}</p></td></tr>'
        )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:0 0 20px;background:{_SHEET_2};border:1px solid {_LINE};border-radius:8px;border-collapse:separate;">'
        f'{"".join(filas)}</table>'
    )


def _contenido(bloques: list[_Bloque]) -> str:
    partes = []
    hubo_boton = False
    for bloque in bloques:
        if bloque.tipo == "titulo":
            partes.append(f'<h1 style="margin:0 0 16px;font-family:{_SERIF};font-size:24px;line-height:1.25;font-weight:400;color:{_INK};">{_texto(bloque.lineas[0])}</h1>')
        elif bloque.tipo == "parrafo":
            partes.append(f'<p style="margin:0 0 16px;font-family:{_SANS};font-size:17px;line-height:1.6;color:{_INK};">{"<br>".join(_texto(l) for l in bloque.lineas)}</p>')
        elif bloque.tipo == "lista":
            items = "".join(f'<li style="margin:0 0 4px;">{_texto(l)}</li>' for l in bloque.lineas)
            partes.append(f'<ul style="margin:0 0 16px;padding-left:24px;font-family:{_SANS};font-size:17px;line-height:1.6;color:{_INK};">{items}</ul>')
        elif bloque.tipo == "sencillo":
            partes.append(_caja(_MANILA, _MANILA, "En palabras sencillas", _INK_2, "<br>".join(_texto(l) for l in bloque.lineas)))
        elif bloque.tipo == "accion":
            partes.append(_caja(_GOLD_SOFT, _GOLD, "Qué debe hacer", _GOLD_INK, "<br>".join(_texto(l) for l in bloque.lineas)))
        elif bloque.tipo == "ficha":
            partes.append(_ficha(bloque.lineas))
        elif bloque.tipo == "ayuda":
            partes.append(f'<p style="margin:8px 0 0;font-family:{_SANS};font-size:15px;line-height:1.5;color:{_INK_2};">{"<br>".join(_texto(l) for l in bloque.lineas)}</p>')
        elif bloque.tipo == "enlace":
            etiqueta, url = bloque.lineas[0]
            if not hubo_boton:
                partes.append(_boton(etiqueta, url))
                hubo_boton = True
            else:
                partes.append(f'<p style="margin:0 0 16px;font-family:{_SANS};font-size:17px;line-height:1.6;"><a href="{escape(url, quote=True)}" style="color:{_NAVY};font-weight:600;text-decoration:underline;">{escape(etiqueta)}</a></p>')
    return "\n".join(partes)


def _preencabezado(bloques: list[_Bloque]) -> str:
    """Lo que la bandeja muestra junto al asunto: primero la acción, si la hay."""
    for tipo in ("accion", "parrafo", "sencillo"):
        for bloque in bloques:
            if bloque.tipo == tipo:
                texto = " ".join(bloque.lineas)
                if tipo == "parrafo" and texto.startswith("Hola") and len(bloque.lineas) == 1:
                    continue
                return texto[:140]
    return ""


def texto_plano(cuerpo: str) -> str:
    """Versión de texto equivalente: sin marcas y con cada botón como 'Texto: URL'."""
    lineas = []
    for cruda in cuerpo.replace("\r\n", "\n").split("\n"):
        linea = cruda.strip()
        if enlace := _enlace(linea):
            lineas.append(f"{enlace[0]}: {enlace[1]}")
        elif linea.startswith("# "):
            lineas.append(linea[2:].strip())
        elif linea[:2] in ("> ", "! ", "? "):
            lineas.append(linea[2:].strip())
        else:
            lineas.append(cruda.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lineas)).strip()


def _html_correo(
    cuerpo: str,
    firma: dict[str, str | bool] | None = None,
    preferencias_url: str | None = None,
) -> str:
    """Envuelve el contenido del mensaje con el diseño común de la firma."""
    bloques = _bloques(cuerpo)
    contenido = _contenido(bloques)
    preencabezado = escape(_preencabezado(bloques))
    anio = date.today().year
    firma = firma or {}
    logo_url = escape(str(firma.get("logo_correo_url") or firma.get("logo_url") or _LOGO_URL), quote=True)
    nombre_firma = escape(str(firma.get("nombre") or _SENDER_NAME))
    correo_contacto = escape(str(firma.get("correo_contacto") or "contacto@alejandramunozabogada.com"), quote=True)
    correo_pqr = escape(str(firma.get("correo_pqr") or "pqr@alejandramunozabogada.com"), quote=True)
    whatsapp = str(firma.get("whatsapp") or "3508809878")
    whatsapp_digits = "".join(filter(str.isdigit, whatsapp))
    whatsapp_link = escape(f"https://wa.me/{'57' if len(whatsapp_digits) == 10 else ''}{whatsapp_digits}", quote=True)
    whatsapp_visible = escape(
        f"{whatsapp_digits[:3]} {whatsapp_digits[3:6]} {whatsapp_digits[6:]}" if len(whatsapp_digits) == 10 else whatsapp
    )
    direccion = escape(str(firma.get("direccion") or "Sabaneta, Antioquia, Colombia"))
    preferencias = (
        f' <a href="{escape(preferencias_url, quote=True)}" style="color:{_NAVY};text-decoration:underline;">Elegir qué avisos recibo</a>.'
        if preferencias_url else ""
    )
    pie_texto = f"font-family:{_SANS};font-size:14px;line-height:1.6;color:{_INK_2};"
    return f"""<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{nombre_firma}</title>
<style>
  @media (max-width: 620px) {{
    .hoja-px {{ padding-left: 20px !important; padding-right: 20px !important; }}
    .boton {{ width: 100% !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{_GROUND};">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:{_GROUND};">{preencabezado}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{_GROUND}" style="background:{_GROUND};">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid {_LINE};border-top:2px solid {_GOLD};border-radius:12px;border-collapse:separate;">
        <tr><td class="hoja-px" align="center" style="padding:28px 32px 20px;">
          <img src="{logo_url}" alt="{nombre_firma}" width="230" style="display:block;width:100%;max-width:230px;height:auto;margin:0 auto;border:0;color:{_INK};font-family:{_SERIF};font-size:18px;">
        </td></tr>
        <tr><td class="hoja-px" style="padding:8px 32px 28px;">
{contenido}
        </td></tr>
        <tr><td class="hoja-px" style="padding:24px 32px;background:{_SHEET_2};border-top:1px solid {_LINE};border-radius:0 0 12px 12px;">
          <p style="margin:0 0 10px;{pie_texto}">Le escribimos porque tiene una cuenta en el portal de {nombre_firma}.{preferencias}</p>
          <p style="margin:0 0 10px;{pie_texto}">Este correo es automático; por favor no lo responda. Si necesita ayuda, escríbanos:</p>
          <p style="margin:0 0 16px;{pie_texto}">
            Correo: <a href="mailto:{correo_contacto}" style="color:{_NAVY};text-decoration:underline;">{correo_contacto}</a><br>
            Peticiones, quejas y reclamos: <a href="mailto:{correo_pqr}" style="color:{_NAVY};text-decoration:underline;">{correo_pqr}</a><br>
            WhatsApp: <a href="{whatsapp_link}" style="color:{_NAVY};text-decoration:underline;">{whatsapp_visible}</a>
          </p>
          <p style="margin:0;font-family:{_SERIF};font-size:16px;line-height:1.4;color:{_INK};">{nombre_firma}</p>
          <p style="margin:2px 0 0;{pie_texto}">{direccion}</p>
          <p style="margin:8px 0 0;{pie_texto}">© {anio} {nombre_firma}. Todos los derechos reservados.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body></html>"""


def enviar_correo(
    destinatario: str,
    asunto: str,
    cuerpo: str,
    adjunto: tuple[str, bytes, str] | None = None,
    preferencias_url: str | None = None,
) -> bool:
    config = get_integration_settings()
    firma = get_firm_settings()
    host = config["smtp_host"]
    remitente = config["smtp_from"]
    if not host or not remitente:
        print("[EMAIL] SMTP no configurado; correo omitido.")
        return False
    mensaje = EmailMessage(policy=SMTP)
    mensaje["Subject"] = asunto
    _, sender_address = parseaddr(str(remitente))
    mensaje["From"] = formataddr((_SENDER_NAME, sender_address or str(remitente)))
    mensaje["To"] = destinatario
    mensaje.set_content(
        texto_plano(cuerpo),
        subtype="plain",
        charset="utf-8",
        cte="quoted-printable",
    )
    mensaje.add_alternative(_html_correo(cuerpo, firma, preferencias_url), subtype="html", charset="utf-8")
    if adjunto:
        nombre_archivo, contenido, mime_type = adjunto
        maintype, _, subtype = mime_type.partition("/")
        mensaje.add_attachment(
            contenido,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=nombre_archivo,
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
