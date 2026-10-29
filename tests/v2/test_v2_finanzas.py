import importlib.util
from datetime import date, timedelta
from pathlib import Path

import pytest

from app import models
from app.modulos.finanzas import correo
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}
MIGRACION = Path(__file__).resolve().parents[2] / "alembic_migrations" / "versions" / "2026_10_29_0012_finanzas.py"


@pytest.fixture
def correos(monkeypatch, sesion_bd):
    """Siembra las plantillas financieras y guarda los correos en vez de enviarlos."""
    especificacion = importlib.util.spec_from_file_location("migracion_finanzas", MIGRACION)
    migracion = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(migracion)
    for plantilla in migracion.PLANTILLAS:
        if not sesion_bd.query(models.PlantillaMensaje).filter_by(clave=plantilla["clave"]).first():
            sesion_bd.add(models.PlantillaMensaje(**plantilla, activo=True))
    sesion_bd.commit()
    enviados = []

    def enviar(destinatario, asunto, cuerpo, adjunto=None, **remitente):
        enviados.append({"para": destinatario, "asunto": asunto, "cuerpo": cuerpo, "adjunto": adjunto, **remitente})
        return True

    monkeypatch.setattr(correo, "enviar_correo", enviar)
    return enviados


def _escenario(crear_usuario, crear_proceso):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    otra = crear_usuario("ABOGADO_ADMIN", nombre="Otra abogada")
    abogado = crear_usuario("ABOGADO", nombre="Abogado externo")
    admin = crear_usuario("ADMIN", nombre="Administración")
    gloria = crear_usuario("CLIENTE", nombre="GLORIA INÉS RESTREPO")
    hernan = crear_usuario("CLIENTE", nombre="Hernán Cardona")
    sucesion = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria])
    ajeno = crear_proceso(otra, "Proceso ajeno", clientes=[hernan])
    return locals()


def _cuenta(http, cliente, proceso=None, valor=1_000_000, emitir=True, vence=None, concepto="Honorarios"):
    respuesta = http.post("/api/v2/cuentas-cobro", headers=H, json={
        "cliente_id": cliente.id, "proceso_id": proceso.id if proceso else None, "concepto": concepto,
        "lineas": [{"descripcion": concepto, "cantidad": 1, "valor_unitario": valor}],
        "vence_el": vence.isoformat() if vence else None, "emitir": emitir,
    })
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def test_borrador_emitir_y_lo_que_ve_el_cliente(iniciar, crear_usuario, crear_proceso, cliente_http, correos):
    e = _escenario(crear_usuario, crear_proceso)
    iniciar(e["abogada"])

    borrador = cliente_http.post("/api/v2/cuentas-cobro", headers=H, json={
        "cliente_id": e["gloria"].id, "proceso_id": e["sucesion"].id, "concepto": "Honorarios de la sucesión",
        "lineas": [{"descripcion": "Primera cuota", "cantidad": 1, "valor_unitario": 500_000},
                   {"descripcion": "Gastos de notaría", "cantidad": 2, "valor_unitario": 75_000}],
    }).json()
    assert (borrador["estado"], borrador["numero"], borrador["total"], borrador["saldo"]) == ("borrador", None, 650_000, 0)
    assert correos == []

    vence = date.today() + timedelta(days=10)
    editado = cliente_http.put(f"/api/v2/cuentas-cobro/{borrador['id']}", headers=H, json={
        "proceso_id": e["sucesion"].id, "concepto": "Honorarios de la sucesión",
        "lineas": [{"descripcion": "Primera cuota", "valor_unitario": 600_000}], "vence_el": vence.isoformat(),
    }).json()
    assert (editado["total"], editado["vence_el"]) == (600_000, vence.isoformat())

    emitida = cliente_http.post(f"/api/v2/cuentas-cobro/{borrador['id']}/emitir", headers=H).json()
    assert emitida["estado"] == "pendiente" and emitida["saldo"] == 600_000
    assert emitida["numero"].startswith("CC-") and emitida["numero"].endswith(f"{borrador['id']:05d}")
    [enviado] = correos
    assert enviado["para"] == e["gloria"].email
    assert enviado["asunto"] == "Su cuenta de cobro por $600.000"
    assert "Hola, Gloria:" in enviado["cuerpo"] and "\n\n\n" not in enviado["cuerpo"]
    assert enviado["adjunto"][1].startswith(b"%PDF")
    assert [x["estado"] for x in cliente_http.get(f"/api/v2/cuentas-cobro/{borrador['id']}").json()["entregas"]] == ["enviado"]

    # Ya emitida no se edita ni se descarta.
    assert cliente_http.put(f"/api/v2/cuentas-cobro/{borrador['id']}", headers=H, json={
        "concepto": "x", "lineas": [{"descripcion": "x", "valor_unitario": 1}]}).status_code == 409
    assert cliente_http.delete(f"/api/v2/cuentas-cobro/{borrador['id']}", headers=H).status_code == 409

    otro = _cuenta(cliente_http, e["gloria"], emitir=False, concepto="Borrador suelto")
    lista = cliente_http.get("/api/v2/cuentas-cobro").json()
    assert [c["id"] for c in lista["items"]] == [borrador["id"]]
    assert lista["resumen"] == {"por_cobrar": 600_000, "vencido": 0, "cuentas_vencidas": 0, "cobrado_mes": 0, "borradores": 1}

    pdf = cliente_http.get(f"/api/v2/cuentas-cobro/{borrador['id']}/pdf")
    assert pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")

    iniciar(e["gloria"])
    assert [c["id"] for c in cliente_http.get("/api/v2/cuentas-cobro?filtro=todas").json()["items"]] == [borrador["id"]]
    assert cliente_http.get(f"/api/v2/cuentas-cobro/{otro['id']}").status_code == 404
    assert cliente_http.get(f"/api/v2/cuentas-cobro/{borrador['id']}").json()["entregas"] == []
    assert cliente_http.get(f"/api/v2/cuentas-cobro/{borrador['id']}/pdf").status_code == 200
    assert cliente_http.post("/api/v2/cuentas-cobro", headers=H, json={
        "cliente_id": e["gloria"].id, "concepto": "x", "lineas": [{"descripcion": "x", "valor_unitario": 1}]}).status_code == 403


