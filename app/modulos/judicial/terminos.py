"""Cálculo de términos judiciales en días hábiles.

Reglas:

- Un término en días corre desde el día hábil siguiente a la notificación
  (art. 118 del Código General del Proceso) y vence al terminar el último día.
- No son hábiles los sábados, los domingos, los festivos de la Ley 51 de 1983
  ni la vacancia judicial: del 20 de diciembre al 10 de enero y la Semana Santa
  (art. 146 de la Ley 270 de 1996).
"""

from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache

# Festivos que no se mueven.
FIJOS = {
    (1, 1): "Año Nuevo",
    (5, 1): "Día del Trabajo",
    (7, 20): "Día de la Independencia",
    (8, 7): "Batalla de Boyacá",
    (12, 8): "Inmaculada Concepción",
    (12, 25): "Navidad",
}

# Festivos que pasan al lunes siguiente (Ley Emiliani).
TRASLADABLES = {
    (1, 6): "Reyes Magos",
    (3, 19): "San José",
    (6, 29): "San Pedro y San Pablo",
    (8, 15): "Asunción de la Virgen",
    (10, 12): "Día de la Raza",
    (11, 1): "Todos los Santos",
    (11, 11): "Independencia de Cartagena",
}

# Días desde el domingo de Pascua: (desplazamiento, nombre, se traslada al lunes).
DE_PASCUA = (
    (-3, "Jueves Santo", False),
    (-2, "Viernes Santo", False),
    (39, "Ascensión del Señor", True),
    (60, "Corpus Christi", True),
    (68, "Sagrado Corazón", True),
)

VACANCIA_COLECTIVA = "Vacancia judicial de fin de año"
SEMANA_SANTA = "Vacancia judicial de Semana Santa"


def domingo_de_pascua(anio: int) -> date:
    """Algoritmo anónimo gregoriano (Meeus/Jones/Butcher)."""
    a = anio % 19
    b, c = divmod(anio, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 22 * m) // 451
    mes, dia = divmod(h + m - 7 * n + 114, 31)
    return date(anio, mes, dia + 1)


def _al_lunes(dia: date) -> date:
    return dia + timedelta(days=(7 - dia.weekday()) % 7)


@lru_cache(maxsize=64)
def festivos(anio: int) -> dict[date, str]:
    """Festivos nacionales de Colombia en el año."""
    resultado = {date(anio, mes, dia): nombre for (mes, dia), nombre in FIJOS.items()}
    for (mes, dia), nombre in TRASLADABLES.items():
        resultado.setdefault(_al_lunes(date(anio, mes, dia)), nombre)
    pascua = domingo_de_pascua(anio)
    for desplazamiento, nombre, trasladable in DE_PASCUA:
        dia = pascua + timedelta(days=desplazamiento)
        resultado.setdefault(_al_lunes(dia) if trasladable else dia, nombre)
    return resultado


def motivo_inhabil(dia: date) -> str | None:
    """Por qué el día no es hábil para los juzgados, o None si lo es."""
    if (dia.month == 12 and dia.day >= 20) or (dia.month == 1 and dia.day <= 10):
        return VACANCIA_COLECTIVA
    festivo = festivos(dia.year).get(dia)
    if festivo:
        return festivo
    pascua = domingo_de_pascua(dia.year)
    if pascua - timedelta(days=6) <= dia <= pascua - timedelta(days=4):
        return SEMANA_SANTA
    if dia.weekday() == 5:
        return "Sábado"
    if dia.weekday() == 6:
        return "Domingo"
    return None


@dataclass(frozen=True)
class PeriodoInhabil:
    desde: date
    hasta: date
    motivo: str


@dataclass(frozen=True)
class Termino:
    notificacion: date
    dias: int
    inicia: date
    vence: date
    inhabiles: tuple[PeriodoInhabil, ...]
    """Festivos y vacancia entre el inicio y el vencimiento (los fines de semana no se listan)."""


def calcular(notificacion: date, dias: int) -> Termino:
    """Vencimiento de un término de `dias` hábiles notificado el día `notificacion`."""
    if dias < 1:
        raise ValueError("El término debe tener al menos un día.")
    dia = notificacion
    contados = 0
    inicia: date | None = None
    inhabiles: list[PeriodoInhabil] = []
    while contados < dias:
        dia += timedelta(days=1)
        motivo = motivo_inhabil(dia)
        if motivo is None:
            contados += 1
            inicia = inicia or dia
        elif inicia is not None and motivo not in ("Sábado", "Domingo"):
            previo = inhabiles[-1] if inhabiles else None
            if previo and previo.motivo == motivo and previo.hasta == dia - timedelta(days=1):
                inhabiles[-1] = PeriodoInhabil(previo.desde, dia, motivo)
            else:
                inhabiles.append(PeriodoInhabil(dia, dia, motivo))
    assert inicia is not None
    return Termino(notificacion, dias, inicia, dia, tuple(inhabiles))
