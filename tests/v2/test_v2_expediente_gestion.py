from datetime import datetime, timedelta

from app import models
from app.nucleo.zona_horaria import a_colombia
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}
RADICADO = "05001311000420240031200"
OTRO = "11001310300120250012300"


def _avisos(monkeypatch):
    enviados = []

    def anotar(db, destinatario, *a, **k):
        enviados.append((destinatario.id, k.get("plantilla_clave")))

    for modulo in ("app.modulos.expedientes.avisos", "app.modulos.agenda.avisos"):
        monkeypatch.setattr(f"{modulo}.emitir_notificacion_workflow", anotar)
    return enviados


def test_crear_editar_y_listar_con_actividad(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    iniciar(abogada)

    r = cliente_http.post("/api/v2/procesos", headers=H, json={"nombre": "  Sucesión   Restrepo ", "descripcion": " "})
    assert r.status_code == 201, r.text
    proceso = r.json()
    assert (proceso["nombre"], proceso["descripcion"]) == ("Sucesión Restrepo", None)
    assert proceso["responsable"]["nombre"] == "Alejandra Muñoz" and proceso["puede_administrar"]

    sesion_bd.add(models.ProcesoCliente(proceso_id=proceso["id"], cliente_id=cliente.id))
    vencida = models.Tarea(titulo="Radicar memorial", usuario_id=abogada.id, proceso_id=proceso["id"],
                           fecha_limite=utc_ahora() - timedelta(days=1))
    # Vence el 6 de noviembre a las 4:59 a. m. UTC, que en Bogotá todavía es el 5.
    proxima = models.Tarea(titulo="Pedir avalúo", usuario_id=abogada.id, proceso_id=proceso["id"],
                           fecha_limite=datetime(2099, 11, 6, 4, 59, 0))
    sesion_bd.add_all([vencida, proxima])
    sesion_bd.commit()

    r = cliente_http.patch(f"/api/v2/procesos/{proceso['id']}", headers=H, json={"descripcion": "Inventario y avalúo"})
    assert r.json()["descripcion"] == "Inventario y avalúo"
    assert enviados == []  # Cambiar la descripción no le llega al cliente.
    r = cliente_http.patch(f"/api/v2/procesos/{proceso['id']}", headers=H, json={"nombre": "Sucesión de Jorge Restrepo"})
    assert r.json()["nombre"] == "Sucesión de Jorge Restrepo"
    assert enviados == [(cliente.id, "PROCESO_ACTUALIZACION")]
    assert cliente_http.patch(f"/api/v2/procesos/{proceso['id']}", headers=H, json={"nombre": " "}).status_code == 422

    fila = cliente_http.get("/api/v2/procesos").json()["items"][0]
    assert fila["actividad"] == {"tareas_abiertas": 2, "tareas_vencidas": 1, "por_revisar": 0,
                                 "pendiente_cliente": 0, "proximo_vencimiento": "2099-11-05"}

    # El cliente no crea procesos y en su listado no hay actividad interna.
    iniciar(cliente)
    assert cliente_http.post("/api/v2/procesos", headers=H, json={"nombre": "X"}).status_code == 403
    assert cliente_http.get("/api/v2/procesos").json()["items"][0]["actividad"] is None


def test_clientes_y_radicados_del_proceso(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    cliente.creado_por_abogado_id = abogada.id
    ajeno = crear_usuario("CLIENTE", nombre="Cliente de otro")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", radicados=[RADICADO])
    radicado = sesion_bd.query(models.Radicado).filter_by(numero=RADICADO).one()
    sesion_bd.add(models.Actuacion(radicado_id=radicado.id, orden=1, fecha_actuacion="2026-10-20", actuacion="Auto admite demanda"))
    sesion_bd.commit()
    iniciar(abogada)

    rel = cliente_http.get(f"/api/v2/procesos/{proceso.id}/relaciones").json()
    assert rel["clientes"] == [] and rel["puede_editar"]
    assert rel["radicados"][0]["total_actuaciones"] == 1
    assert rel["radicados"][0]["actuaciones"][0]["texto"] == "Auto admite demanda"

    r = cliente_http.post(f"/api/v2/procesos/{proceso.id}/clientes", headers=H, json={"cliente_id": cliente.id})
    assert r.status_code == 200, r.text
    assert r.json()["clientes"][0] == {"id": cliente.id, "nombre": "Gloria Restrepo", "email": cliente.email, "whatsapp": "3000000000"}
    assert enviados == [(cliente.id, "PROCESO_ACTUALIZACION")]
    assert cliente_http.post(f"/api/v2/procesos/{proceso.id}/clientes", headers=H, json={"cliente_id": cliente.id}).status_code == 409
    assert cliente_http.post(f"/api/v2/procesos/{proceso.id}/clientes", headers=H, json={"cliente_id": ajeno.id}).status_code == 404

    r = cliente_http.post(f"/api/v2/procesos/{proceso.id}/radicados", headers=H, json={"numero": "11001-31-03-001-2025-00123-00"})
    assert r.status_code == 201, r.text
    agregado = r.json()
    assert [x["numero"] for x in agregado["relaciones"]["radicados"]] == [RADICADO, OTRO]
    assert agregado["consulta_id"] is not None
    assert sesion_bd.get(models.ConsultaRadicado, agregado["consulta_id"]).estado == "ENCOLADA"
    r = cliente_http.post(f"/api/v2/procesos/{proceso.id}/radicados", headers=H, json={"numero": OTRO})
    assert r.status_code == 409
    r = cliente_http.post(f"/api/v2/procesos/{proceso.id}/radicados", headers=H, json={"numero": "1234567890123456789012x"})
    assert r.status_code == 422 and "numero" in r.json()["campos"]

    r = cliente_http.delete(f"/api/v2/procesos/{proceso.id}/radicados/{agregado['radicado_id']}", headers=H)
    assert [x["numero"] for x in r.json()["radicados"]] == [RADICADO]
    assert sesion_bd.get(models.Radicado, agregado["radicado_id"]) is not None  # El radicado sigue en la firma.
    r = cliente_http.delete(f"/api/v2/procesos/{proceso.id}/clientes/{cliente.id}", headers=H)
    assert r.json()["clientes"] == []
    assert cliente_http.delete(f"/api/v2/procesos/{proceso.id}/clientes/{cliente.id}", headers=H).status_code == 404

    iniciar(cliente)
    assert cliente_http.get(f"/api/v2/procesos/{proceso.id}/relaciones").status_code == 403


def test_equipo_del_proceso(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    colega = crear_usuario("ABOGADO_ADMIN", nombre="Bruno Díaz")
    otra = crear_usuario("ABOGADO_ADMIN", nombre="Carla Pérez")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", colaboradores=[(otra, False)])
    iniciar(abogada)

    equipo = cliente_http.get(f"/api/v2/procesos/{proceso.id}/equipo").json()
    assert equipo["admite_equipo"] and equipo["puede_gestionar"]
    assert [m["nombre"] for m in equipo["miembros"]] == ["Carla Pérez"]
    assert [d["nombre"] for d in equipo["disponibles"]] == ["Bruno Díaz"]

    r = cliente_http.post(f"/api/v2/procesos/{proceso.id}/equipo", headers=H, json={"abogado_id": colega.id, "visible_cliente": True})
    assert r.status_code == 201, r.text
    assert [(m["nombre"], m["visible_cliente"]) for m in r.json()["miembros"]] == [("Bruno Díaz", True), ("Carla Pérez", False)]
    assert r.json()["disponibles"] == []
    assert enviados == [(colega.id, "COLABORADOR_AGREGADO")]
    assert cliente_http.post(f"/api/v2/procesos/{proceso.id}/equipo", headers=H, json={"abogado_id": abogada.id}).status_code == 409

    r = cliente_http.patch(f"/api/v2/procesos/{proceso.id}/equipo/{otra.id}", headers=H, json={"visible_cliente": True})
    assert all(m["visible_cliente"] for m in r.json()["miembros"])
    r = cliente_http.delete(f"/api/v2/procesos/{proceso.id}/equipo/{otra.id}", headers=H)
    assert [m["nombre"] for m in r.json()["miembros"]] == ["Bruno Díaz"]

    # Un colaborador ve el equipo pero no lo cambia.
    iniciar(colega)
    equipo = cliente_http.get(f"/api/v2/procesos/{proceso.id}/equipo").json()
    assert not equipo["puede_gestionar"] and equipo["disponibles"] == []
    assert cliente_http.delete(f"/api/v2/procesos/{proceso.id}/equipo/{colega.id}", headers=H).status_code == 403


def test_eventos_del_proceso(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    otro = crear_usuario("CLIENTE", nombre="Hernán Restrepo")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente, otro])
    iniciar(abogada)

    dia = (a_colombia(utc_ahora()) + timedelta(days=3)).date().isoformat()
    r = cliente_http.post("/api/v2/agenda/eventos", headers=H, json={
        "proceso_id": proceso.id, "tipo": "AUDIENCIA", "titulo": " Audiencia  inicial ",
        "inicio": f"{dia}T09:00:00-05:00", "fin": f"{dia}T10:30:00-05:00",
    })
    assert r.status_code == 201, r.text
    evento = r.json()
    assert evento["titulo"] == "Audiencia inicial" and evento["etiqueta"] == "Audiencia"
    assert evento["inicio"].startswith(f"{dia}T09:00") and evento["responsable"]["nombre"] == "Alejandra Muñoz"
    assert sorted(enviados) == sorted([(cliente.id, "EVENTO_AGENDA"), (otro.id, "EVENTO_AGENDA")])

    r = cliente_http.post("/api/v2/agenda/eventos", headers=H, json={
        "proceso_id": proceso.id, "titulo": "X", "inicio": f"{dia}T09:00:00-05:00", "fin": f"{dia}T08:00:00-05:00",
    })
    assert r.status_code == 422
    r = cliente_http.post("/api/v2/agenda/eventos", headers=H, json={
        "proceso_id": proceso.id, "tipo": "FIRMA_CONTRATO", "titulo": "X", "inicio": f"{dia}T09:00:00-05:00",
    })
    assert r.status_code == 422  # Las firmas se agendan desde el contrato.

    enviados.clear()
    r = cliente_http.patch(f"/api/v2/agenda/eventos/{evento['id']}", headers=H, json={"inicio": f"{dia}T08:00:00-05:00", "cliente_id": cliente.id})
    assert r.status_code == 200, r.text
    assert r.json()["inicio"].startswith(f"{dia}T08:00") and r.json()["cliente"]["nombre"] == "Gloria Restrepo"
    assert enviados == [(cliente.id, "EVENTO_AGENDA")]
    r = cliente_http.patch(f"/api/v2/agenda/eventos/{evento['id']}", headers=H, json={"fin": f"{dia}T07:00:00-05:00"})
    assert r.status_code == 422

    pasado = models.EventoAgenda(titulo="Reunión pasada", tipo="REUNION", fecha_inicio=utc_ahora() - timedelta(days=2),
                                 proceso_id=proceso.id, responsable_id=abogada.id)
    sesion_bd.add(pasado)
    sesion_bd.commit()
    lista = cliente_http.get("/api/v2/agenda/eventos", params={"proceso_id": proceso.id}).json()["items"]
    assert [e["titulo"] for e in lista] == ["Audiencia inicial", "Reunión pasada"]

    enviados.clear()
    assert cliente_http.delete(f"/api/v2/agenda/eventos/{pasado.id}", headers=H).status_code == 204
    assert enviados == []  # Lo que ya pasó no se avisa.
    assert cliente_http.delete(f"/api/v2/agenda/eventos/{evento['id']}", headers=H).status_code == 204
    assert enviados == [(cliente.id, "EVENTO_AGENDA")]

    iniciar(cliente)
    assert cliente_http.get("/api/v2/agenda/eventos", params={"proceso_id": proceso.id}).status_code == 403
