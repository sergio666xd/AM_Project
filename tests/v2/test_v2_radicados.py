from app import models

H = {"X-AM-Solicitud": "1"}

UNO = "05001310300120250012300"
DOS = "11001310300120250012300"
TRES = "76001310300120240099900"


def _actuacion(radicado, orden, fecha, texto, **extra):
    return models.Actuacion(radicado_id=radicado.id, orden=orden, fecha_actuacion=fecha, actuacion=texto, **extra)


def test_lista_y_detalle_de_radicados(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    colega = crear_usuario("ABOGADO_ADMIN", nombre="Bruno Díaz")
    cliente = crear_usuario("CLIENTE")
    crear_proceso(abogada, "Sucesión Restrepo", radicados=[UNO], clientes=[cliente])
    crear_proceso(abogada, "Ejecutivo Cardona", radicados=[DOS])
    ajeno = crear_proceso(colega, "Proceso de Bruno", radicados=[TRES])
    uno = sesion_bd.query(models.Radicado).filter_by(numero=UNO).one()
    dos = sesion_bd.query(models.Radicado).filter_by(numero=DOS).one()
    uno.estado_consulta, uno.consultado_en, uno.despacho_departamento = "ok", "2026-10-30T06:00", "Juzgado 1 Civil · Antioquia"
    uno.demandante, uno.demandado = "Gloria Restrepo", ""
    dos.estado_consulta = "error_api: tiempo de espera agotado"
    sesion_bd.add_all([
        _actuacion(uno, 1, "2026-10-28", "Auto decreta pruebas", anotacion="Se decretan las pruebas pedidas",
                   fecha_inicia_termino="2026-10-29", fecha_finaliza_termino="2026-11-05", es_fijacion=True),
        _actuacion(uno, 2, "2026-10-01", "Auto admite demanda"),
        _actuacion(dos, 1, "2026-09-15", "Traslado de excepciones"),
        models.NovedadRadicadoUsuario(usuario_id=abogada.id, radicado_id=uno.id, actuaciones_nuevas=1),
    ])
    sesion_bd.commit()
    iniciar(abogada)

    lista = cliente_http.get("/api/v2/radicados").json()
    assert [f["numero"] for f in lista["items"]] == [UNO, DOS]  # El de Bruno no se ve; el más reciente primero.
    assert lista["resumen"] == {"total": 2, "con_novedades": 1, "con_problemas": 1, "sin_consultar": 0}
    fila = lista["items"][0]
    assert fila["procesos"] == [{"id": fila["procesos"][0]["id"], "nombre": "Sucesión Restrepo", "archivado": False}]
    assert fila["ultima_actuacion"]["texto"] == "Auto decreta pruebas" and fila["ultima_actuacion"]["fecha"] == "2026-10-28"
    assert (fila["total_actuaciones"], fila["novedades"], fila["demandado"]) == (2, 1, None)
    assert fila["consulta"] == {"estado": "consultado", "etiqueta": "Consultado", "detalle": None, "consultado_en": "2026-10-30T06:00"}
    assert lista["items"][1]["consulta"]["estado"] == "error"
    assert lista["items"][1]["consulta"]["detalle"] == "tiempo de espera agotado"

    detalle = cliente_http.get(f"/api/v2/radicados/{uno.id}").json()
    assert [a["actuacion"] for a in detalle["actuaciones"]] == ["Auto decreta pruebas", "Auto admite demanda"]
    assert [a["nueva"] for a in detalle["actuaciones"]] == [True, False]
    primera = detalle["actuaciones"][0]
    assert (primera["inicia_termino"], primera["finaliza_termino"], primera["fijacion"]) == ("2026-10-29", "2026-11-05", True)
    assert detalle["novedades"] == 1 and detalle["puede_consultar"] is False
    # Ver el detalle no cambia nada; la página marca las novedades como revisadas aparte.
    assert cliente_http.get(f"/api/v2/radicados/{uno.id}").json()["novedades"] == 1
    assert cliente_http.post(f"/api/v2/radicados/{uno.id}/revisado", headers=H).status_code == 204
    assert cliente_http.get(f"/api/v2/radicados/{uno.id}").json()["novedades"] == 0
    assert cliente_http.get("/api/v2/radicados").json()["resumen"]["con_novedades"] == 0

    tres = sesion_bd.query(models.Radicado).filter_by(numero=TRES).one()
    assert cliente_http.get(f"/api/v2/radicados/{tres.id}").status_code == 404
    assert cliente_http.post(f"/api/v2/radicados/{tres.id}/revisado", headers=H).status_code == 404

    # Como colaboradora del proceso de Bruno ya lo ve.
    sesion_bd.add(models.ProcesoColaborador(proceso_id=ajeno.id, abogado_id=abogada.id, visible_cliente=False))
    sesion_bd.commit()
    assert cliente_http.get(f"/api/v2/radicados/{tres.id}").json()["procesos"][0]["nombre"] == "Proceso de Bruno"

    iniciar(cliente)
    assert cliente_http.get("/api/v2/radicados").status_code == 403


def test_la_administracion_ve_todos_y_puede_consultar(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    admin = crear_usuario("ADMIN")
    crear_proceso(abogada, "Sucesión", radicados=[UNO])
    crear_proceso(abogada, "Archivado", radicados=[DOS], archivado=True)
    iniciar(admin)
    lista = cliente_http.get("/api/v2/radicados").json()
    assert lista["resumen"]["sin_consultar"] == 2
    assert {f["procesos"][0]["archivado"] for f in lista["items"]} == {False, True}
    assert cliente_http.get(f"/api/v2/radicados/{lista['items'][0]['id']}").json()["puede_consultar"] is True