def test_quien_puede_cobrar(iniciar, crear_usuario, crear_proceso, cliente_http, correos):
    e = _escenario(crear_usuario, crear_proceso)
    cuerpo = {"concepto": "Honorarios", "lineas": [{"descripcion": "Cuota", "valor_unitario": 100}]}

    iniciar(e["abogado"])
    assert cliente_http.get("/api/v2/cuentas-cobro").status_code == 403

    iniciar(e["abogada"])
    # Hernán es cliente de otra abogada; tampoco puede cobrar en su proceso.
    assert cliente_http.post("/api/v2/cuentas-cobro", headers=H, json={**cuerpo, "cliente_id": e["hernan"].id}).status_code == 404
    assert cliente_http.post("/api/v2/cuentas-cobro", headers=H,
                             json={**cuerpo, "cliente_id": e["gloria"].id, "proceso_id": e["ajeno"].id}).status_code == 404
    propia = _cuenta(cliente_http, e["gloria"], e["sucesion"])

    iniciar(e["otra"])
    assert cliente_http.get(f"/api/v2/cuentas-cobro/{propia['id']}").status_code == 404
    assert cliente_http.get("/api/v2/cuentas-cobro?filtro=todas").json()["items"] == []

    iniciar(e["admin"])
    cuenta = _cuenta(cliente_http, e["hernan"], e["ajeno"])
    # ADMIN cobra a nombre del responsable del proceso.
    assert cuenta["abogado"]["nombre"] == "Otra abogada"
    assert {c["id"] for c in cliente_http.get("/api/v2/cuentas-cobro?filtro=todas").json()["items"]} == {propia["id"], cuenta["id"]}
    assert cliente_http.get("/api/v2/finanzas/configuracion").status_code == 200
    guardada = cliente_http.put("/api/v2/finanzas/configuracion", headers=H, json={
        "remitente_nombre": "Cobros AM", "remitente_email": " cobros@am.com.co ", "datos_pago": "Bancolombia 123", "reply_to": ""}).json()
    assert (guardada["remitente_email"], guardada["reply_to"], guardada["datos_pago"]) == ("cobros@am.com.co", None, "Bancolombia 123")
    invalido = cliente_http.put("/api/v2/finanzas/configuracion", headers=H, json={"remitente_nombre": "Cobros AM", "reply_to": "cobros arroba am"})
    assert invalido.status_code == 422 and "reply_to" in invalido.json()["campos"]

    iniciar(e["abogada"])
    assert cliente_http.get("/api/v2/finanzas/configuracion").status_code == 403
    _cuenta(cliente_http, e["gloria"], e["sucesion"])
    assert (correos[-1]["remitente_nombre"], correos[-1]["remitente_email"]) == ("Cobros AM", "cobros@am.com.co")
    assert "Bancolombia 123" in correos[-1]["cuerpo"]
    iniciar(e["gloria"])
    assert cliente_http.get("/api/v2/estado-cuenta").json()["datos_pago"] == "Bancolombia 123"


