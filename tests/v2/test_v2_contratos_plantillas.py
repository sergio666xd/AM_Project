"""Plantillas de contrato y contratos hechos con ellas."""

from app import models
from app.modulos.contratos import plantilla_cps

H = {"X-AM-Solicitud": "1"}
PDF = b"%PDF-1.4\n%%EOF\n"


def _cps(cliente_http) -> dict:
    r = cliente_http.post("/api/v2/contratos/plantillas", headers=H, json={
        "nombre": plantilla_cps.NOMBRE, "cuerpo": plantilla_cps.CUERPO, "campos": plantilla_cps.CAMPOS, "firmas": plantilla_cps.FIRMAS,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_crear_editar_duplicar_y_eliminar_plantillas(iniciar, crear_usuario, cliente_http):
    abogada = crear_usuario("ABOGADO_ADMIN")
    iniciar(abogada)
    cps = _cps(cliente_http)
    assert cps["campos"][0]["singular"] == "CONTRATANTE" and cps["firmas"] == {"abogado": "EL ABOGADO"} and cps["usos"] == 0

    # No se guarda una plantilla con códigos que no existen.
    mala = {**cps, "cuerpo": "Entre {{#contratantes}}{{.nombre}}{{/contratantes}} y {{cliente.nombre}}"}
    r = cliente_http.put(f"/api/v2/contratos/plantillas/{cps['id']}", headers=H, json=mala)
    assert r.status_code == 422 and r.json()["codigo"] == "plantilla_con_errores" and "cliente.nombre" in r.json()["mensaje"]
    reservada = {**cps, "campos": [*cps["campos"], {"clave": "fecha", "etiqueta": "Fecha", "tipo": "texto"}]}
    assert cliente_http.put(f"/api/v2/contratos/plantillas/{cps['id']}", headers=H, json=reservada).status_code == 422

    editada = cliente_http.put(f"/api/v2/contratos/plantillas/{cps['id']}", headers=H,
                               json={**cps, "nombre": "  CPS   general ", "firmas": {"abogado": "la mandataria"}}).json()
    assert editada["nombre"] == "CPS general" and editada["firmas"]["abogado"] == "LA MANDATARIA"

    copia = cliente_http.post(f"/api/v2/contratos/plantillas/{cps['id']}/duplicar", headers=H).json()
    assert copia["nombre"] == "CPS general (copia)" and copia["cuerpo"] == cps["cuerpo"]
    assert cliente_http.delete(f"/api/v2/contratos/plantillas/{copia['id']}", headers=H).status_code == 204
    assert [p["id"] for p in cliente_http.get("/api/v2/contratos/plantillas").json()["items"]] == [cps["id"]]


def test_contrato_con_varios_contratantes(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    monkeypatch.setattr("app.modulos.contratos.servicio.render_pdf_plantilla", lambda plantilla, datos: PDF)
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    abogada.genero, abogada.numero_documento = "FEMENINO", "40328563"
    luis = crear_usuario("CLIENTE", nombre="Luis Arango")
    luis.numero_documento, luis.domicilio, luis.genero = "70.118.764", "Envigado", "MASCULINO"
    proceso = crear_proceso(abogada, "Pertenencia La Esperanza", clientes=[luis], radicados=["05001310300120260012300"])
    iniciar(abogada)
    cps = _cps(cliente_http)

    contexto = cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}/contexto").json()
    assert contexto["fijos"]["abogado.nombre"] == "ALEJANDRA MUÑOZ" and contexto["fijos"]["abogado.documento"] == "40.328.563"
    assert contexto["fijos"]["proceso.radicado"] == "05001310300120260012300" and contexto["fijos"]["abogado.genero"] == "f"
    luis_ = contexto["clientes"][0]
    assert (luis_["cedula"], luis_["ciudad"], luis_["genero"]) == ("70.118.764", "Envigado", "m")

    marta = {"ref": "p1", "nombre": "Marta Gil", "cedula": "43.111.222", "ciudad": "Medellín", "genero": "f",
             "direccion": "Calle 10", "correo": "marta@correo.co", "telefono": "3001112233"}
    datos = {
        "valores": {"objeto": "la representación judicial.", "intruso": "no se guarda"},
        "listas": {"contratantes": [{**luis_, "direccion": "Carrera 5 # 6-7"}, marta]},
        "notificaciones": {"personas": ["p1", "no-existe"], "otras": []},
    }
    r = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}/con-plantilla", headers=H, json={"plantilla_id": cps["id"], "datos": datos})
    assert r.status_code == 201, r.text
    contrato = r.json()
    cid = contrato["id"]
    assert contrato["cliente"]["id"] == luis.id and contrato["personas"] == ["Luis Arango", "Marta Gil"]
    assert contrato["plantilla"]["id"] == cps["id"] and contrato["campos"] == {}
    assert contrato["datos"]["valores"] == {"objeto": "la representación judicial."}
    assert contrato["datos"]["notificaciones"]["personas"] == ["p1"]
    sesion_bd.refresh(luis)
    assert luis.direccion == "Carrera 5 # 6-7"  # Lo que el perfil no tenía queda en el perfil.

    # Falta honorarios: no pasa a listo para firmar.
    r = cliente_http.post(f"/api/v2/contratos/{cid}/listo", headers=H)
    assert r.status_code == 422 and r.json()["codigo"] == "contrato_incompleto" and "Honorarios" in r.json()["mensaje"]
    assert cliente_http.patch(f"/api/v2/contratos/{cid}", headers=H, json={"campos": {}}).status_code == 409

    # Los contratos hechos no cambian si se edita la plantilla.
    cliente_http.put(f"/api/v2/contratos/plantillas/{cps['id']}", headers=H, json={**cps, "cuerpo": cps["cuerpo"] + "\n\nOtra cláusula."})
    datos["valores"]["honorarios"] = "por valor de $2.000.000."
    r = cliente_http.patch(f"/api/v2/contratos/{cid}/datos", headers=H, json={"datos": datos})
    assert r.status_code == 200 and r.json()["version"] == 2 and "Otra cláusula" not in r.json()["plantilla"]["cuerpo"]
    assert cliente_http.get(f"/api/v2/contratos/{cid}/pdf").status_code == 200  # El borrador se puede revisar en PDF.

    listo = cliente_http.post(f"/api/v2/contratos/{cid}/listo", headers=H)
    assert listo.status_code == 200, listo.text
    assert listo.json()["estado"] == "LISTO_PARA_FIRMA" and listo.json()["datos"]["fijos"]["fecha.anio"]
    assert cliente_http.patch(f"/api/v2/contratos/{cid}/datos", headers=H, json={"datos": datos}).status_code == 409
    assert cliente_http.get("/api/v2/contratos/plantillas").json()["items"][0]["usos"] == 1
    version = sesion_bd.query(models.ContratoServicioVersion).filter_by(contrato_id=cid, version=3).one()
    assert '"plantilla"' in version.contenido

    # Eliminada la plantilla, el contrato conserva su copia.
    assert cliente_http.delete(f"/api/v2/contratos/plantillas/{cps['id']}", headers=H).status_code == 204
    detalle = cliente_http.get(f"/api/v2/contratos/{cid}").json()
    assert detalle["plantilla"]["nombre"] == plantilla_cps.NOMBRE
    otro = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}/con-plantilla", headers=H, json={"plantilla_id": cps["id"], "datos": datos})
    assert otro.status_code == 404


