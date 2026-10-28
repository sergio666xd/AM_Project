from datetime import timedelta

from app import models
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _contrato(sesion_bd, proceso, cliente, estado, hace_dias=0, **extra):
    contrato = models.ContratoServicio(
        proceso_id=proceso.id, cliente_id=cliente.id, abogado_id=proceso.abogado_id, estado=estado, contenido_actual="",
        created_at=utc_ahora() - timedelta(days=hace_dias), updated_at=utc_ahora() - timedelta(days=hace_dias), **extra,
    )
    sesion_bd.add(contrato)
    sesion_bd.commit()
    return contrato


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    abogado = crear_usuario("ABOGADO", nombre="Abogado sin contratos")
    otra = crear_usuario("ABOGADO_ADMIN", nombre="Otra abogada")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    hernan = crear_usuario("CLIENTE", nombre="Hernán Cardona")
    sucesion = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria])
    arriendo = crear_proceso(abogada, "Restitución Cardona", clientes=[hernan])
    divorcio = crear_proceso(abogada, "Divorcio", clientes=[gloria])
    crear_proceso(abogada, "Sin cliente")
    archivado = crear_proceso(abogada, "Archivado", clientes=[hernan], archivado=True)
    ajeno = crear_proceso(otra, "Ajeno", clientes=[gloria])
    firmado = _contrato(sesion_bd, sucesion, gloria, "FIRMADO", hace_dias=2, firmado_en=utc_ahora() - timedelta(days=2))
    sesion_bd.add(models.DocumentoProceso(proceso_id=sucesion.id, cliente_id=gloria.id, contrato_id=firmado.id,
                                          nombre_archivo="contrato-firmado.pdf", ruta_archivo="r2/contrato", mime_type="application/pdf",
                                          estado_revision="APROBADO"))
    borrador = _contrato(sesion_bd, arriendo, hernan, "BORRADOR", hace_dias=1)
    anulado = _contrato(sesion_bd, divorcio, gloria, "ANULADO", hace_dias=5, motivo_anulacion="Cambió de abogado", anulado_en=utc_ahora())
    del_archivado = _contrato(sesion_bd, archivado, hernan, "LISTO_PARA_FIRMA", hace_dias=6)
    _contrato(sesion_bd, ajeno, gloria, "BORRADOR")
    return locals()


def test_lista_por_estado_con_resumen(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])

    lista = cliente_http.get("/api/v2/contratos").json()
    # El del proceso archivado sale en la lista pero no en las cifras; el divorcio no tiene contrato vigente.
    assert lista["resumen"] == {"en_preparacion": 1, "por_firmar": 0, "firmados": 1, "sin_contrato": 1}
    assert [(c["id"], c["estado"], c["expediente_archivado"]) for c in lista["items"]] == [
        (e["borrador"].id, "BORRADOR", False), (e["del_archivado"].id, "LISTO_PARA_FIRMA", True)]
    [firmado] = cliente_http.get("/api/v2/contratos?grupo=firmados").json()["items"]
    assert firmado["cliente"] == {"id": e["gloria"].id, "nombre": "Gloria Restrepo"}
    assert firmado["documento_firmado"]["nombre_archivo"] == "contrato-firmado.pdf"
    [anulado] = cliente_http.get("/api/v2/contratos?grupo=cerrados").json()["items"]
    assert (anulado["motivo_cierre"], anulado["cerrado_en"] is not None) == ("Cambió de abogado", True)
    assert len(cliente_http.get("/api/v2/contratos?grupo=todos").json()["items"]) == 4

    [sin] = cliente_http.get("/api/v2/contratos/sin-contrato").json()["items"]
    assert (sin["nombre"], sin["ultimo_contrato"], sin["clientes"]) == (
        "Divorcio", "ANULADO", [{"id": e["gloria"].id, "nombre": "Gloria Restrepo"}])

    iniciar(e["abogado"])
    assert cliente_http.get("/api/v2/contratos", headers=H).status_code == 403


def test_ver_el_contrato_firmado(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)

    class R2:
        def get_object(self, Bucket, Key):
            assert Key == "r2/contrato"
            return {"Body": iter([b"%PDF-", b"1.7"])}

    monkeypatch.setattr("app.storage.get_r2_client", lambda: R2())
    monkeypatch.setattr("app.storage.get_r2_bucket", lambda: "cubeta")
    iniciar(e["abogada"])

    vista = cliente_http.get(f"/api/v2/contratos/{e['firmado'].id}/firmado?descargar=false")
    assert vista.status_code == 200 and vista.content == b"%PDF-1.7"
    assert vista.headers["content-disposition"].startswith("inline;")
    assert cliente_http.get(f"/api/v2/contratos/{e['borrador'].id}/firmado").status_code == 404
    iniciar(e["otra"])
    assert cliente_http.get(f"/api/v2/contratos/{e['firmado'].id}/firmado", headers=H).status_code == 404
