from app import models
from app.modulos.etapas.linea import plantilla_predeterminada

CSRF = {"X-AM-Solicitud": "1"}


def _generales(sesion_bd) -> dict[str, int]:
    plantilla = plantilla_predeterminada(sesion_bd)
    sesion_bd.commit()
    return {e.nombre: e.id for e in plantilla.etapas}


def test_cambiar_etapa_guarda_historial_y_folio(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente])
    etapas = _generales(sesion_bd)
    iniciar(abogada)
    inicial = cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()
    assert inicial["etapa"] is None and inicial["plantilla"]["nombre"] == "General"
    assert [e["nombre"] for e in inicial["linea_etapas"]] == ["Demanda", "Admisión", "Pruebas", "Audiencia", "Sentencia"]

    url = f"/api/v2/procesos/{proceso.id}/etapa"
    assert cliente_http.patch(url, json={"etapa_id": etapas["Demanda"]}, headers=CSRF).status_code == 200
    detalle = cliente_http.patch(url, json={"etapa_id": etapas["Admisión"], "nota": "Auto admisorio del 27 de octubre."}, headers=CSRF).json()
    assert detalle["etapa"] == {"id": etapas["Admisión"], "nombre": "Admisión", "posicion": 2, "total": 5}
    assert [(e["etapa"]["nombre"], e["nota"], e["autor"]) for e in detalle["etapas"]] == [
        ("Demanda", None, "Alejandra Muñoz"),
        ("Admisión", "Auto admisorio del 27 de octubre.", "Alejandra Muñoz"),
    ]
    assert cliente_http.get("/api/v2/procesos").json()["items"][0]["etapa"]["nombre"] == "Admisión"

    repetida = cliente_http.patch(url, json={"etapa_id": etapas["Admisión"]}, headers=CSRF)
    assert repetida.status_code == 409 and repetida.json()["codigo"] == "misma_etapa"
    assert cliente_http.patch(url, json={"etapa_id": 9999}, headers=CSRF).status_code == 422

    folio = cliente_http.get(f"/api/v2/procesos/{proceso.id}/folios").json()["items"][0]
    assert folio["tipo"] == "etapa"
    assert folio["titulo"] == "El proceso pasa a la etapa de admisión"
    assert folio["nuevo"] is False

    # El cliente ve la etapa y las fechas, no las notas internas; tampoco puede cambiarla.
    iniciar(cliente)
    visto = cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()
    assert visto["etapa"]["nombre"] == "Admisión" and [e["nota"] for e in visto["etapas"]] == [None, None]
    assert cliente_http.patch(url, json={"etapa_id": etapas["Pruebas"]}, headers=CSRF).status_code == 403
    assert cliente_http.get("/api/v2/plantillas-etapas").status_code == 403


