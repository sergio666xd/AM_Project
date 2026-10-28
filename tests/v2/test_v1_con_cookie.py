"""La API v1 acepta la cookie de sesión mientras las pantallas pasan a la v2."""

from tests.v2.conftest import PASSWORD

CSRF = {"X-AM-Solicitud": "1"}


def test_v1_lee_la_cookie_cuando_no_hay_encabezado(iniciar, crear_usuario, cliente_http):
    abogado = crear_usuario()
    iniciar(abogado)

    respuesta = cliente_http.get("/api/auth/me")
    assert respuesta.status_code == 200
    assert respuesta.json()["id"] == abogado.id


def test_el_marcador_de_las_pantallas_viejas_cae_en_la_cookie(iniciar, crear_usuario, cliente_http):
    abogado = crear_usuario()
    iniciar(abogado)

    for valor in ("Bearer cookie", "Bearer ", "Bearer null"):
        respuesta = cliente_http.get("/api/auth/me", headers={"Authorization": valor})
        assert respuesta.status_code == 200, valor


def test_sin_cookie_ni_token_v1_responde_401(cliente_http):
    assert cliente_http.get("/api/auth/me").status_code == 401
    assert cliente_http.get("/api/auth/me", headers={"Authorization": "Bearer cookie"}).status_code == 401


def test_un_cambio_v1_con_cookie_exige_un_encabezado_propio(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario())
    datos = {"notificaciones_email": False}

    sin_encabezado = cliente_http.patch("/api/auth/preferencias-notificaciones", json=datos)
    assert sin_encabezado.status_code == 403
    assert cliente_http.patch("/api/auth/preferencias-notificaciones", json=datos, headers=CSRF).status_code == 200
    # `Authorization` también obliga a la verificación CORS del navegador.
    con_marcador = cliente_http.patch(
        "/api/auth/preferencias-notificaciones", json=datos, headers={"Authorization": "Bearer cookie"},
    )
    assert con_marcador.status_code == 200


def test_renovar_y_cambiar_la_clave_temporal_renuevan_la_cookie(crear_usuario, cliente_http):
    usuario = crear_usuario(debe_cambiar_password=True)
    cliente_http.post("/api/v2/sesion", json={"email": usuario.email, "password": PASSWORD})
    anterior = cliente_http.cookies.get("am_sesion")

    cambio = cliente_http.post(
        "/api/auth/cambiar-password",
        json={"password_actual": PASSWORD, "password_nueva": "Otra-clave-segura-2"},
        headers=CSRF,
    )
    assert cambio.status_code == 200, cambio.text
    despues_del_cambio = cliente_http.cookies.get("am_sesion")
    assert despues_del_cambio and despues_del_cambio != anterior

    renovado = cliente_http.post("/api/auth/refresh-token", headers=CSRF)
    assert renovado.status_code == 200
    assert cliente_http.cookies.get("am_sesion") == renovado.json()["access_token"]
