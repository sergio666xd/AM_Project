from app import security
from app.nucleo.config import ajustes

PASSWORD = "Clave-de-prueba-1"
CSRF = {"X-AM-Solicitud": "1"}
COOKIE = ajustes().cookie_sesion


def _set_cookie(respuesta) -> str:
    return respuesta.headers.get("set-cookie", "")


def test_iniciar_sesion_deja_cookie_httponly_y_devuelve_el_usuario(iniciar, crear_usuario, cliente_http):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")

    respuesta = iniciar(abogada)

    cuerpo = respuesta.json()
    assert cuerpo["nombre"] == "Alejandra Muñoz"
    assert cuerpo["rol"] == "ABOGADO_ADMIN"
    assert cuerpo["debe_cambiar_password"] is False
    assert cuerpo["ultimo_acceso"].endswith("-05:00")
    cookie = _set_cookie(respuesta).lower()
    assert f"{COOKIE}=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert "max-age=" in cookie  # "recordarme" por defecto

    actual = cliente_http.get("/api/v2/sesion")
    assert actual.status_code == 200
    assert actual.json()["id"] == abogada.id


def test_sin_recordarme_la_cookie_dura_lo_que_el_navegador(iniciar, crear_usuario):
    respuesta = iniciar(crear_usuario(), recordarme=False)
    assert "max-age" not in _set_cookie(respuesta).lower()


def test_el_correo_no_distingue_mayusculas(cliente_http, crear_usuario):
    usuario = crear_usuario()
    respuesta = cliente_http.post(
        "/api/v2/sesion", json={"email": f"  {usuario.email.upper()} ", "password": PASSWORD}
    )
    assert respuesta.status_code == 200


def test_credenciales_incorrectas_responden_con_el_formato_uniforme(cliente_http, crear_usuario):
    usuario = crear_usuario()
    respuesta = cliente_http.post("/api/v2/sesion", json={"email": usuario.email, "password": "otra"})
    assert respuesta.status_code == 401
    assert respuesta.json() == {
        "codigo": "credenciales_invalidas",
        "mensaje": "Correo o contraseña incorrectos.",
        "campos": {},
    }


def test_los_intentos_fallidos_se_limitan_por_correo(cliente_http, crear_usuario):
    usuario = crear_usuario()
    for _ in range(10):
        assert cliente_http.post(
            "/api/v2/sesion", json={"email": usuario.email, "password": "otra"}
        ).status_code == 401
    bloqueado = cliente_http.post("/api/v2/sesion", json={"email": usuario.email, "password": PASSWORD})
    assert bloqueado.status_code == 429
    assert bloqueado.json()["codigo"] == "demasiados_intentos"


def test_cuenta_pendiente_no_inicia_sesion(cliente_http, crear_usuario):
    usuario = crear_usuario(estado="PENDIENTE_APROBACION")
    respuesta = cliente_http.post("/api/v2/sesion", json={"email": usuario.email, "password": PASSWORD})
    assert respuesta.status_code == 403
    assert respuesta.json()["codigo"] == "cuenta_pendiente"


def test_datos_invalidos_se_reportan_por_campo(cliente_http):
    respuesta = cliente_http.post("/api/v2/sesion", json={"email": "sin-arroba", "password": ""})
    assert respuesta.status_code == 422
    cuerpo = respuesta.json()
    assert cuerpo["codigo"] == "datos_invalidos"
    assert set(cuerpo["campos"]) == {"email", "password"}
    assert cuerpo["campos"]["email"] == "Escribe un correo válido."


def test_sin_sesion_responde_401(cliente_http):
    respuesta = cliente_http.get("/api/v2/sesion")
    assert respuesta.status_code == 401
    assert respuesta.json()["codigo"] == "no_autenticado"


def test_contrasena_temporal_permite_ver_la_sesion_pero_no_trabajar(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario(debe_cambiar_password=True))

    assert cliente_http.get("/api/v2/sesion").json()["debe_cambiar_password"] is True
    respuesta = cliente_http.get("/api/v2/procesos")
    assert respuesta.status_code == 403
    assert respuesta.json()["codigo"] == "cambio_password_requerido"


def test_cambios_con_cookie_exigen_el_encabezado_csrf(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    proceso = crear_proceso(abogado)
    iniciar(abogado)

    sin_encabezado = cliente_http.post(f"/api/v2/procesos/{proceso.id}/archivar")
    assert sin_encabezado.status_code == 403
    assert sin_encabezado.json()["codigo"] == "csrf"

    con_encabezado = cliente_http.post(f"/api/v2/procesos/{proceso.id}/archivar", headers=CSRF)
    assert con_encabezado.status_code == 200


def test_con_token_bearer_no_hace_falta_el_encabezado_csrf(crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    proceso = crear_proceso(abogado)
    token = security.create_access_token({"sub": str(abogado.id)})

    respuesta = cliente_http.post(
        f"/api/v2/procesos/{proceso.id}/archivar", headers={"Authorization": f"Bearer {token}"}
    )
    assert respuesta.status_code == 200


def test_un_enlace_de_recuperacion_no_sirve_como_sesion(crear_usuario, cliente_http):
    usuario = crear_usuario()
    token = security.create_password_reset_token(usuario.id, usuario.password_hash)
    cabecera = {"Authorization": f"Bearer {token}"}

    assert cliente_http.get("/api/v2/sesion", headers=cabecera).status_code == 401
    assert cliente_http.get("/api/auth/me", headers=cabecera).status_code == 401


def test_renovar_emite_otra_cookie_y_conserva_recordarme(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario(), recordarme=True)
    renovada = cliente_http.post("/api/v2/sesion/renovar", headers=CSRF)
    assert renovada.status_code == 200
    assert "max-age=" in _set_cookie(renovada).lower()

    iniciar(crear_usuario(), recordarme=False)
    renovada = cliente_http.post("/api/v2/sesion/renovar", headers=CSRF)
    assert "max-age" not in _set_cookie(renovada).lower()


def test_cerrar_sesion_borra_la_cookie(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario())
    respuesta = cliente_http.delete("/api/v2/sesion", headers=CSRF)
    assert respuesta.status_code == 204
    assert cliente_http.get("/api/v2/sesion").status_code == 401


def test_cerrar_todas_invalida_los_tokens_anteriores_tambien_en_v1(iniciar, crear_usuario, cliente_http, sesion_bd):
    usuario = crear_usuario()
    token_anterior = security.create_access_token({"sub": str(usuario.id)})
    iniciar(usuario)

    assert cliente_http.delete("/api/v2/sesion/todas", headers=CSRF).status_code == 204

    cabecera = {"Authorization": f"Bearer {token_anterior}"}
    assert cliente_http.get("/api/v2/sesion", headers=cabecera).status_code == 401
    assert cliente_http.get("/api/auth/me", headers=cabecera).status_code == 401
    # Una sesión nueva funciona.
    iniciar(usuario)
    assert cliente_http.get("/api/v2/sesion").status_code == 200


def test_el_login_de_v1_tambien_deja_la_cookie(cliente_http, crear_usuario):
    usuario = crear_usuario()
    respuesta = cliente_http.post(
        "/api/auth/login", data={"username": usuario.email, "password": PASSWORD, "remember_me": "false"}
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["access_token"]
    assert f"{COOKIE}=" in _set_cookie(respuesta)
    assert cliente_http.get("/api/v2/sesion").json()["id"] == usuario.id


def test_v1_conserva_su_formato_de_error(cliente_http):
    respuesta = cliente_http.get("/api/auth/me")
    assert respuesta.status_code == 401
    assert "detail" in respuesta.json()
