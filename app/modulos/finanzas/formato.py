"""Cómo se leen los importes, las fechas y los estados en PDF y correos."""

from datetime import date
from decimal import Decimal

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")
DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
METODOS = {"TRANSFERENCIA": "transferencia", "CONSIGNACION": "consignación", "EFECTIVO": "efectivo", "OTRO": "otro medio"}
ESTADOS = {"borrador": "Borrador", "pendiente": "Pendiente", "parcial": "Con abonos", "pagada": "Pagada", "anulada": "Anulada"}
NOTA_POR_DEFECTO = "Este documento es una cuenta de cobro. No es una factura electrónica ni un título valor."


def pesos(valor: int | Decimal) -> str:
    """$1.250.000"""
    entero = int(Decimal(valor).quantize(Decimal("1")))
    signo = "-" if entero < 0 else ""
    return f"{signo}${abs(entero):,}".replace(",", ".")


_UNIDADES = ("", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
             "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
             "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS",
             "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE")
_DECENAS = ("", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA")
_CENTENAS = ("", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS",
             "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS")


def _hasta_mil(n: int, apocope: bool) -> str:
    """0–999 en letras. `apocope`: «UN»/«VEINTIÚN» en vez de «UNO»/«VEINTIUNO» (antes de MIL o MILLONES)."""
    if n == 100:
        return "CIEN"
    centenas, resto = divmod(n, 100)
    if resto < 30:
        menor = _UNIDADES[resto]
    else:
        decenas, unidades = divmod(resto, 10)
        menor = _DECENAS[decenas] + (f" Y {_UNIDADES[unidades]}" if unidades else "")
    if apocope and menor.endswith("UNO"):
        menor = menor[:-3] + ("ÚN" if menor == "VEINTIUNO" else "UN")
    return " ".join(parte for parte in (_CENTENAS[centenas], menor) if parte)


def _hasta_millon(n: int, apocope: bool) -> str:
    miles, resto = divmod(n, 1000)
    partes = []
    if miles:
        partes.append("MIL" if miles == 1 else f"{_hasta_mil(miles, True)} MIL")
    if resto:
        partes.append(_hasta_mil(resto, apocope))
    return " ".join(partes)


def en_letras(valor: int) -> str:
    """1250000 → «UN MILLÓN DOSCIENTOS CINCUENTA MIL». Hasta 999.999.999.999."""
    n = abs(int(valor))
    if n == 0:
        return "CERO"
    millones, resto = divmod(n, 1_000_000)
    partes = []
    if millones:
        partes.append("UN MILLÓN" if millones == 1 else f"{_hasta_millon(millones, True)} MILLONES")
    if resto:
        partes.append(_hasta_millon(resto, False))
    return ("MENOS " if valor < 0 else "") + " ".join(partes)


def pesos_en_letras(valor: int | Decimal) -> str:
    """100000 → «CIEN MIL PESOS»; 1000000 → «UN MILLÓN DE PESOS»; 1 → «UN PESO»."""
    entero = int(Decimal(valor).quantize(Decimal("1")))
    if abs(entero) == 1:
        return ("MENOS " if entero < 0 else "") + "UN PESO"
    letras = en_letras(entero)
    if letras.endswith("UNO"):
        letras = letras[:-3] + ("ÚN" if letras.endswith("VEINTIUNO") else "UN")
    de = " DE" if entero and abs(entero) % 1_000_000 == 0 else ""
    return f"{letras}{de} PESOS"


def suma(valor: int | Decimal) -> str:
    """$100.000 (CIEN MIL PESOS)"""
    return f"{pesos(valor)} ({pesos_en_letras(valor)})"


def dia_largo(dia: date) -> str:
    """viernes 20 de noviembre de 2026"""
    return f"{DIAS[dia.weekday()]} {dia.day} de {MESES[dia.month - 1]} de {dia.year}"


def dia_corto(dia: date) -> str:
    return f"{dia.day:02d}/{dia.month:02d}/{dia.year}"
