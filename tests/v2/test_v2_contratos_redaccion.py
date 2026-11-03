from io import BytesIO

from app import models

H = {"X-AM-Solicitud": "1"}
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _completos(campos: dict) -> dict:
    return {**campos, "genero_cliente": "FEMENINO", "documento": "43123456", "ciudad": "Medellín",
            "objeto": "Representar a la cliente en la sucesión de su padre."}


class R2:
    def __init__(self):
        self.guardados = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.guardados[Key] = Body

    def get_object(self, Bucket, Key):
        return {"Body": BytesIO(self.guardados[Key])}

    def delete_object(self, Bucket, Key):
        self.guardados.pop(Key, None)


def _entorno(monkeypatch):
    r2, correos, avisos = R2(), [], []
    monkeypatch.setattr("app.storage.get_r2_client", lambda: r2)
    monkeypatch.setattr("app.storage.get_r2_bucket", lambda: "cubeta")
    monkeypatch.setattr("app.modulos.contratos.servicio.enviar_correo", lambda *a, **k: correos.append((a, k)) or True)
    monkeypatch.setattr("app.modulos.agenda.avisos.emitir_notificacion_workflow", lambda db, u, *a, **k: avisos.append(u.id))
    monkeypatch.setattr("app.modulos.contratos.servicio.render_contract_pdf", lambda campos: PDF)
    monkeypatch.setattr("app.modulos.contratos.servicio.render_direct_message", lambda db, clave, variables, **k: (clave, k["link_url"]))
    return r2, correos, avisos


def test_de_borrador_a_firmado_y_terminado(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    r2, correos, avisos = _entorno(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    colega = crear_usuario("ABOGADO_ADMIN", nombre="Bruno Díaz")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    gloria.numero_documento, gloria.domicilio = "43.123.456", "Medellín"
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria], colaboradores=[(colega, False)])
    iniciar(abogada)

    lista = cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}").json()
    assert lista["items"] == [] and lista["puede_crear"] and lista["clientes"][0]["nombre"] == "Gloria Restrepo"

    plantilla = cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}/plantilla", params={"cliente_id": gloria.id}).json()["campos"]
    assert plantilla["nombre"] == "GLORIA RESTREPO" and plantilla["documento"] == "43123456" and plantilla["ciudad"] == "MEDELLÍN"
    assert plantilla["abogado_nombre"] == "ALEJANDRA MUÑOZ"

    r = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}", headers=H, json={"cliente_id": gloria.id, "campos": plantilla})
    assert r.status_code == 201, r.text
    contrato = r.json()
    assert (contrato["estado"], contrato["version"], contrato["puede_editar"]) == ("BORRADOR", 1, True)
    cid = contrato["id"]

    # Listo para firmar exige los datos completos.
    r = cliente_http.post(f"/api/v2/contratos/{cid}/listo", headers=H)
    assert r.status_code == 422 and r.json()["codigo"] == "campos_contrato"
    r = cliente_http.patch(f"/api/v2/contratos/{cid}", headers=H, json={"campos": _completos(plantilla)})
    assert r.json()["campos"]["objeto"].startswith("Representar") and r.json()["version"] == 2
    vista = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}/vista-previa", headers=H,
                              json={"cliente_id": gloria.id, "campos": _completos(plantilla)})
    assert vista.status_code == 200 and vista.headers["content-type"] == "application/pdf"
    assert cliente_http.get(f"/api/v2/contratos/{cid}/pdf").status_code == 409  # El borrador no se imprime.

    assert cliente_http.post(f"/api/v2/contratos/{cid}/listo", headers=H).json()["estado"] == "LISTO_PARA_FIRMA"
    assert cliente_http.patch(f"/api/v2/contratos/{cid}", headers=H, json={"campos": plantilla}).status_code == 409
    assert cliente_http.get(f"/api/v2/contratos/{cid}/pdf").status_code == 200

    # Sin cita de firma no se sube el escaneado.
    archivo = {"archivo": ("firmado.pdf", PDF, "application/pdf")}
    assert cliente_http.post(f"/api/v2/contratos/{cid}/firmado", headers=H, files=archivo).status_code == 409

    r = cliente_http.post(f"/api/v2/contratos/{cid}/firma", headers=H,
                          json={"inicio": "2099-11-20T10:00:00-05:00", "fin": "2099-11-20T11:00:00-05:00", "lugar": "Oficina de Sabaneta"})
    assert r.status_code == 201, r.text
    assert r.json()["estado"] == "EN_FIRMA" and r.json()["firma"]["estado"] == "PROGRAMADO"
    assert avisos == [gloria.id]
    evento = sesion_bd.query(models.EventoAgenda).filter_by(contrato_id=cid).one()
    assert (evento.tipo, evento.cliente_id, evento.descripcion) == ("FIRMA_CONTRATO", gloria.id, "Oficina de Sabaneta")
    assert cliente_http.post(f"/api/v2/contratos/{cid}/firma", headers=H, json={"inicio": "2099-11-21T10:00:00-05:00"}).status_code == 409

    # El colaborador ve el contrato pero no lo cambia.
    iniciar(colega)
    assert cliente_http.get(f"/api/v2/contratos/{cid}").json()["puede_editar"] is False
    assert cliente_http.post(f"/api/v2/contratos/{cid}/firmado", headers=H, files=archivo).status_code == 403
    iniciar(abogada)

    malo = {"archivo": ("firmado.png", b"\x89PNG\r\n", "image/png")}
    assert cliente_http.post(f"/api/v2/contratos/{cid}/firmado", headers=H, files=malo).status_code == 422
    r = cliente_http.post(f"/api/v2/contratos/{cid}/firmado", headers=H, files=archivo)
    assert r.status_code == 201, r.text
    cargado = r.json()
    assert cargado["contrato"]["estado"] == "FIRMADO" and cargado["entrega"]["estado"] == "ENVIADO"
    assert cargado["contrato"]["firma"]["estado"] == "COMPLETADO" and cargado["contrato"]["documento_firmado"]
    assert correos[0][0][0] == gloria.email and len(r2.guardados) == 1

    assert cliente_http.post(f"/api/v2/contratos/{cid}/reenviar-copia", headers=H).json()["ultima_entrega"]["estado"] == "ENVIADO"
    assert len(correos) == 2
    assert cliente_http.post(f"/api/v2/contratos/{cid}/anular", headers=H, json={"motivo": "Error"}).status_code == 409

    reabierto = cliente_http.post(f"/api/v2/contratos/{cid}/reabrir-firma", headers=H).json()
    assert reabierto["estado"] == "EN_FIRMA" and reabierto["firma"]["estado"] == "PROGRAMADO"
    assert cliente_http.post(f"/api/v2/contratos/{cid}/firmado", headers=H, files=archivo).json()["mensaje"].startswith("Contrato firmado")

    assert cliente_http.post(f"/api/v2/contratos/{cid}/terminar", headers=H, json={"motivo": " "}).status_code == 422
    terminado = cliente_http.post(f"/api/v2/contratos/{cid}/terminar", headers=H, json={"motivo": "Terminó la sucesión"}).json()
    assert terminado["estado"] == "TERMINADO" and terminado["motivo_cierre"] == "Terminó la sucesión"
    assert [v["estado"] for v in terminado["versiones"]][-1] == "TERMINADO"


