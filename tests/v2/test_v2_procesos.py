from sqlalchemy import select

from app import models

CSRF = {"X-AM-Solicitud": "1"}
RADICADO = "05266400300120250012300"


def _ids(respuesta):
    assert respuesta.status_code == 200, respuesta.text
    return [item["id"] for item in respuesta.json()["items"]]


def test_cada_rol_ve_solo_sus_procesos(iniciar, crear_usuario, crear_proceso, cliente_http):
    admin = crear_usuario("ADMIN")
    directora = crear_usuario("ABOGADO_ADMIN")
    asociado = crear_usuario("ABOGADO")
    cliente = crear_usuario("CLIENTE")
    propio = crear_proceso(directora, "Sucesión Restrepo", clientes=[cliente])
    colaborado = crear_proceso(asociado, "Restitución Calle 75", colaboradores=[(directora, False)])
    ajeno = crear_proceso(asociado, "Ejecutivo apartamento 1204")

    iniciar(admin)
    assert set(_ids(cliente_http.get("/api/v2/procesos"))) == {propio.id, colaborado.id, ajeno.id}
    iniciar(directora)
    assert set(_ids(cliente_http.get("/api/v2/procesos"))) == {propio.id, colaborado.id}
    iniciar(asociado)
    assert set(_ids(cliente_http.get("/api/v2/procesos"))) == {colaborado.id, ajeno.id}
    iniciar(cliente)
    assert _ids(cliente_http.get("/api/v2/procesos")) == [propio.id]


def test_el_listado_pagina_por_cursor(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    procesos = [crear_proceso(abogado, f"Proceso {n}") for n in range(5)]
    iniciar(abogado)

    primera = cliente_http.get("/api/v2/procesos", params={"limite": 2}).json()
    assert primera["total"] == 5
    assert [item["id"] for item in primera["items"]] == [procesos[4].id, procesos[3].id]
    segunda = cliente_http.get("/api/v2/procesos", params={"limite": 2, "cursor": primera["siguiente"]}).json()
    assert [item["id"] for item in segunda["items"]] == [procesos[2].id, procesos[1].id]
    tercera = cliente_http.get("/api/v2/procesos", params={"limite": 2, "cursor": segunda["siguiente"]}).json()
    assert [item["id"] for item in tercera["items"]] == [procesos[0].id]
    assert tercera["siguiente"] is None


def test_un_cursor_alterado_se_rechaza(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario())
    respuesta = cliente_http.get("/api/v2/procesos", params={"cursor": "no es un cursor"})
    assert respuesta.status_code == 422
    assert respuesta.json()["campos"] == {"cursor": "No es válido."}


def test_la_busqueda_cubre_nombre_radicado_y_cliente(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    cliente = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    por_nombre = crear_proceso(abogado, "Nulidad de sanción urbanística")
    por_radicado = crear_proceso(abogado, "Restitución de local", radicados=[RADICADO])
    por_cliente = crear_proceso(abogado, "Sucesión intestada", clientes=[cliente])
    iniciar(abogado)

    def buscar(texto):
        return _ids(cliente_http.get("/api/v2/procesos", params={"q": texto}))

    assert buscar("NULIDAD") == [por_nombre.id]
    assert buscar("05266-40-03-001") == [por_radicado.id]
    assert buscar("restrepo") == [por_cliente.id]
    assert buscar("50%") == []


def test_archivados_salen_de_la_lista_activa(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogado = crear_usuario()
    activo = crear_proceso(abogado, "Activo")
    archivado = crear_proceso(abogado, "Archivado", archivado=True)
    iniciar(abogado)

    assert _ids(cliente_http.get("/api/v2/procesos")) == [activo.id]
    assert _ids(cliente_http.get("/api/v2/procesos", params={"archivados": True})) == [archivado.id]


def test_detalle_con_equipo_radicados_y_fechas_de_colombia(iniciar, crear_usuario, crear_proceso, cliente_http):
    directora = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    visible = crear_usuario("ABOGADO", nombre="Santiago Ocampo")
    interno = crear_usuario("ABOGADO", nombre="Laura Gómez")
    cliente = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    proceso = crear_proceso(
        directora,
        "Sucesión de Gloria Inés Restrepo",
        clientes=[cliente],
        colaboradores=[(visible, True), (interno, False)],
        radicados=[RADICADO],
    )

    iniciar(directora)
    detalle = cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()
    assert detalle["responsable"] == {"id": directora.id, "nombre": "Alejandra Muñoz"}
    assert detalle["clientes"] == [{"id": cliente.id, "nombre": "Hernán Restrepo"}]
    assert detalle["radicados"] == [RADICADO]
    assert {persona["nombre"] for persona in detalle["colaboradores"]} == {"Santiago Ocampo", "Laura Gómez"}
    assert detalle["creado_en"].endswith("-05:00")
    assert detalle["archivado_en"] is None
    assert detalle["puede_administrar"] is True

    iniciar(cliente)
    para_cliente = cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()
    assert [persona["nombre"] for persona in para_cliente["colaboradores"]] == ["Santiago Ocampo"]
    assert para_cliente["puede_administrar"] is False


def test_un_proceso_ajeno_responde_404(iniciar, crear_usuario, crear_proceso, cliente_http):
    ajeno = crear_proceso(crear_usuario(), "Ajeno")
    iniciar(crear_usuario())
    respuesta = cliente_http.get(f"/api/v2/procesos/{ajeno.id}")
    assert respuesta.status_code == 404
    assert respuesta.json()["codigo"] == "no_encontrado"


def test_archivar_y_reabrir_quedan_en_la_auditoria(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario()
    proceso = crear_proceso(abogado)
    iniciar(abogado)

    archivado = cliente_http.post(f"/api/v2/procesos/{proceso.id}/archivar", headers=CSRF)
    assert archivado.status_code == 200
    assert archivado.json()["archivado_en"].endswith("-05:00")
    repetido = cliente_http.post(f"/api/v2/procesos/{proceso.id}/archivar", headers=CSRF)
    assert repetido.status_code == 409
    assert repetido.json()["codigo"] == "ya_archivado"

    reabierto = cliente_http.post(f"/api/v2/procesos/{proceso.id}/reabrir", headers=CSRF)
    assert reabierto.status_code == 200
    assert reabierto.json()["archivado_en"] is None

    acciones = sesion_bd.scalars(
        select(models.EventoAuditoria.accion).where(models.EventoAuditoria.recurso_id == str(proceso.id))
    ).all()
    assert sorted(acciones) == ["proceso.archivar", "proceso.restaurar"]


def test_solo_el_responsable_o_admin_archivan(iniciar, crear_usuario, crear_proceso, cliente_http):
    responsable = crear_usuario("ABOGADO")
    colaboradora = crear_usuario("ABOGADO_ADMIN")
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(responsable, clientes=[cliente], colaboradores=[(colaboradora, True)])

    for usuario in (colaboradora, cliente):
        iniciar(usuario)
        respuesta = cliente_http.post(f"/api/v2/procesos/{proceso.id}/archivar", headers=CSRF)
        assert respuesta.status_code == 403
        assert respuesta.json()["codigo"] == "sin_permiso"

    iniciar(crear_usuario("ADMIN"))
    assert cliente_http.post(f"/api/v2/procesos/{proceso.id}/archivar", headers=CSRF).status_code == 200