def test_solo_quien_ve_el_proceso_cambia_la_etapa(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    responsable = crear_usuario()
    colaboradora = crear_usuario("ABOGADO_ADMIN")
    ajeno = crear_usuario()
    proceso = crear_proceso(responsable, colaboradores=[(colaboradora, False)])
    etapas = _generales(sesion_bd)

    iniciar(colaboradora)
    assert cliente_http.patch(f"/api/v2/procesos/{proceso.id}/etapa", json={"etapa_id": etapas["Pruebas"]}, headers=CSRF).status_code == 200
    iniciar(ajeno)
    assert cliente_http.patch(f"/api/v2/procesos/{proceso.id}/etapa", json={"etapa_id": etapas["Audiencia"]}, headers=CSRF).status_code == 404


def test_plantillas_de_etapas(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario("ABOGADO")
    directora = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    proceso = crear_proceso(directora, "Conciliación Ospina")
    etapas = _generales(sesion_bd)

    iniciar(abogado)
    lista = cliente_http.get("/api/v2/plantillas-etapas").json()["items"]
    assert [(p["nombre"], p["predeterminada"], p["procesos"]) for p in lista] == [("General", True, 1)]
    nueva = {"nombre": "Conciliación", "etapas": [{"nombre": "Solicitud"}, {"nombre": "Audiencia de conciliación"}]}
    assert cliente_http.post("/api/v2/plantillas-etapas", json=nueva, headers=CSRF).status_code == 403

    iniciar(directora)
    r = cliente_http.post("/api/v2/plantillas-etapas", json={
        "nombre": "  Conciliación ", "descripcion": "Antes de ir al juzgado.",
        "etapas": [
            {"nombre": "Solicitud", "explicacion": "Se pide la cita en el centro de conciliación."},
            {"nombre": "Audiencia de conciliación", "explicacion": "Las partes se reúnen para buscar un acuerdo."},
            {"nombre": "Acta"},
        ],
    }, headers=CSRF)
    assert r.status_code == 201
    plantilla = r.json()
    assert plantilla["nombre"] == "Conciliación" and not plantilla["predeterminada"]
    ids = {e["nombre"]: e["id"] for e in plantilla["etapas"]}

    # Elegir una etapa de otra plantilla cambia la plantilla del proceso.
    url = f"/api/v2/procesos/{proceso.id}/etapa"
    detalle = cliente_http.patch(url, json={"etapa_id": ids["Solicitud"]}, headers=CSRF).json()
    assert detalle["plantilla"]["nombre"] == "Conciliación"
    assert [e["nombre"] for e in detalle["linea_etapas"]] == ["Solicitud", "Audiencia de conciliación", "Acta"]
    assert detalle["etapa"]["total"] == 3

    # Al cliente le llega la explicación de la plantilla.
    proceso_bd = sesion_bd.get(models.Proceso, proceso.id)
    sesion_bd.refresh(proceso_bd)
    assert proceso_bd.etapa.explicacion == "Se pide la cita en el centro de conciliación."

    # Reordenar, renombrar y quitar: la etapa en uso se desactiva, la que nadie usó se borra.
    editada = cliente_http.put(f"/api/v2/plantillas-etapas/{plantilla['id']}", json={
        "nombre": "Conciliación extrajudicial", "etapas": [
            {"id": ids["Audiencia de conciliación"], "nombre": "Audiencia"},
            {"nombre": "Cierre"},
        ],
    }, headers=CSRF).json()
    assert [(e["nombre"], e["activa"]) for e in editada["etapas"]] == [("Audiencia", True), ("Cierre", True), ("Solicitud", False)]
    assert editada["procesos"] == 1 and editada["etapas"][2]["procesos"] == 1
    detalle = cliente_http.get(f"/api/v2/procesos/{proceso.id}").json()
    # La etapa actual sigue en la línea aunque esté desactivada.
    assert [e["nombre"] for e in detalle["linea_etapas"]] == ["Audiencia", "Cierre", "Solicitud"]
    assert cliente_http.patch(url, json={"etapa_id": ids["Solicitud"]}, headers=CSRF).status_code in (409, 422)

    # Reglas.
    sin_activas = cliente_http.put(f"/api/v2/plantillas-etapas/{plantilla['id']}", json={
        "nombre": "Conciliación", "etapas": [{"id": ids["Audiencia de conciliación"], "nombre": "Audiencia", "activa": False}]}, headers=CSRF)
    assert sin_activas.status_code == 422 and "etapas" in sin_activas.json()["campos"]
    repetida = cliente_http.post("/api/v2/plantillas-etapas", json={"nombre": "Otra", "etapas": [{"nombre": "Uno"}, {"nombre": "uno"}]}, headers=CSRF)
    assert repetida.status_code == 422 and "etapas" in repetida.json()["campos"]
    general = lista[0]["id"]
    quitar = cliente_http.put(f"/api/v2/plantillas-etapas/{general}", json={
        "nombre": "General", "predeterminada": False, "etapas": [{"id": i, "nombre": n} for n, i in etapas.items()]}, headers=CSRF)
    assert quitar.status_code == 409 and quitar.json()["codigo"] == "plantilla_predeterminada"
    assert cliente_http.delete(f"/api/v2/plantillas-etapas/{plantilla['id']}", headers=CSRF).json()["codigo"] == "plantilla_en_uso"

    # Pasar la predeterminada a otra.
    cliente_http.put(f"/api/v2/plantillas-etapas/{plantilla['id']}", json={
        "nombre": "Conciliación extrajudicial", "predeterminada": True,
        "etapas": [{"id": e["id"], "nombre": e["nombre"], "activa": e["activa"]} for e in editada["etapas"]]}, headers=CSRF)
    lista = cliente_http.get("/api/v2/plantillas-etapas?todas=true").json()["items"]
    assert [(p["nombre"], p["predeterminada"]) for p in lista] == [("Conciliación extrajudicial", True), ("General", False)]

    # Una plantilla sin uso se borra.
    vacia = cliente_http.post("/api/v2/plantillas-etapas", json={"nombre": "Tutela", "etapas": [{"nombre": "Fallo"}]}, headers=CSRF).json()
    assert cliente_http.delete(f"/api/v2/plantillas-etapas/{vacia['id']}", headers=CSRF).status_code == 204

    acciones = [e.accion for e in sesion_bd.query(models.EventoAuditoria).order_by(models.EventoAuditoria.id)]
    assert "etapas.plantilla.crear" in acciones and acciones[-1] == "etapas.plantilla.eliminar"
