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


def dia_largo(dia: date) -> str:
    """viernes 20 de noviembre de 2026"""
    return f"{DIAS[dia.weekday()]} {dia.day} de {MESES[dia.month - 1]} de {dia.year}"


def dia_corto(dia: date) -> str:
    return f"{dia.day:02d}/{dia.month:02d}/{dia.year}"