def test_solo_clientes_del_proceso_y_sin_registrados(iniciar, crear_usuario, crear_proceso, cliente_http):
    abogada = crear_usuario("ABOGADO_ADMIN")
    ajeno = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Sin clientes")
    iniciar(abogada)
    cps = _cps(cliente_http)
    assert cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}").json()["puede_crear"] is True
    persona = {"ref": "x", "cliente_id": ajeno.id, "nombre": "Ajeno"}
    r = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}/con-plantilla", headers=H,
                          json={"plantilla_id": cps["id"], "datos": {"listas": {"contratantes": [persona]}}})
    assert r.status_code == 422
    persona = {"ref": "x", "nombre": "Rosa Díaz", "correo": "rosa@correo.co"}
    contrato = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}/con-plantilla", headers=H,
                                 json={"plantilla_id": cps["id"], "datos": {"listas": {"contratantes": [persona]}}}).json()
    assert contrato["cliente"] is None and contrato["personas"] == ["Rosa Díaz"]


def test_el_cliente_no_ve_las_plantillas(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario("CLIENTE"))
    assert cliente_http.get("/api/v2/contratos/plantillas").status_code == 403


def test_pdf_real_sobre_el_documento_base():
    from io import BytesIO

    from pypdf import PdfReader

    from app.modulos.contratos.documento import render_pdf_plantilla

    plantilla = {"cuerpo": plantilla_cps.CUERPO, "campos": plantilla_cps.CAMPOS, "firmas": plantilla_cps.FIRMAS}
    personas = [{"ref": str(i), "nombre": f"Persona {i}", "cedula": "1", "ciudad": "Medellín", "genero": "f"} for i in range(4)]
    pdf = render_pdf_plantilla(plantilla, {"listas": {"contratantes": personas}, "valores": {"objeto": "x", "honorarios": "y"},
                                           "fijos": {"abogado.nombre": "YEINNY", "abogado.genero": "f"}})
    paginas = PdfReader(BytesIO(pdf)).pages
    assert len(paginas) >= 3 and "Página 1 de" in paginas[0].extract_text()
