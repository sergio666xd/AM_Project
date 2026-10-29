CSRF = {"X-AM-Solicitud": "1"}


def test_cambiar_etapa_guarda_historial_y_folio(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente])
    iniciar(abogada)
    assert cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()["etapa"] is None

    url = f"/api/v2/procesos/{proceso.id}/etapa"
    assert cliente_http.patch(url, json={"etapa": "demanda"}, headers=CSRF).status_code == 200
    detalle = cliente_http.patch(url, json={"etapa": "admision", "nota": "Auto admisorio del 27 de octubre."}, headers=CSRF).json()
    assert detalle["etapa"] == "admision"
    assert [(e["etapa"], e["nota"], e["autor"]) for e in detalle["etapas"]] == [
        ("demanda", None, "Alejandra Muñoz"),
        ("admision", "Auto admisorio del 27 de octubre.", "Alejandra Muñoz"),
    ]
    assert cliente_http.get("/api/v2/procesos").json()["items"][0]["etapa"] == "admision"

    repetida = cliente_http.patch(url, json={"etapa": "admision"}, headers=CSRF)
    assert repetida.status_code == 409 and repetida.json()["codigo"] == "misma_etapa"
    assert cliente_http.patch(url, json={"etapa": "casacion"}, headers=CSRF).status_code == 422

    folio = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"][0]
    assert folio["tipo"] == "etapa"
    assert folio["titulo"] == "El proceso pasa a la etapa de admisión"
    assert folio["nuevo"] is False

    # El cliente ve la etapa y las fechas, no las notas internas; tampoco puede cambiarla.
    iniciar(cliente)
    visto = cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()
    assert visto["etapa"] == "admision" and [e["nota"] for e in visto["etapas"]] == [None, None]
    assert cliente_http.patch(url, json={"etapa": "pruebas"}, headers=CSRF).status_code == 403


def test_solo_quien_ve_el_proceso_cambia_la_etapa(iniciar, crear_usuario, crear_proceso, cliente_http):
    responsable = crear_usuario()
    colaboradora = crear_usuario("ABOGADO_ADMIN")
    ajeno = crear_usuario()
    proceso = crear_proceso(responsable, colaboradores=[(colaboradora, False)])

    iniciar(colaboradora)
    assert cliente_http.patch(f"/api/v2/procesos/{proceso.id}/etapa", json={"etapa": "pruebas"}, headers=CSRF).status_code == 200
    iniciar(ajeno)
    assert cliente_http.patch(f"/api/v2/procesos/{proceso.id}/etapa", json={"etapa": "audiencia"}, headers=CSRF).status_code == 404
