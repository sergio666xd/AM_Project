from datetime import timedelta

from app import models
from app.timezone import utc_ahora

CSRF = {"X-AM-Solicitud": "1"}


def _actuacion(sesion_bd, proceso, orden, dia, texto):
    radicado_id = proceso.radicados[0].radicado_id
    actuacion = models.Actuacion(radicado_id=radicado_id, orden=orden, fecha_actuacion=dia, actuacion=texto, anotacion="")
    sesion_bd.add(actuacion)
    sesion_bd.commit()
    return actuacion


def _dia(hace_dias):
    return (utc_ahora() - timedelta(days=hace_dias)).date().isoformat()


def _tarea(sesion_bd, abogado, proceso, titulo, hace_dias=0):
    tarea = models.Tarea(usuario_id=abogado.id, proceso_id=proceso.id, titulo=titulo,
                         created_at=utc_ahora() - timedelta(days=hace_dias))
    sesion_bd.add(tarea)
    sesion_bd.commit()
    return tarea


def test_folia_en_orden_de_fecha_y_los_numeros_no_cambian(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", radicados=["05001311000420240031200"])
    hace_dos_dias = _dia(2)
    _actuacion(sesion_bd, proceso, 0, _dia(30), "Auto admite demanda")
    _tarea(sesion_bd, abogada, proceso, "Preparar inventario", hace_dias=10)
    _actuacion(sesion_bd, proceso, 1, hace_dos_dias, "Auto fija fecha de audiencia")
    iniciar(abogada)

    pagina = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()
    assert [(f["numero"], f["titulo"]) for f in pagina["items"]] == [
        (3, "Auto fija fecha de audiencia"),
        (2, "Preparar inventario"),
        (1, "Auto admite demanda"),
    ]
    assert pagina["ultimo"] == 3 and pagina["total"] == 3
    # Lo que ya existía al foliar por primera vez entra revisado.
    assert pagina["nuevos"] == 0 and not any(f["nuevo"] for f in pagina["items"])
    actuacion = pagina["items"][0]
    assert actuacion["autor"] == "Rama Judicial"
    assert actuacion["con_hora"] is False
    assert actuacion["fecha"] == f"{hace_dos_dias}T00:00:00-05:00"

    # Una actuación con fecha anterior que llega después toma el siguiente número.
    _actuacion(sesion_bd, proceso, 2, _dia(60), "Constancia secretarial")
    pagina = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()
    assert pagina["items"][0]["numero"] == 4
    assert pagina["items"][0]["titulo"] == "Constancia secretarial"
    assert pagina["items"][0]["nuevo"] is True
    assert [f["numero"] for f in pagina["items"][1:]] == [3, 2, 1]


def test_filtra_por_grupo_pagina_y_salta_a_un_folio(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario()
    proceso = crear_proceso(abogado, radicados=["05001311000420240031200"])
    for n in range(5):
        _tarea(sesion_bd, abogado, proceso, f"Tarea {n}", hace_dias=20 - n)
    _actuacion(sesion_bd, proceso, 0, "2026-01-01", "Auto admite demanda")
    iniciar(abogado)

    actuaciones = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios", params={"grupo": "actuaciones"}).json()
    assert [f["tipo"] for f in actuaciones["items"]] == ["actuacion"]
    assert actuaciones["total"] == 1 and actuaciones["ultimo"] == 6

    primera = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios", params={"limite": 2}).json()
    assert [f["numero"] for f in primera["items"]] == [6, 5]
    segunda = cliente_http.get(
        f"/api/v2/procesos/{proceso.id}/folios", params={"limite": 2, "cursor": primera["siguiente"]},
    ).json()
    assert [f["numero"] for f in segunda["items"]] == [4, 3]

    salto = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios", params={"desde": 3, "limite": 2}).json()
    assert [f["numero"] for f in salto["items"]] == [3, 2]
    antiguos = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios", params={"orden": "antiguos", "limite": 2}).json()
    assert [f["numero"] for f in antiguos["items"]] == [1, 2]


def test_folios_nuevos_y_revisar(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Restitución Cardona", clientes=[cliente], radicados=["05631408900120250008700"])
    otro = crear_proceso(abogada, "Divorcio Ospina", radicados=["05001311001020250120400"])
    iniciar(abogada)
    assert cliente_http.get("/api/v2/folios/nuevos").json() == {"items": [], "total": 0}

    # Primera foliación hecha (vacía); ahora llegan cosas de fuera y de la firma.
    _tarea(sesion_bd, abogada, proceso, "Tarea creada por la abogada")
    _actuacion(sesion_bd, proceso, 0, "2026-10-27", "Auto inadmite demanda")
    _actuacion(sesion_bd, otro, 0, "2026-10-26", "Traslado de excepciones")
    nuevos = cliente_http.get("/api/v2/folios/nuevos").json()
    assert nuevos["total"] == 2
    assert {(f["proceso"]["nombre"], f["titulo"]) for f in nuevos["items"]} == {
        ("Restitución Cardona", "Auto inadmite demanda"),
        ("Divorcio Ospina", "Traslado de excepciones"),
    }

    folio = next(f for f in nuevos["items"] if f["proceso"]["id"] == proceso.id)
    revisado = cliente_http.post(f"/api/v2/procesos/{proceso.id}/folios/revisar", json={"numeros": [folio["numero"]]}, headers=CSRF)
    assert revisado.json() == {"revisados": 1}
    assert cliente_http.get("/api/v2/folios/nuevos").json()["total"] == 1

    todos = cliente_http.post(f"/api/v2/procesos/{otro.id}/folios/revisar", headers=CSRF)
    assert todos.json() == {"revisados": 1}
    assert cliente_http.get("/api/v2/folios/nuevos").json()["total"] == 0


def test_un_registro_borrado_conserva_su_folio(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario()
    proceso = crear_proceso(abogado)
    tarea = _tarea(sesion_bd, abogado, proceso, "Se va a borrar", hace_dias=2)
    _tarea(sesion_bd, abogado, proceso, "Se queda", hace_dias=1)
    iniciar(abogado)
    assert cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["ultimo"] == 2

    sesion_bd.delete(sesion_bd.get(models.Tarea, tarea.id))
    sesion_bd.commit()
    folios = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"]
    assert [(f["numero"], f["retirado"]) for f in folios] == [(2, False), (1, True)]


def test_el_cliente_y_los_ajenos_no_ven_folios(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    ajeno = crear_usuario()
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogado, clientes=[cliente])

    iniciar(cliente)
    assert cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").status_code == 403
    assert cliente_http.get("/api/v2/folios/nuevos").status_code == 403

    iniciar(ajeno)
    respuesta = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios")
    assert respuesta.status_code == 404
    assert respuesta.json()["codigo"] == "no_encontrado"
    revisar = cliente_http.post(f"/api/v2/procesos/{proceso.id}/folios/revisar", headers=CSRF)
    assert revisar.status_code == 404


def test_avisar_al_cliente_de_una_actuacion(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = []
    monkeypatch.setattr(
        "app.notification_service.emitir_notificacion_workflow",
        lambda db, usuario, tipo, origen, asunto, cuerpo, **kw: enviados.append((usuario.id, tipo, kw["variables"]["comentarios"])),
    )
    abogada = crear_usuario("ABOGADO_ADMIN")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    hernan = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    proceso = crear_proceso(abogada, clientes=[gloria, hernan], radicados=["05001311000420240031200"])
    iniciar(abogada)
    cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios")
    _actuacion(sesion_bd, proceso, 0, _dia(1), "Auto fija fecha de audiencia")
    _tarea(sesion_bd, abogada, proceso, "Preparar audiencia")
    folios = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"]
    actuacion = next(f for f in folios if f["tipo"] == "actuacion")
    tarea = next(f for f in folios if f["tipo"] == "tarea")
    assert actuacion["nuevo"] is True

    url = f"/api/v2/procesos/{proceso.id}/folios/{actuacion['numero']}/avisar"
    respuesta = cliente_http.post(url, json={"comentarios": "La audiencia es el 12 de noviembre.", "cliente_ids": [gloria.id]}, headers=CSRF)
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json() == {"clientes": [{"id": gloria.id, "nombre": "Gloria Restrepo"}]}
    assert enviados == [(gloria.id, "ACTUACIONES", "La audiencia es el 12 de noviembre.")]

    folios = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"]
    assert next(f for f in folios if f["numero"] == actuacion["numero"])["nuevo"] is False
    # El aviso queda como folio del expediente.
    assert folios[0]["tipo"] == "aviso" and folios[0]["detalle"] == "La audiencia es el 12 de noviembre."

    todos = cliente_http.post(url, json={"comentarios": "Recordatorio."}, headers=CSRF)
    assert {c["id"] for c in todos.json()["clientes"]} == {gloria.id, hernan.id}

    ajeno = crear_usuario("CLIENTE")
    con_ajeno = cliente_http.post(url, json={"comentarios": "x", "cliente_ids": [ajeno.id]}, headers=CSRF)
    assert con_ajeno.status_code == 400 and "cliente_ids" in con_ajeno.json()["campos"]
    no_actuacion = cliente_http.post(
        f"/api/v2/procesos/{proceso.id}/folios/{tarea['numero']}/avisar", json={"comentarios": "x"}, headers=CSRF,
    )
    assert no_actuacion.json()["codigo"] == "folio_no_avisable"
    assert cliente_http.post(f"/api/v2/procesos/{proceso.id}/folios/99/avisar", json={"comentarios": "x"}, headers=CSRF).status_code == 404


def test_crear_tarea_desde_un_folio(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    proceso = crear_proceso(abogada, radicados=["05001311000420240031200"])
    iniciar(abogada)
    cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios")
    actuacion = _actuacion(sesion_bd, proceso, 0, _dia(1), "Traslado de excepciones")
    numero = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"][0]["numero"]

    vence = (utc_ahora() + timedelta(days=10)).date().isoformat()
    respuesta = cliente_http.post(
        f"/api/v2/procesos/{proceso.id}/folios/{numero}/tarea",
        json={"titulo": "Descorrer traslado", "fecha_limite": vence, "prioridad": "ALTA"},
        headers=CSRF,
    )
    assert respuesta.status_code == 201, respuesta.text
    creada = respuesta.json()
    assert creada["titulo"] == "Descorrer traslado"
    assert creada["fecha_limite"] == f"{vence}T23:59:00-05:00"

    tarea = sesion_bd.get(models.Tarea, creada["id"])
    assert (tarea.proceso_id, tarea.actuacion_id, tarea.usuario_id) == (proceso.id, actuacion.id, abogada.id)
    assert tarea.prioridad == models.PrioridadTarea.ALTA
    assert f"folio {numero}" in tarea.descripcion
    folios = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"]
    assert folios[0]["titulo"] == "Descorrer traslado"
    assert next(f for f in folios if f["numero"] == numero)["nuevo"] is False

    pasada = cliente_http.post(
        f"/api/v2/procesos/{proceso.id}/folios/{numero}/tarea", json={"titulo": "Tarde", "fecha_limite": "2020-01-01"}, headers=CSRF,
    )
    assert pasada.status_code == 400 and "fecha_limite" in pasada.json()["campos"]