def test_anular_y_eliminar(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    _entorno(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN")
    gloria = crear_usuario("CLIENTE")
    ajena = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Sucesión", clientes=[gloria])
    iniciar(abogada)
    plantilla = cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}/plantilla", params={"cliente_id": gloria.id}).json()["campos"]
    assert cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}/plantilla", params={"cliente_id": ajena.id}).status_code == 404
    assert cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}", headers=H,
                             json={"cliente_id": ajena.id, "campos": plantilla}).status_code == 422
    cid = cliente_http.post(f"/api/v2/contratos/proceso/{proceso.id}", headers=H,
                            json={"cliente_id": gloria.id, "campos": _completos(plantilla)}).json()["id"]
    assert cliente_http.post(f"/api/v2/contratos/{cid}/listo", headers=H).status_code == 200
    assert cliente_http.post(f"/api/v2/contratos/{cid}/firma", headers=H, json={"inicio": "2099-11-20T10:00:00-05:00"}).status_code == 201
    assert cliente_http.delete(f"/api/v2/contratos/{cid}", headers=H).status_code == 409

    anulado = cliente_http.post(f"/api/v2/contratos/{cid}/anular", headers=H, json={"motivo": "El cliente desistió"}).json()
    assert anulado["estado"] == "ANULADO" and anulado["firma"] is None  # La cita se canceló.
    assert sesion_bd.query(models.EventoAgenda).filter_by(contrato_id=cid).one().estado == "CANCELADO"
    assert cliente_http.delete(f"/api/v2/contratos/{cid}", headers=H).status_code == 204
    assert cliente_http.get(f"/api/v2/contratos/{cid}").status_code == 404
    assert sesion_bd.query(models.EventoAgenda).filter_by(proceso_id=proceso.id).one().contrato_id is None

    # En un expediente archivado no se crean contratos.
    archivado = crear_proceso(abogada, "Archivado", clientes=[gloria], archivado=True)
    assert cliente_http.get(f"/api/v2/contratos/proceso/{archivado.id}").json()["puede_crear"] is False
    r = cliente_http.post(f"/api/v2/contratos/proceso/{archivado.id}", headers=H, json={"cliente_id": gloria.id, "campos": plantilla})
    assert r.status_code == 409

    iniciar(gloria)
    assert cliente_http.get(f"/api/v2/contratos/proceso/{proceso.id}").status_code == 403
