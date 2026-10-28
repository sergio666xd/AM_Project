from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app import security
from app.nucleo.errores import DatosInvalidos
from app.nucleo.paginacion import codificar_cursor, decodificar_cursor
from app.nucleo.zona_horaria import FechaHora


def test_el_cursor_va_y_vuelve():
    assert decodificar_cursor(codificar_cursor({"id": 40})) == {"id": 40}


@pytest.mark.parametrize("cursor", ["%%%", "bm8gZXMganNvbg", "WzEsMl0"])
def test_un_cursor_que_no_es_un_objeto_se_rechaza(cursor):
    with pytest.raises(DatosInvalidos):
        decodificar_cursor(cursor)


def test_las_fechas_salen_en_hora_de_colombia():
    class Modelo(BaseModel):
        fecha: FechaHora

    sin_zona = Modelo(fecha=datetime(2026, 10, 27, 13, 20))  # UTC guardado sin zona
    assert sin_zona.model_dump(mode="json") == {"fecha": "2026-10-27T08:20:00-05:00"}
    con_zona = Modelo(fecha=datetime(2026, 10, 27, 13, 20, tzinfo=timezone.utc))
    assert con_zona.model_dump(mode="json") == {"fecha": "2026-10-27T08:20:00-05:00"}


def test_token_vigente_depende_del_ultimo_cierre_de_sesiones():
    ahora = datetime.now(timezone.utc)
    payload = security.decode_token_payload(security.create_access_token({"sub": "1"}))

    assert security.token_vigente(payload, SimpleNamespace(sesiones_cerradas_en=None))
    assert security.token_vigente(payload, SimpleNamespace(sesiones_cerradas_en=ahora - timedelta(minutes=1)))
    assert not security.token_vigente(payload, SimpleNamespace(sesiones_cerradas_en=ahora + timedelta(seconds=1)))
    # Columnas sin zona (SQLite) se leen como UTC.
    sin_zona = (ahora + timedelta(seconds=1)).replace(tzinfo=None)
    assert not security.token_vigente(payload, SimpleNamespace(sesiones_cerradas_en=sin_zona))
    # Un token anterior a este cambio (sin `emitido` ni `iat`) cae con cualquier cierre.
    assert not security.token_vigente({"sub": "1"}, SimpleNamespace(sesiones_cerradas_en=ahora))


def test_una_ruta_v2_inexistente_responde_con_el_formato_uniforme(cliente_http):
    respuesta = cliente_http.get("/api/v2/no-existe")
    assert respuesta.status_code == 404
    assert respuesta.json()["codigo"] == "no_encontrado"
