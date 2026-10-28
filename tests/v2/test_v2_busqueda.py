from app import models

RADICADO = "05266400300120250012300"


def _ids(respuesta, tipo):
    assert respuesta.status_code == 200, respuesta.text
    return [item["id"] for item in respuesta.json()["items"] if item["tipo"] == tipo]


def test_el_abogado_encuentra_proceso_cliente_y_tarea(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario()
    cliente = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    proceso = crear_proceso(abogado, "Sucesión Restrepo", clientes=[cliente], radicados=[RADICADO])
    tarea = models.Tarea(usuario_id=abogado.id, proceso_id=proceso.id, titulo="Inventario Restrepo")
    sesion_bd.add(tarea)
    sesion_bd.commit()
    iniciar(abogado)

    respuesta = cliente_http.get("/api/v2/busqueda", params={"q": "restrepo"})
    assert _ids(respuesta, "proceso") == [proceso.id]
    assert _ids(respuesta, "cliente") == [cliente.id]
    assert _ids(respuesta, "tarea") == [tarea.id]
    item = next(i for i in respuesta.json()["items"] if i["tipo"] == "proceso")
    assert item["radicado"] == RADICADO
    assert item["href"] == f"/gestion-procesos/abogado/procesos/{proceso.id}"

    por_radicado = cliente_http.get("/api/v2/busqueda", params={"q": "05266-40-03"})
    assert _ids(por_radicado, "proceso") == [proceso.id]


def test_cada_rol_solo_encuentra_lo_suyo(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    otro = crear_usuario()
    cliente = crear_usuario("CLIENTE", nombre="Claudia Ríos")
    ajeno_cliente = crear_usuario("CLIENTE", nombre="Claudia Pérez")
    suyo = crear_proceso(abogado, "Restitución Claudia", clientes=[cliente])
    crear_proceso(otro, "Ejecutivo Claudia", clientes=[ajeno_cliente])

    iniciar(abogado)
    respuesta = cliente_http.get("/api/v2/busqueda", params={"q": "claudia"})
    assert _ids(respuesta, "proceso") == [suyo.id]
    assert _ids(respuesta, "cliente") == [cliente.id]

    iniciar(cliente)
    para_cliente = cliente_http.get("/api/v2/busqueda", params={"q": "claudia"})
    assert _ids(para_cliente, "proceso") == [suyo.id]
    assert _ids(para_cliente, "cliente") == []
    assert para_cliente.json()["items"][0]["href"] == f"/gestion-procesos/cliente/procesos/{suyo.id}"


def test_un_texto_muy_corto_se_rechaza(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario())
    respuesta = cliente_http.get("/api/v2/busqueda", params={"q": "a"})
    assert respuesta.status_code == 422
    assert respuesta.json()["codigo"] == "datos_invalidos"
