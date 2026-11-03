from app import models, security
from app.modulos.cuenta.servicio import ServicioCuenta

H = {"X-AM-Solicitud": "1"}


def _capturar_codigos(monkeypatch):
    enviados = []

    def enviar(self, usuario, canal, codigo):
        enviados.append((usuario.id, canal, codigo))
        return True

    monkeypatch.setattr(ServicioCuenta, "_enviar_codigo", enviar)
    monkeypatch.setattr("app.modulos.cuenta.servicio.send_security_change_confirmation", lambda *a, **k: None)
    return enviados


def _vencer_espera(sesion_bd, codigo_id):
    from datetime import timedelta

    codigo = sesion_bd.get(models.CodigoSeguridadUsuario, codigo_id)
    codigo.reenviar_desde = codigo.reenviar_desde - timedelta(minutes=2)
    sesion_bd.commit()


def test_datos_y_avisos_de_la_cuenta(iniciar, crear_usuario, cliente_http):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    iniciar(abogada)
    cuenta = cliente_http.get("/api/v2/cuenta").json()
    assert cuenta["nombre"] == "Alejandra Muñoz" and cuenta["rol"] == "ABOGADO_ADMIN"
    assert [a["clave"] for a in cuenta["avisos"]][:2] == ["ACCESO", "ACTUACIONES"]

    cambio = cliente_http.patch("/api/v2/cuenta", json={"nombre": "  Alejandra   Muñoz Ríos ", "numero_documento": "1.234.567", "genero": "FEMENINO"}, headers=H)
    assert cambio.status_code == 200
    assert (cambio.json()["nombre"], cambio.json()["numero_documento"], cambio.json()["genero"]) == ("Alejandra Muñoz Ríos", "1234567", "FEMENINO")
    assert cliente_http.patch("/api/v2/cuenta", json={"nombre": "  "}, headers=H).status_code == 422

    avisos = cliente_http.put("/api/v2/cuenta/avisos", json={"tipos": {"TAREAS": {"correo": False, "whatsapp": True}}, "silenciar_correo_si_push": True}, headers=H).json()
    tareas = next(a for a in avisos["avisos"] if a["clave"] == "TAREAS")
    assert (tareas["correo"], tareas["whatsapp"], avisos["silenciar_correo_si_push"]) == (False, True, True)
    assert cliente_http.put("/api/v2/cuenta/avisos", json={"tipos": {"OTRO": {"correo": True, "whatsapp": False}}}, headers=H).status_code == 422

    cliente = crear_usuario("CLIENTE")
    iniciar(cliente)
    assert cliente_http.get("/api/v2/cuenta").json()["avisos"] == []
    assert cliente_http.patch("/api/v2/cuenta", json={"nombre": "Otro"}, headers=H).status_code == 403
    assert cliente_http.put("/api/v2/cuenta/avisos", json={"tipos": {}}, headers=H).status_code == 403


def test_cambiar_correo_con_codigo(iniciar, crear_usuario, cliente_http, sesion_bd, monkeypatch):
    enviados = _capturar_codigos(monkeypatch)
    abogada, otra = crear_usuario("ABOGADO_ADMIN"), crear_usuario("ABOGADO")
    otra.email = "ocupado@example.com"
    sesion_bd.commit()
    iniciar(abogada)

    codigo = cliente_http.post("/api/v2/cuenta/codigos", json={"accion": "email", "canal": "correo"}, headers=H)
    assert codigo.status_code == 201
    codigo = codigo.json()
    assert codigo["canal"] == "correo" and codigo["destino"].endswith("@example.test") and not codigo["verificado"]
    assert cliente_http.get("/api/v2/cuenta/codigos/activo", params={"accion": "email"}).json()["id"] == codigo["id"]
    assert cliente_http.get("/api/v2/cuenta/codigos/activo", params={"accion": "password"}).json() is None
    # Pedir otro enseguida no se permite.
    assert cliente_http.post("/api/v2/cuenta/codigos", json={"accion": "email", "canal": "correo"}, headers=H).status_code == 429

    # Sin verificar no se aplica.
    assert cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/aplicar", json={"valor": "nuevo@example.test"}, headers=H).status_code == 403
    errado = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/verificar", json={"codigo": "000000" if enviados[-1][2] != "000000" else "111111"}, headers=H)
    assert errado.status_code == 422 and "4 intentos" in errado.json()["mensaje"]

    _vencer_espera(sesion_bd, codigo["id"])
    reenviado = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/reenviar", json={"canal": "whatsapp"}, headers=H).json()
    assert reenviado["canal"] == "whatsapp" and reenviado["destino"] == "••• 0000"
    assert enviados[-1][1] == "WHATSAPP"

    verificado = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/verificar", json={"codigo": enviados[-1][2]}, headers=H)
    assert verificado.json()["verificado"] is True
    ocupado = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/aplicar", json={"valor": otra.email.upper()}, headers=H)
    assert ocupado.status_code == 409
    aplicado = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/aplicar", json={"valor": "Nueva@Example.com"}, headers=H)
    assert aplicado.status_code == 200 and aplicado.json()["email"] == "nueva@example.com"
    # El código ya se usó.
    assert cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/aplicar", json={"valor": "x@example.com"}, headers=H).status_code == 410


