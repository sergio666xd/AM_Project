"""Database backed rendering for editable system messages."""

import re
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models

_TOKEN = re.compile(r"{{\s*([a-zA-Z0-9_.-]+)\s*}}")
# Línea de ficha ("Etiqueta: {{variable}}"), con o sin marca de bloque delante.
_LINEA_DATO = re.compile(r"^\s*(?:[>!?]\s*)?[^{}:\n]{1,40}:\s*{{\s*([a-zA-Z0-9_.-]+)\s*}}\s*$")
# Línea que solo trae una variable (con o sin marca de bloque): si queda vacía, no se muestra.
_LINEA_SOLA = re.compile(r"^\s*(?:[>!?-]\s*)?{{\s*([a-zA-Z0-9_.-]+)\s*}}\s*$")
_TOKEN_ENLACE = re.compile(r"{{\s*enlace\s*}}")
_LINEA_ENLACE = re.compile(r"^\s*Abrir enlace:.*{{\s*enlace\s*}}\s*$")

DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")

# Valores internos que nunca deben llegar tal cual a una persona.
ETIQUETAS_LEGIBLES = {
    "PENDIENTE": "pendiente", "EN_CURSO": "en curso", "COMPLETADA": "completada", "CANCELADA": "cancelada",
    "BAJA": "baja", "MEDIA": "media", "ALTA": "alta", "URGENTE": "urgente",
    "AUDIENCIA": "audiencia", "REUNION": "reunión", "FIRMA_CONTRATO": "firma de contrato", "EVENTO": "actividad",
    "PROGRAMADO": "programada", "REALIZADO": "realizada", "CANCELADO": "cancelada", "REPROGRAMADO": "reprogramada",
    "RECIBIDO": "recibido", "EN_REVISION": "en revisión", "EN REVISION": "en revisión", "APROBADO": "aprobado",
    "REQUIERE_CORRECCION": "necesita corrección", "REQUIERE CORRECCION": "necesita corrección",
    "RECHAZADO": "rechazado", "EMAIL": "correo electrónico", "WHATSAPP": "WhatsApp",
}
_CLAVES_ENUM = {"estado", "prioridad", "tipo", "canal"}
_ENUM_EN_TEXTO = re.compile(r"\b[A-Z]+(?:_[A-Z]+)+\b")

# Rellenos que antes se mostraban como dato; ahora la línea simplemente no aparece.
RELLENOS = {
    "no indicada", "no indicado", "no asignado", "no asignada", "no asociado", "no asociada", "no informada",
    "sin anotación", "sin detalles adicionales", "sin comentarios adicionales", "sin instrucciones adicionales",
    "sin fecha límite", "sin fecha", "sin solicitud asociada", "tarea general", "sin descripción", "cliente",
}
_CLAVES_FECHA = {"fecha", "fecha_limite", "inicio", "fin"}
_FECHA_CO = re.compile(r"^(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{2}):(\d{2}))?$")
_FECHA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$")


def hora_legible(hora: int, minuto: int) -> str:
    sufijo = "a. m." if hora < 12 else "p. m."
    return f"{(hora % 12) or 12}:{minuto:02d} {sufijo}"


def fecha_legible(valor: date | datetime, con_hora: bool = True) -> str:
    """'viernes 20 de noviembre de 2026, 9:00 a. m.' en vez de '20/11/2026 09:00'."""
    texto = f"{DIAS[valor.weekday()]} {valor.day} de {MESES[valor.month - 1]} de {valor.year}"
    if con_hora and isinstance(valor, datetime) and not (valor.hour == 23 and valor.minute == 59):
        if valor.hour or valor.minute:
            texto += f", {hora_legible(valor.hour, valor.minute)}"
    return texto


def fecha_texto(valor: str) -> str:
    """Convierte '20/11/2026 09:00' o '2026-11-20' en texto legible; deja igual lo que no reconoce."""
    if match := _FECHA_CO.match(valor):
        dia, mes, anio, hora, minuto = match.groups()
        try:
            fecha = datetime(int(anio), int(mes), int(dia), int(hora or 0), int(minuto or 0))
        except ValueError:
            return valor
        return fecha_legible(fecha, con_hora=hora is not None)
    if match := _FECHA_ISO.match(valor):
        anio, mes, dia, hora, minuto = match.groups()
        try:
            fecha = datetime(int(anio), int(mes), int(dia), int(hora or 0), int(minuto or 0))
        except ValueError:
            return valor
        # Las fechas de la Rama Judicial llegan a medianoche: solo importa el día.
        return fecha_legible(fecha, con_hora=False)
    return valor


def radicado_legible(numero: str) -> str:
    """Agrupa los 23 dígitos en sus siete segmentos oficiales."""
    digitos = "".join(filter(str.isdigit, numero))
    if len(digitos) != 23 or len(digitos) != len(numero.replace(" ", "")):
        return numero
    cortes = (5, 7, 9, 12, 16, 21, 23)
    partes, inicio = [], 0
    for fin in cortes:
        partes.append(digitos[inicio:fin])
        inicio = fin
    return " ".join(partes)


