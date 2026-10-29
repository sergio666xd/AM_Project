from datetime import date, timedelta

from app import models
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}
RADICADO = "05001310300420240031200"


def _actuacion(sesion_bd, proceso, texto, dias_atras=0, anotacion="Anotación del juzgado"):
    radicado = proceso.radicados[0].radicado
    orden = len(radicado.actuaciones) + 1
    actuacion = models.Actuacion(radicado_id=radicado.id, orden=orden, actuacion=texto, anotacion=anotacion,
                                 fecha_actuacion=(date.today() - timedelta(days=dias_atras)).isoformat())
    sesion_bd.add(actuacion)
    sesion_bd.commit()
    return actuacion


def _termino(cliente_http, patron, explicacion):
    respuesta = cliente_http.post("/api/v2/glosario", headers=H, json={"patron": patron, "explicacion": explicacion})
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def test_glosario_y_explicacion_de_actuaciones(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    asociado = crear_usuario("ABOGADO", nombre="Santiago Ocampo")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    hernan = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    ajena = crear_usuario("CLIENTE", nombre="Clienta ajena")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria, hernan], radicados=[RADICADO])
    audiencia = _actuacion(sesion_bd, proceso, "Auto fija fecha de audiencia")
    estado = _actuacion(sesion_bd, proceso, "Fijación en estado")
    desembargo = _actuacion(sesion_bd, proceso, "Auto ordena desembargo")

    iniciar(abogada)
    fija = _termino(cliente_http, "Fija fecha audiencia", "El juzgado programó una audiencia.")
    _termino(cliente_http, "Audiencia", "Una reunión con el juez.")
    _termino(cliente_http, "Fijación estado", "El juzgado publicó una decisión.")
    _termino(cliente_http, "Embargo", "Un bien queda inmovilizado.")
    # Sin tildes, mayúsculas ni artículos es el mismo texto del juzgado.
    repetido = cliente_http.post("/api/v2/glosario", headers=H, json={"patron": "fijacion de ESTADO", "explicacion": "Otra explicación más."})
    assert repetido.status_code == 409 and repetido.json()["codigo"] == "patron_repetido"
    vacio = cliente_http.post("/api/v2/glosario", headers=H, json={"patron": "de la", "explicacion": "No dice nada útil."})
    assert vacio.status_code == 422 and vacio.json()["codigo"] == "patron_vacio"
    lista = cliente_http.get("/api/v2/glosario").json()
    assert lista["total"] == 4 and lista["items"][0]["actualizado_por"] == "Alejandra Muñoz"

    # Para la firma: el fragmento más largo gana y se ve la anotación del juzgado.
    explicacion = cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").json()
    assert (explicacion["explicacion"], explicacion["fuente"], explicacion["patron"], explicacion["anotacion"]) == (
        "El juzgado programó una audiencia.", "glosario", "Fija fecha audiencia", "Anotación del juzgado")

    iniciar(asociado)
    assert cliente_http.get("/api/v2/glosario").status_code == 200
    assert cliente_http.post("/api/v2/glosario", headers=H, json={"patron": "Sentencia", "explicacion": "El juez decidió."}).status_code == 403
    # No es responsable ni colaborador del proceso.
    assert cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").status_code == 404

    iniciar(gloria)
    assert cliente_http.get("/api/v2/glosario").status_code == 403
    suya = cliente_http.get(f"/api/v2/actuaciones/{estado.id}/explicacion").json()
    assert (suya["explicacion"], suya["fuente"], suya["anotacion"], suya["texto_juzgado"]) == (
        "El juzgado publicó una decisión.", "glosario", None, "Fijación en estado")
    # «Embargo» no se confunde con «desembargo»: palabras completas.
    sin_explicar = cliente_http.get(f"/api/v2/actuaciones/{desembargo.id}/explicacion").json()
    assert (sin_explicar["explicacion"], sin_explicar["fuente"]) == (None, None)

    # Lo que la firma le escribió al avisarle manda sobre el glosario, solo para ese cliente.
    sesion_bd.add(models.NotificacionProceso(abogado_id=abogada.id, proceso_id=proceso.id, cliente_id=gloria.id,
                                             actuacion_id=audiencia.id, comentarios="Es el 19 de noviembre a las 9.",
                                             asunto="Actualización", cuerpo="…"))
    sesion_bd.commit()
    suya = cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").json()
    assert (suya["explicacion"], suya["fuente"], suya["patron"]) == ("Es el 19 de noviembre a las 9.", "abogado", None)
    iniciar(hernan)
    assert cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").json()["fuente"] == "glosario"
    iniciar(ajena)
    assert cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").status_code == 404

    # Un término desactivado deja de explicar; al quitarlo deja el glosario.
    iniciar(abogada)
    editado = cliente_http.put(f"/api/v2/glosario/{fija['id']}", headers=H,
                               json={"patron": "Fija fecha audiencia", "explicacion": "El juzgado programó una audiencia.", "activo": False})
    assert editado.status_code == 200 and editado.json()["activo"] is False
    # La firma ve lo que se le envió a Gloria; Hernán, sin aviso comentado, el siguiente término.
    assert cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").json()["fuente"] == "abogado"
    iniciar(hernan)
    assert cliente_http.get(f"/api/v2/actuaciones/{audiencia.id}/explicacion").json()["patron"] == "Audiencia"
    iniciar(abogada)
    assert cliente_http.delete(f"/api/v2/glosario/{fija['id']}", headers=H).status_code == 204
    assert cliente_http.get("/api/v2/glosario").json()["total"] == 3


