import pytest

from app.modulos.finanzas.formato import pesos_en_letras, suma


@pytest.mark.parametrize(("valor", "letras"), [
    (0, "CERO PESOS"),
    (1, "UN PESO"),
    (21, "VEINTIÚN PESOS"),
    (100, "CIEN PESOS"),
    (115, "CIENTO QUINCE PESOS"),
    (1_000, "MIL PESOS"),
    (21_000, "VEINTIÚN MIL PESOS"),
    (31_500, "TREINTA Y UN MIL QUINIENTOS PESOS"),
    (100_000, "CIEN MIL PESOS"),
    (999_999, "NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS"),
    (1_000_000, "UN MILLÓN DE PESOS"),
    (1_250_000, "UN MILLÓN DOSCIENTOS CINCUENTA MIL PESOS"),
    (2_000_000, "DOS MILLONES DE PESOS"),
    (21_000_000, "VEINTIÚN MILLONES DE PESOS"),
    (1_500_000_000, "MIL QUINIENTOS MILLONES DE PESOS"),
])
def test_pesos_en_letras(valor, letras):
    assert pesos_en_letras(valor) == letras


def test_suma_junta_cifra_y_letras():
    assert suma(100_000) == "$100.000 (CIEN MIL PESOS)"