def texto_legible(valor: str) -> str:
    """Traduce estados y tipos internos (EN_CURSO, ALTA…) a palabras."""
    limpio = valor.strip()
    if limpio in ETIQUETAS_LEGIBLES:
        return ETIQUETAS_LEGIBLES[limpio]
    return _ENUM_EN_TEXTO.sub(lambda m: ETIQUETAS_LEGIBLES.get(m.group(0), m.group(0).replace("_", " ").lower()), valor)


def primer_nombre(nombre: str) -> str:
    palabras = nombre.split()
    if not palabras or nombre.strip().casefold() in RELLENOS:
        return ""
    primero = palabras[0]
    return primero.capitalize() if primero.isupper() else primero


def preparar_valores(values: dict[str, Any], canal: str | None = None) -> dict[str, Any]:
    """Deja cada valor listo para leerse: sin enums, sin rellenos, con fechas y radicados claros."""
    listos: dict[str, Any] = {}
    for clave, valor in values.items():
        if isinstance(valor, str):
            valor = valor.strip()
            if valor.casefold() in RELLENOS:
                valor = ""
            elif clave in _CLAVES_ENUM:
                valor = texto_legible(valor)
            elif clave in _CLAVES_FECHA:
                valor = fecha_texto(valor)
            elif clave == "radicado":
                valor = radicado_legible(valor)
            else:
                valor = _ENUM_EN_TEXTO.sub(lambda m: ETIQUETAS_LEGIBLES.get(m.group(0), m.group(0)), valor)
        listos[clave] = valor
    if isinstance(values.get("nombre"), str):
        listos.setdefault("primer_nombre", primer_nombre(values["nombre"]))
    if canal == "WHATSAPP":
        # Las contraseñas nunca viajan por WhatsApp, aunque una plantilla editada las pida.
        listos["password"] = ""
    return listos


def _valor(values: dict[str, Any], ruta: str) -> str:
    value: Any = values
    for part in ruta.split("."):
        value = value.get(part, "") if isinstance(value, dict) else ""
    return str(value if value is not None else "")


def _render(source: str | None, values: dict[str, Any]) -> str:
    if not source:
        return ""
    source = source.replace("\\n", "\n")
    lineas = []
    for linea in source.split("\n"):
        dato = _LINEA_DATO.match(linea) or _LINEA_SOLA.match(linea)
        if dato and not _valor(values, dato.group(1)).strip():
            continue
        if _LINEA_ENLACE.match(linea) and not _valor(values, "enlace").strip():
            continue
        lineas.append(_TOKEN.sub(lambda match: _valor(values, match.group(1)), linea))
    texto = "\n".join(lineas)
    # Saludo sin nombre conocido: "Hola, :" → "Hola:".
    texto = re.sub(r"^(\W*Hola),\s*([.:])", r"\1\2", texto, flags=re.M)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def _plantilla(db: Session, key: str) -> models.PlantillaMensaje:
    template = db.query(models.PlantillaMensaje).filter_by(clave=key, activo=True).first()
    if template is None:
        raise HTTPException(status_code=503, detail=f"La plantilla de mensaje '{key}' no está configurada.")
    return template


def _cuerpo_con_enlace(source: str, values: dict[str, Any], link_label: str | None, link_url: str | None) -> str:
    """La plantilla decide dónde va el botón con {{enlace}}; si no lo trae, se agrega al final."""
    valores = {**values, "enlace": link_url or ""}
    body = _render(source, valores)
    if link_label and link_url and not _TOKEN_ENLACE.search(source or ""):
        body = f"{body.rstrip()}\n\nAbrir enlace: {link_label} | {link_url}"
    return body



def render_message(
    db: Session,
    key: str,
    values: dict[str, Any],
    *,
    canal: str,
    link_label: str | None = None,
    link_url: str | None = None,
) -> tuple[str, str]:
    template = _plantilla(db, key)
    valores = preparar_valores(values, canal)
    subject = _render(template.asunto_email, valores)
    source = template.cuerpo_whatsapp if canal == "WHATSAPP" else template.cuerpo_email
    return subject, _cuerpo_con_enlace(source, valores, link_label, link_url)


def render_direct_message(
    db: Session,
    key: str,
    values: dict[str, Any],
    *,
    link_label: str | None = None,
    link_url: str | None = None,
) -> tuple[str, str]:
    template = _plantilla(db, key)
    valores = preparar_valores(values, "EMAIL")
    return _render(template.asunto_email, valores), _cuerpo_con_enlace(template.cuerpo_email, valores, link_label, link_url)


def render_push_message(
    db: Session,
    key: str,
    values: dict[str, Any],
) -> tuple[str, str]:
    template = db.query(models.PlantillaMensaje).filter_by(clave=key, activo=True).first()
    if template is None or not template.titulo_push or not template.cuerpo_push:
        raise HTTPException(status_code=503, detail=f"La plantilla Push '{key}' no está configurada.")
    valores = preparar_valores(values, "PUSH")
    return _render(template.titulo_push, valores), _render(template.cuerpo_push, valores)
