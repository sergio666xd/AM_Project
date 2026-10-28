from datetime import date

import pytest

from app.modulos.judicial.terminos import calcular, domingo_de_pascua, festivos, motivo_inhabil

CSRF = {"X-AM-Solicitud": "1"}


@pytest.mark.parametrize("anio, pascua", [(2025, date(2025, 4, 20)), (2026, date(2026, 4, 5)), (2027, date(2027, 3, 28))])
def test_domingo_de_pascua(anio, pascua):
    assert domingo_de_pascua(anio) == pascua


def test_festivos_de_colombia_2026():
    # Calendario oficial de 2026 (Ley 51 de 1983).
    assert sorted(festivos(2026)) == [
        date(2026, 1, 1), date(2026, 1, 12), date(2026, 3, 23), date(2026, 4, 2), date(2026, 4, 3),
        date(2026, 5, 1), date(2026, 5, 18), date(2026, 6, 8), date(2026, 6, 15), date(2026, 6, 29),
        date(2026, 7, 20), date(2026, 8, 7), date(2026, 8, 17), date(2026, 10, 12), date(2026, 11, 2),
        date(2026, 11, 16), date(2026, 12, 8), date(2026, 12, 25),
    ]


def test_vacancia_judicial():
    assert motivo_inhabil(date(2026, 12, 21)) == "Vacancia judicial de fin de año"
    assert motivo_inhabil(date(2027, 1, 8)) == "Vacancia judicial de fin de año"
    # Lunes a miércoles santos son vacancia; jueves y viernes, festivos.
    assert motivo_inhabil(date(2026, 3, 30)) == "Vacancia judicial de Semana Santa"
    assert motivo_inhabil(date(2026, 4, 2)) == "Jueves Santo"
    assert motivo_inhabil(date(2026, 10, 28)) is None


def test_el_termino_empieza_el_dia_habil_siguiente_y_salta_festivos():
    # Notificado el viernes 30 de octubre: corre desde el martes 3 (el lunes 2 es festivo).
    termino = calcular(date(2026, 10, 30), 3)
    assert termino.inicia == date(2026, 11, 3)
    assert termino.vence == date(2026, 11, 5)
    assert termino.inhabiles == ()

    termino = calcular(date(2026, 10, 28), 10)
    assert termino.vence == date(2026, 11, 12)
    assert [(p.desde, p.motivo) for p in termino.inhabiles] == [(date(2026, 11, 2), "Todos los Santos")]


def test_la_vacancia_de_fin_de_anio_suspende_el_termino():
    termino = calcular(date(2026, 12, 15), 5)
    # 16, 17 y 18 de diciembre cuentan; luego vacancia hasta el 10 y festivo de Reyes el 11.
    assert termino.vence == date(2027, 1, 13)
    assert [(p.desde, p.hasta) for p in termino.inhabiles] == [
        (date(2026, 12, 20), date(2027, 1, 10)),
        (date(2027, 1, 11), date(2027, 1, 11)),
    ]


def test_endpoint_calcular(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario())
    respuesta = cliente_http.post("/api/v2/terminos/calcular", json={"notificacion": "2026-10-28", "dias": 10}, headers=CSRF)
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json() == {
        "notificacion": "2026-10-28",
        "dias": 10,
        "inicia": "2026-10-29",
        "vence": "2026-11-12",
        "inhabiles": [{"desde": "2026-11-02", "hasta": "2026-11-02", "motivo": "Todos los Santos"}],
    }
    invalido = cliente_http.post("/api/v2/terminos/calcular", json={"notificacion": "2026-10-28", "dias": 0}, headers=CSRF)
    assert invalido.status_code == 422


def test_el_cliente_no_usa_la_calculadora(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario("CLIENTE"))
    respuesta = cliente_http.post("/api/v2/terminos/calcular", json={"notificacion": "2026-10-28", "dias": 3}, headers=CSRF)
    assert respuesta.status_code == 403
