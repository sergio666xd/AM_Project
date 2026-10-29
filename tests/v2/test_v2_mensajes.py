from app import models

H = {"X-AM-Solicitud": "1"}


def _sin_avisos(monkeypatch):
    avisados = []
    monkeypatch.setattr("app.modulos.mensajes.legado.avisar", lambda db, conversacion, mensaje, usuario: avisados.append(mensaje.id))
    return avisados


def _escenario(crear_usuario, crear_proceso):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    colega = crear_usuario("ABOGADO_ADMIN", nombre="Camilo Ríos")
    ajeno = crear_usuario("ABOGADO", nombre="Abogado ajeno")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    sucesion = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria], colaboradores=[(colega, False)],
                             radicados=["05001310300420240031200"])
    crear_proceso(abogada, "Archivado", clientes=[gloria], archivado=True)
    return locals()


def _por_clave(lista):
    return {c["clave"]: c for c in lista["items"]}


def test_conversaciones_y_quien_participa(iniciar, crear_usuario, crear_proceso, cliente_http, monkeypatch):
    _sin_avisos(monkeypatch)
    e = _escenario(crear_usuario, crear_proceso)
    p, g = e["sucesion"].id, e["gloria"].id
    iniciar(e["abogada"])

    lista = cliente_http.get("/api/v2/conversaciones").json()
    claves = _por_clave(lista)
    # La del proceso archivado no aparece; con cada colega de la firma hay una directa.
    assert set(claves) >= {f"process:{p}:{g}", f"process:{p}:collaborators", f"direct:{e['colega'].id}"}
    assert not any(c["proceso"] and c["proceso"]["nombre"] == "Archivado" for c in lista["items"])
    con_gloria = claves[f"process:{p}:{g}"]
    assert (con_gloria["tipo"], con_gloria["titulo"], con_gloria["contacto"]["rol"], con_gloria["ultimo"]) == (
        "cliente", "Gloria Restrepo", "cliente", None)
    equipo = claves[f"process:{p}:collaborators"]
    assert (equipo["tipo"], equipo["titulo"], equipo["contacto"], equipo["participantes"]) == ("colaboradores", "Equipo del proceso", None, 2)
    assert lista["resumen"] == {"sin_leer": 0, "por_responder": 0}

    # La clienta escribe: a la abogada le queda sin leer y por responder.
    iniciar(e["gloria"])
    suya = cliente_http.get(f"/api/v2/conversaciones/resolver?clave=process:{p}:{e['abogada'].id}", headers=H).json()
    assert suya["id"] == con_gloria["id"] and suya["titulo"] == "Alejandra Muñoz"
    escrito = cliente_http.post(f"/api/v2/conversaciones/{suya['id']}/mensajes", headers=H, json={"texto": "  ¿Cómo va?  "})
    assert escrito.status_code == 201 and escrito.json()["texto"] == "¿Cómo va?"
    assert cliente_http.get(f"/api/v2/conversaciones/resolver?clave=process:{p}:collaborators", headers=H).status_code == 403
    assert cliente_http.get(f"/api/v2/conversaciones/{equipo['id']}", headers=H).status_code == 403
    assert cliente_http.get(f"/api/v2/conversaciones/{suya['id']}/referencias", headers=H).status_code == 403

    iniciar(e["abogada"])
    lista = cliente_http.get("/api/v2/conversaciones?sincronizar=false", headers=H).json()
    primera = lista["items"][0]
    assert (primera["id"], primera["sin_leer"], primera["por_responder"]) == (con_gloria["id"], 1, True)
    assert primera["ultimo"]["texto"] == "¿Cómo va?" and primera["ultimo"]["es_mio"] is False
    assert lista["resumen"] == {"sin_leer": 1, "por_responder": 1}

    iniciar(e["ajeno"])
    assert cliente_http.get(f"/api/v2/conversaciones/{con_gloria['id']}", headers=H).status_code == 403
    assert cliente_http.get(f"/api/v2/conversaciones/resolver?clave=process:{p}:{g}", headers=H).status_code == 403