def test_pagos_abonos_reversion_y_estado_de_cuenta(iniciar, crear_usuario, crear_proceso, cliente_http, correos, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso)
    iniciar(e["abogada"])
    primera = _cuenta(cliente_http, e["gloria"], e["sucesion"], valor=1_000_000, vence=date.today() - timedelta(days=3))
    segunda = _cuenta(cliente_http, e["gloria"], e["sucesion"], valor=400_000, concepto="Gastos")
    assert cliente_http.get(f"/api/v2/cuentas-cobro/{primera['id']}").json()["vencida"] is True

    pago = {"cliente_id": e["gloria"].id, "proceso_id": e["sucesion"].id, "importe": 1_500_000, "metodo": "transferencia",
            "referencia": "Comprobante 778", "pagado_el": date.today().isoformat(), "clave": "pago-gloria-0001",
            "aplicaciones": [{"cuenta_id": primera["id"], "importe": 1_000_000}, {"cuenta_id": segunda["id"], "importe": 300_000}]}
    registrado = cliente_http.post("/api/v2/pagos", headers=H, json=pago)
    assert registrado.status_code == 201, registrado.text
    registrado = registrado.json()
    assert (registrado["aplicado"], registrado["disponible"], registrado["numero_recibo"][:3]) == (1_300_000, 200_000, "RP-")
    # El mismo envío repetido no duplica el pago; con otros datos es un conflicto.
    assert cliente_http.post("/api/v2/pagos", headers=H, json=pago).json()["id"] == registrado["id"]
    assert cliente_http.post("/api/v2/pagos", headers=H, json={**pago, "importe": 10}).status_code == 409
    assert sesion_bd.query(models.PagoFinanciero).count() == 1

    recibo = correos[-1]
    assert recibo["asunto"] == "Recibimos su pago de $1.500.000"
    assert "Le quedan $200.000 a su favor" in recibo["cuerpo"] and "> Le queda un saldo pendiente de $100.000." in recibo["cuerpo"]

    assert cliente_http.get(f"/api/v2/cuentas-cobro/{primera['id']}").json()["estado"] == "pagada"
    assert cliente_http.get(f"/api/v2/cuentas-cobro/{segunda['id']}").json()["estado"] == "parcial"
    # No se abona más que el saldo de la cuenta.
    demas = cliente_http.post(f"/api/v2/pagos/{registrado['id']}/aplicaciones", headers=H, json=[{"cuenta_id": segunda["id"], "importe": 150_000}])
    assert demas.status_code == 422
    abonado = cliente_http.post(f"/api/v2/pagos/{registrado['id']}/aplicaciones", headers=H,
                                json=[{"cuenta_id": segunda["id"], "importe": 100_000}]).json()
    assert abonado["disponible"] == 100_000

    # Un descuento no puede pasar del saldo; un cargo lo aumenta.
    assert cliente_http.post(f"/api/v2/cuentas-cobro/{segunda['id']}/ajustes", headers=H,
                             json={"tipo": "descuento", "importe": 1, "motivo": "Cortesía"}).status_code == 422
    con_cargo = cliente_http.post(f"/api/v2/cuentas-cobro/{segunda['id']}/ajustes", headers=H,
                                  json={"tipo": "cargo", "importe": 50_000, "motivo": "Copias autenticadas"}).json()
    assert (con_cargo["estado"], con_cargo["ajustes"], con_cargo["saldo"]) == ("parcial", 50_000, 50_000)

    estado = cliente_http.get(f"/api/v2/estado-cuenta?cliente_id={e['gloria'].id}").json()
    assert estado["totales"] == {"cobrado": 1_450_000, "pagado": 1_500_000, "saldo": 50_000, "vencido": 0, "a_favor": 100_000}
    assert cliente_http.get(f"/api/v2/estado-cuenta/pdf?cliente_id={e['gloria'].id}").content.startswith(b"%PDF")
    assert cliente_http.get("/api/v2/estado-cuenta").status_code == 422

    # Con pagos abonados no se anula; al revertir el pago, las cuentas vuelven a deber.
    assert cliente_http.post(f"/api/v2/cuentas-cobro/{primera['id']}/anular", headers=H, json={"motivo": "Error"}).json()["codigo"] == "tiene_pagos"
    revertido = cliente_http.post(f"/api/v2/pagos/{registrado['id']}/revertir", headers=H, json={"motivo": "Transferencia devuelta"}).json()
    assert (revertido["revertido"], revertido["disponible"], revertido["motivo_reversion"]) == (True, 0, "Transferencia devuelta")
    detalle = cliente_http.get(f"/api/v2/cuentas-cobro/{primera['id']}").json()
    assert (detalle["estado"], detalle["saldo"], detalle["vencida"]) == ("pendiente", 1_000_000, True)
    assert detalle["aplicaciones"][0]["revertido"] is True
    anulada = cliente_http.post(f"/api/v2/cuentas-cobro/{primera['id']}/anular", headers=H, json={"motivo": "Se cobró dos veces"}).json()
    assert (anulada["estado"], anulada["saldo"], anulada["motivo_anulacion"]) == ("anulada", 0, "Se cobró dos veces")
    assert cliente_http.post(f"/api/v2/pagos/{registrado['id']}/revertir", headers=H, json={"motivo": "Otra vez"}).status_code == 409
    resumen = cliente_http.get("/api/v2/cuentas-cobro").json()["resumen"]
    assert (resumen["por_cobrar"], resumen["cobrado_mes"]) == (450_000, 0)

    iniciar(e["gloria"])
    propio = cliente_http.get("/api/v2/estado-cuenta").json()
    assert propio["cliente"]["id"] == e["gloria"].id and propio["totales"]["saldo"] == 450_000
    assert propio["datos_pago"] is None
    assert [p["id"] for p in cliente_http.get("/api/v2/pagos").json()["items"]] == [registrado["id"]]
    assert cliente_http.get(f"/api/v2/pagos/{registrado['id']}/recibo").content.startswith(b"%PDF")
    assert cliente_http.post(f"/api/v2/pagos/{registrado['id']}/revertir", headers=H, json={"motivo": "Yo no"}).status_code == 403