def test_cambiar_contrasena_y_agotar_intentos(iniciar, crear_usuario, cliente_http, sesion_bd, monkeypatch):
    enviados = _capturar_codigos(monkeypatch)
    cliente = crear_usuario("CLIENTE")
    iniciar(cliente)
    codigo = cliente_http.post("/api/v2/cuenta/codigos", json={"accion": "password", "canal": "correo"}, headers=H).json()
    malo = "000000" if enviados[-1][2] != "000000" else "111111"
    for _ in range(5):
        cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/verificar", json={"codigo": malo}, headers=H)
    agotado = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/verificar", json={"codigo": enviados[-1][2]}, headers=H)
    assert agotado.status_code == 429

    _vencer_espera(sesion_bd, codigo["id"])
    codigo = cliente_http.post("/api/v2/cuenta/codigos", json={"accion": "password", "canal": "correo"}, headers=H).json()
    cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/verificar", json={"codigo": enviados[-1][2]}, headers=H)
    mala = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/aplicar", json={"contrasena_actual": "otra", "contrasena_nueva": "Nueva-clave-1"}, headers=H)
    assert mala.status_code == 422 and mala.json()["campos"] == {"contrasena_actual": "No es correcta."}
    from tests.v2.conftest import PASSWORD

    ok = cliente_http.post(f"/api/v2/cuenta/codigos/{codigo['id']}/aplicar", json={"contrasena_actual": PASSWORD, "contrasena_nueva": "Nueva-clave-1"}, headers=H)
    assert ok.status_code == 200
    sesion_bd.refresh(cliente)
    assert security.verify_password("Nueva-clave-1", cliente.password_hash)

    otro = cliente_http.post("/api/v2/cuenta/codigos", json={"accion": "whatsapp", "canal": "correo"}, headers=H).json()
    assert cliente_http.delete(f"/api/v2/cuenta/codigos/{otro['id']}", headers=H).status_code == 204
    assert cliente_http.get("/api/v2/cuenta/codigos/activo", params={"accion": "whatsapp"}).json() is None


def test_revisar_cambios_de_datos_de_clientes(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada, ajena = crear_usuario("ABOGADO_ADMIN"), crear_usuario("ABOGADO")
    gloria, pedro = crear_usuario("CLIENTE", nombre="Gloria Restrepo"), crear_usuario("CLIENTE", nombre="Pedro Gómez")
    crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria, pedro])
    pedido = models.SolicitudEdicionPerfilCliente(
        cliente_id=gloria.id, email_solicitado=gloria.email, nombre_completo_solicitado="Gloria Inés Restrepo",
        whatsapp_numero_solicitado="3001112233", domicilio_solicitado="Medellín",
    )
    otro = models.SolicitudEdicionPerfilCliente(
        cliente_id=pedro.id, email_solicitado=gloria.email, nombre_completo_solicitado="Pedro Gómez",
        whatsapp_numero_solicitado="3000000000",
    )
    sesion_bd.add_all([pedido, otro])
    sesion_bd.commit()

    iniciar(ajena)
    assert cliente_http.get("/api/v2/cambios-perfil").json()["items"] == []
    assert cliente_http.post(f"/api/v2/cambios-perfil/{pedido.id}/aprobar", json={}, headers=H).status_code == 404

    iniciar(abogada)
    items = cliente_http.get("/api/v2/cambios-perfil").json()["items"]
    assert [i["cliente"] for i in items] == ["Gloria Restrepo", "Pedro Gómez"]
    assert items[0]["procesos"] == [{"id": items[0]["procesos"][0]["id"], "nombre": "Sucesión Restrepo"}]
    assert [d["campo"] for d in items[0]["diferencias"]] == ["nombre", "whatsapp", "domicilio"]

    assert cliente_http.post(f"/api/v2/cambios-perfil/{otro.id}/aprobar", json={}, headers=H).status_code == 409
    assert cliente_http.post(f"/api/v2/cambios-perfil/{otro.id}/rechazar", json={"comentario": " "}, headers=H).status_code == 422
    assert cliente_http.post(f"/api/v2/cambios-perfil/{otro.id}/rechazar", json={"comentario": "Ese correo es de Gloria."}, headers=H).status_code == 204
    assert cliente_http.post(f"/api/v2/cambios-perfil/{pedido.id}/aprobar", json={}, headers=H).status_code == 204
    sesion_bd.refresh(gloria)
    assert (gloria.nombre_completo, gloria.whatsapp_numero, gloria.domicilio) == ("Gloria Inés Restrepo", "3001112233", "Medellín")
    assert cliente_http.get("/api/v2/cambios-perfil").json()["items"] == []
