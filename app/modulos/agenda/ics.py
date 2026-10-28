"""Formato iCalendar (RFC 5545) para la suscripción de la agenda.

Sin dependencias: solo eventos con hora (en UTC) y eventos de día completo.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

PRODID = "-//Alejandra Muñoz Abogada//Agenda//ES"


@dataclass(frozen=True)
class EventoIcs:
    uid: str
    titulo: str
    inicio: datetime | date
    fin: datetime | date | None = None
    descripcion: str | None = None
    url: str | None = None
    cancelado: bool = False


def _texto(valor: str) -> str:
    return valor.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _instante(valor: datetime) -> str:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _plegar(linea: str) -> str:
    """Corta en líneas de máximo 75 bytes; las siguientes empiezan con un espacio."""
    partes, actual = [], b""
    for caracter in linea:
        codificado = caracter.encode()
        if len(actual) + len(codificado) > (75 if not partes else 74):
            partes.append(actual.decode())
            actual = b""
        actual += codificado
    partes.append(actual.decode())
    return "\r\n ".join(partes)


def calendario(nombre: str, eventos: list[EventoIcs], generado: datetime) -> str:
    lineas = [
        "BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:{PRODID}", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_texto(nombre)}", "X-WR-TIMEZONE:America/Bogota", "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ]
    for evento in eventos:
        lineas += ["BEGIN:VEVENT", f"UID:{evento.uid}", f"DTSTAMP:{_instante(generado)}", f"SUMMARY:{_texto(evento.titulo)}"]
        if isinstance(evento.inicio, datetime):
            lineas.append(f"DTSTART:{_instante(evento.inicio)}")
            fin = evento.fin if isinstance(evento.fin, datetime) and evento.fin > evento.inicio else evento.inicio + timedelta(hours=1)
            lineas.append(f"DTEND:{_instante(fin)}")
        else:
            lineas.append(f"DTSTART;VALUE=DATE:{evento.inicio:%Y%m%d}")
            lineas.append(f"DTEND;VALUE=DATE:{evento.inicio + timedelta(days=1):%Y%m%d}")
        if evento.descripcion:
            lineas.append(f"DESCRIPTION:{_texto(evento.descripcion)}")
        if evento.url:
            lineas.append(f"URL:{evento.url}")
        if evento.cancelado:
            lineas.append("STATUS:CANCELLED")
        lineas.append("END:VEVENT")
    lineas.append("END:VCALENDAR")
    return "\r\n".join(_plegar(linea) for linea in lineas) + "\r\n"