def test_hilo_enviar_con_referencia_y_leer(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    avisados = _sin_avisos(monkeypatch)
    cliente_http.headers.update(H)
    e = _escenario(crear_usuario, crear_proceso)
    p, g = e["sucesion"].id, e["gloria"].id
    iniciar(e["abogada"])
    conversacion = cliente_http.get(f"/api/v2/conversaciones/resolver?clave=process:{p}:{g}").json()
    cid = conversacion["id"]

    opciones = cliente_http.get(f"/api/v2/conversaciones/{cid}/referencias").json()
    [radicado] = [o for o in opciones if o["tipo"] == "RADICADO"]
    assert radicado["titulo"] == "05001310300420240031200"

    vacio = cliente_http.post(f"/api/v2/conversaciones/{cid}/mensajes", json={"texto": "   "})
    assert vacio.status_code == 422 and "texto" in vacio.json()["campos"]
    ajena = cliente_http.post(f"/api/v2/conversaciones/{cid}/mensajes", json={"texto": "Mire", "referencia": {"tipo": "RADICADO", "id": 999}})
    assert ajena.status_code == 404

    enviado = cliente_http.post(f"/api/v2/conversaciones/{cid}/mensajes",
                                json={"texto": "Ya radicamos", "referencia": {"tipo": "RADICADO", "id": radicado["id"]}})
    assert enviado.status_code == 201, enviado.text
    mensaje = enviado.json()
    assert mensaje["es_mio"] and mensaje["entrega"] == {"estado": "enviado", "entregados": 0, "leidos": 0, "destinatarios": 1}
    assert mensaje["referencia"]["titulo"] == "05001310300420240031200"
    assert mensaje["referencia"]["enlace"].endswith(f"/procesos/{p}/radicados#radicado-{radicado['id']}")
    # Queda como folio del expediente.
    assert mensaje["folio"] is not None
    assert sesion_bd.query(models.FolioExpediente).filter_by(proceso_id=p, tipo="mensaje", origen_id=mensaje["id"]).one().numero == mensaje["folio"]
    assert avisados == [mensaje["id"]]
    for texto in ("Dos", "Tres"):
        cliente_http.post(f"/api/v2/conversaciones/{cid}/mensajes", json={"texto": texto})

    # La clienta abre el hilo: se marca entregado; luego lo lee.
    iniciar(e["gloria"])
    hilo = cliente_http.get(f"/api/v2/conversaciones/{cid}?limite=2", headers=H).json()
    assert [m["texto"] for m in hilo["mensajes"]] == ["Dos", "Tres"] and hilo["hay_mas"]
    assert hilo["mensajes"][0]["entrega"] is None and hilo["mensajes"][0]["autor"]["nombre"] == "Alejandra Muñoz"
    assert hilo["conversacion"]["sin_leer"] == 3
    anteriores = cliente_http.get(f"/api/v2/conversaciones/{cid}?antes_de={hilo['mensajes'][0]['id']}", headers=H).json()
    assert [m["texto"] for m in anteriores["mensajes"]] == ["Ya radicamos"] and not anteriores["hay_mas"]
    assert anteriores["mensajes"][0]["referencia"]["enlace"].endswith(f"/procesos/{p}#radicado-{radicado['id']}")
    ultimo = hilo["mensajes"][-1]["id"]
    assert cliente_http.post(f"/api/v2/conversaciones/{cid}/leido", headers=H, json={"hasta": ultimo}).status_code == 204
    assert cliente_http.post(f"/api/v2/conversaciones/{cid}/leido", headers=H, json={"hasta": 999999}).status_code == 404

    iniciar(e["abogada"])
    nuevos = cliente_http.get(f"/api/v2/conversaciones/{cid}?despues_de={ultimo}", headers=H).json()
    assert nuevos["mensajes"] == [] and nuevos["conversacion"]["sin_leer"] == 0
    assert {x["entrega"]["estado"] for x in nuevos["entregas"]} == {"leido"}


def test_aviso_real_al_cliente_no_falla(iniciar, crear_usuario, crear_proceso, cliente_http):
    """Sin sustituir los avisos: push sin suscripciones y aviso por los canales del cliente."""
    cliente_http.headers.update(H)
    e = _escenario(crear_usuario, crear_proceso)
    iniciar(e["abogada"])
    cid = cliente_http.get(f"/api/v2/conversaciones/resolver?clave=process:{e['sucesion'].id}:{e['gloria'].id}").json()["id"]
    respuesta = cliente_http.post(f"/api/v2/conversaciones/{cid}/mensajes", json={"texto": "Hola, Gloria"})
    assert respuesta.status_code == 201, respuesta.text