def test_pago_sin_correo_queda_registrado(iniciar, crear_usuario, crear_proceso, cliente_http, correos, monkeypatch, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso)
    monkeypatch.setattr(correo, "enviar_correo", lambda *a, **k: False)
    iniciar(e["abogada"])
    cuenta = _cuenta(cliente_http, e["gloria"])
    [entrega] = cliente_http.get(f"/api/v2/cuentas-cobro/{cuenta['id']}").json()["entregas"]
    assert (entrega["estado"], entrega["error"]) == ("error", "El correo saliente no está configurado.")
    monkeypatch.setattr(correo, "enviar_correo", lambda *a, **k: True)
    assert cliente_http.post(f"/api/v2/cuentas-cobro/{cuenta['id']}/reenviar", headers=H).json()["estado"] == "enviado"
    # La fecha del pago no puede ser futura.
    futuro = cliente_http.post("/api/v2/pagos", headers=H, json={
        "cliente_id": e["gloria"].id, "importe": 1000, "metodo": "efectivo",
        "pagado_el": (date.today() + timedelta(days=2)).isoformat(), "clave": "pago-futuro-1"})
    assert futuro.status_code == 422
    assert sesion_bd.query(models.CuentaCobro).filter_by(id=cuenta["id"]).one().fecha_emision <= utc_ahora()