def _escenario_portal(crear_usuario, crear_proceso, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    visible = crear_usuario("ABOGADO_ADMIN", nombre="Juan Pablo Ríos")
    oculto = crear_usuario("ABOGADO_ADMIN", nombre="Colega interno")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Inés Restrepo")
    hernan = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria, hernan], radicados=[RADICADO],
                            colaboradores=[(visible, True), (oculto, False)])
    archivado = crear_proceso(abogada, "Proceso archivado", clientes=[gloria], archivado=True)
    ajeno = crear_proceso(abogada, "Proceso de otra persona", clientes=[hernan])
    ahora = utc_ahora()

    proceso.etapa = "pruebas"
    for i, etapa in enumerate(("demanda", "admision", "pruebas")):
        sesion_bd.add(models.EtapaProceso(proceso_id=proceso.id, etapa=etapa, nota="Nota interna",
                                          usuario_id=abogada.id, fecha=ahora - timedelta(days=30 - i * 10)))
    _actuacion(sesion_bd, proceso, "Auto admite demanda", dias_atras=3)
    sesion_bd.add(models.TerminoGlosario(patron="Auto admite demanda", explicacion="El juez aceptó la demanda.",
                                         actualizado_en=ahora))

    def evento(titulo, dias, **datos):
        sesion_bd.add(models.EventoAgenda(titulo=titulo, tipo=datos.pop("tipo", "AUDIENCIA"), fecha_inicio=ahora + timedelta(days=dias),
                                          proceso_id=proceso.id, creado_por_id=abogada.id, **datos))

    evento("Audiencia de inventarios", 20)
    evento("Reunión con Hernán", 2, cliente_id=hernan.id, tipo="REUNION")
    evento("Audiencia cancelada", 1, estado="CANCELADO")
    evento("Audiencia ya pasada", -5)

    solicitud = models.SolicitudDocumento(
        proceso_id=proceso.id, cliente_id=gloria.id, titulo="Documentos del inventario",
        documentos_requeridos=[{"id": "a", "nombre": "Escritura"}, {"id": "b", "nombre": "Certificado de tradición"}],
        fecha_limite=ahora + timedelta(days=4),
    )
    sesion_bd.add(solicitud)
    sesion_bd.flush()
    sesion_bd.add(models.DocumentoProceso(proceso_id=proceso.id, cliente_id=gloria.id, solicitud_id=solicitud.id,
                                          solicitud_item_id="a", nombre_archivo="escritura.pdf", ruta_archivo="x",
                                          mime_type="application/pdf", estado_revision="REQUIERE_CORRECCION",
                                          comentario_revision="Falta la última página."))
    sesion_bd.add(models.DocumentoProceso(proceso_id=proceso.id, cliente_id=gloria.id, nombre_archivo="cedula-causante.pdf",
                                          ruta_archivo="x", mime_type="application/pdf"))
    sesion_bd.add(models.DocumentoProceso(proceso_id=proceso.id, cliente_id=hernan.id, nombre_archivo="de-hernan.pdf",
                                          ruta_archivo="x", mime_type="application/pdf"))
    borrador = models.ContratoServicio(proceso_id=proceso.id, cliente_id=gloria.id, estado="BORRADOR", contenido_actual="…")
    firmado = models.ContratoServicio(proceso_id=proceso.id, cliente_id=gloria.id, estado="FIRMADO", contenido_actual="…")
    sesion_bd.add_all([borrador, firmado])
    sesion_bd.flush()
    for contrato, nombre in ((borrador, "borrador.pdf"), (firmado, "contrato-firmado.pdf")):
        sesion_bd.add(models.DocumentoProceso(proceso_id=proceso.id, cliente_id=gloria.id, contrato_id=contrato.id,
                                              nombre_archivo=nombre, ruta_archivo="x", mime_type="application/pdf"))

    poder = models.Tarea(usuario_id=abogada.id, proceso_id=proceso.id, cliente_id=gloria.id, titulo="Firmar el poder",
                         fecha_limite=ahora - timedelta(days=1))
    interna = models.Tarea(usuario_id=abogada.id, proceso_id=proceso.id, titulo="Radicar el inventario",
                           fecha_limite=ahora + timedelta(days=6))
    sesion_bd.add_all([poder, interna])
    sesion_bd.flush()
    sesion_bd.add(models.Subtarea(tarea_id=interna.id, titulo="Enviar fotos del apartamento", asignada_cliente=True,
                                  cliente_id=gloria.id, proceso_id=proceso.id))
    sesion_bd.add(models.Subtarea(tarea_id=interna.id, titulo="Paso interno"))
    sesion_bd.commit()
    return locals()


def _toda_la_historia(cliente_http, proceso_id, limite=3):
    items, cursor = [], None
    while True:
        url = f"/api/v2/cliente/procesos/{proceso_id}/historia?limite={limite}" + (f"&cursor={cursor}" if cursor else "")
        pagina = cliente_http.get(url).json()
        items += pagina["items"]
        cursor = pagina["siguiente"]
        if not cursor:
            return items, pagina


def test_inicio_y_proceso_del_cliente(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario_portal(crear_usuario, crear_proceso, sesion_bd)
    p = e["proceso"].id

    iniciar(e["abogada"])
    assert cliente_http.get("/api/v2/cliente/inicio").status_code == 403

    iniciar(e["gloria"])
    inicio = cliente_http.get("/api/v2/cliente/inicio").json()
    assert inicio["nombre"] == "Gloria"
    # Solo procesos activos; lo pedido a ella, del vencido al más lejano. La tarea interna no.
    assert [x["nombre"] for x in inicio["procesos"]] == ["Sucesión Restrepo"]
    assert [(x["titulo"], x["vencido"]) for x in inicio["pendientes"]] == [
        ("Firmar el poder", True), ("Documentos del inventario", False), ("Enviar fotos del apartamento", False)]
    documentos = inicio["pendientes"][1]
    assert documentos["detalle"] == "Faltan 2 de 2 documentos · 1 por corregir"
    assert inicio["pendientes"][2]["detalle"] == "Parte de: Radicar el inventario"

    resumen = inicio["procesos"][0]
    assert resumen["etapa"] == "pruebas" and resumen["etapa_explicacion"].startswith("Cada parte presenta sus pruebas")
    assert [(x["clave"], x["fecha"] is not None) for x in resumen["etapas"]] == [
        ("demanda", True), ("admision", True), ("pruebas", True), ("audiencia", False), ("sentencia", False)]
    # La reunión de Hernán y la audiencia cancelada no son suyas.
    assert resumen["proxima_fecha"]["titulo"] == "Audiencia de inventarios"
    assert resumen["proxima_fecha"]["tipo_legible"] == "Audiencia"
    assert len(inicio["recientes"]) == 3 and inicio["recientes"][0]["proceso"]["id"] == p

    detalle = cliente_http.get(f"/api/v2/cliente/procesos/{p}").json()
    assert [x["nombre"] for x in detalle["equipo"]] == ["Juan Pablo Ríos"]
    assert detalle["radicados"] == [RADICADO]
    por_nombre = {d["nombre"]: d for d in detalle["documentos"]}
    assert set(por_nombre) == {"escritura.pdf", "cedula-causante.pdf", "contrato-firmado.pdf"}
    assert (por_nombre["escritura.pdf"]["origen"], por_nombre["escritura.pdf"]["estado"], por_nombre["escritura.pdf"]["nota"]) == (
        "cliente", "por corregir", "Falta la última página.")
    assert por_nombre["cedula-causante.pdf"]["origen"] == "firma"
    assert por_nombre["contrato-firmado.pdf"]["origen"] == "contrato"

    for otro in (e["archivado"].id, e["ajeno"].id, 99999):
        assert cliente_http.get(f"/api/v2/cliente/procesos/{otro}").status_code == 404


def test_historia_en_lenguaje_claro_y_lo_nuevo(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario_portal(crear_usuario, crear_proceso, sesion_bd)
    p = e["proceso"].id
    iniciar(e["gloria"])

    items, ultima = _toda_la_historia(cliente_http, p)
    assert ultima["total"] == len(items)
    textos = [x["texto"] for x in items]
    fechas = [x["fecha"] for x in items]
    assert fechas == sorted(fechas, reverse=True)
    assert len({x["folio"] for x in items}) == len(items)
    por_tipo = {}
    for x in items:
        por_tipo.setdefault(x["tipo"], []).append(x)

    actuacion = por_tipo["actuacion"][0]
    assert (actuacion["texto"], actuacion["texto_juzgado"], actuacion["explicada"]) == (
        "El juez aceptó la demanda.", "Auto admite demanda", True)
    assert {x["texto"] for x in por_tipo["etapa"]} == {
        "Su proceso pasó a la etapa de demanda.", "Su proceso pasó a la etapa de admisión.", "Su proceso pasó a la etapa de pruebas."}
    assert "Usted envió «escritura.pdf»." in textos
    assert "La firma compartió con usted el documento «cedula-causante.pdf»." in textos
    assert "Se firmó el contrato de prestación de servicios. Puede descargar su copia." in textos
    assert "Le pedimos: Firmar el poder." in textos
    assert any(t.startswith("Le pedimos estos documentos: Escritura, Certificado de tradición") for t in textos)
    assert any(t.startswith("Audiencia de inventarios: queda en la agenda el ") for t in textos)
    # Nada de otros clientes, borradores, tareas internas ni eventos cancelados.
    for ajeno in ("de-hernan.pdf", "borrador.pdf", "Radicar el inventario", "Reunión con Hernán", "Audiencia cancelada", "Nota interna"):
        assert not any(ajeno in t for t in textos), ajeno

    # Sin haber abierto nunca el proceso, es nuevo lo reciente salvo lo que ella misma envió.
    nuevos = {x["texto"] for x in items if x["nuevo"]}
    assert "El juez aceptó la demanda." in nuevos and "Usted envió «escritura.pdf»." not in nuevos
    assert ultima["nuevos"] == len(nuevos)
    assert cliente_http.get("/api/v2/cliente/inicio").json()["procesos"][0]["nuevos"] == len(nuevos)

    assert cliente_http.post(f"/api/v2/cliente/procesos/{p}/visto", headers=H).status_code == 204
    items, ultima = _toda_la_historia(cliente_http, p)
    assert ultima["nuevos"] == 0 and not any(x["nuevo"] for x in items)

    # Lo que llega después vuelve a ser nuevo.
    _actuacion(sesion_bd, e["proceso"], "Auto decreta pruebas")
    items, ultima = _toda_la_historia(cliente_http, p)
    assert ultima["nuevos"] == 1
    llegada = next(x for x in items if x["nuevo"])
    assert (llegada["texto"], llegada["explicada"], llegada["texto_juzgado"]) == ("Auto decreta pruebas", False, None)
    assert cliente_http.post(f"/api/v2/cliente/procesos/{e['archivado'].id}/visto", headers=H).status_code == 404
    assert cliente_http.get(f"/api/v2/cliente/procesos/{p}/historia?cursor=no-vale").status_code == 422
