from datetime import timedelta

from app import models
from app.nucleo.zona_horaria import a_colombia
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}
RADICADO = "05001311000420240031200"


def _avisos(monkeypatch):
    enviados, lanzados = [], []
    monkeypatch.setattr("app.modulos.tareas.avisos.emitir_notificacion_workflow",
                        lambda db, destinatario, *a, **k: enviados.append((destinatario.id, k.get("plantilla_clave"))))
    monkeypatch.setattr("app.modulos.tareas.recordatorios.iniciar_workflow_recordatorio",
                        lambda db, recordatorio_id: lanzados.append(recordatorio_id))
    return enviados, lanzados


def _hoy():
    return a_colombia(utc_ahora()).date()


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente], radicados=[RADICADO])
    radicado = sesion_bd.query(models.Radicado).filter_by(numero=RADICADO).one()
    actuacion = models.Actuacion(radicado_id=radicado.id, orden=1, fecha_actuacion="2026-10-20", actuacion="Auto admite demanda")
    sesion_bd.add(actuacion)
    sesion_bd.commit()
    return abogada, cliente, proceso, radicado, actuacion


def test_crear_ver_y_cambiar_una_tarea(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados, lanzados = _avisos(monkeypatch)
    abogada, cliente, proceso, radicado, actuacion = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(abogada)

    vinculos = cliente_http.get(f"/api/v2/procesos/{proceso.id}/vinculos").json()
    assert vinculos["clientes"] == [{"id": cliente.id, "nombre": "Gloria Restrepo"}]
    assert vinculos["radicados"][0]["actuaciones"] == [{"id": actuacion.id, "texto": "Auto admite demanda", "fecha": "2026-10-20"}]

    vence = _hoy() + timedelta(days=5)
    r = cliente_http.post("/api/v2/tareas", headers=H, json={
        "titulo": "  Aportar   inventario ", "proceso_id": proceso.id, "actuacion_id": actuacion.id,
        "cliente_id": cliente.id, "fecha_limite": vence.isoformat(), "prioridad": "ALTA",
    })
    assert r.status_code == 201, r.text
    tarea = r.json()
    assert tarea["titulo"] == "Aportar inventario"
    assert tarea["radicado"] == {"id": radicado.id, "numero": RADICADO}
    assert tarea["actuacion"]["texto"] == "Auto admite demanda"
    assert tarea["cliente"]["nombre"] == "Gloria Restrepo"
    assert tarea["responsable"]["nombre"] == "Alejandra Muñoz"
    assert tarea["fecha_limite"].startswith(vence.isoformat())
    assert len(tarea["avisos_automaticos"]) == 2 and len(lanzados) == 2
    assert enviados == [(cliente.id, "TAREA_ACCION")]

    # Mover la fecha rehace los avisos automáticos; cerrar la tarea los descarta.
    r = cliente_http.patch(f"/api/v2/tareas/{tarea['id']}", headers=H, json={"fecha_limite": (vence + timedelta(days=2)).isoformat()})
    assert r.status_code == 200, r.text
    assert len(r.json()["avisos_automaticos"]) == 2
    r = cliente_http.patch(f"/api/v2/tareas/{tarea['id']}", headers=H, json={"estado": "COMPLETADA"})
    assert r.json()["estado"] == "COMPLETADA" and r.json()["completada_en"]
    assert r.json()["avisos_automaticos"] == []
    assert sesion_bd.query(models.RecordatorioTarea).filter_by(tarea_id=tarea["id"]).count() == 0

    # Quitar el proceso deja la tarea general, sin radicado ni cliente.
    r = cliente_http.patch(f"/api/v2/tareas/{tarea['id']}", headers=H, json={"proceso_id": None})
    assert r.status_code == 200, r.text
    assert (r.json()["proceso"], r.json()["radicado"], r.json()["actuacion"], r.json()["cliente"]) == (None, None, None, None)

    assert cliente_http.delete(f"/api/v2/tareas/{tarea['id']}", headers=H).status_code == 204
    assert cliente_http.get(f"/api/v2/tareas/{tarea['id']}").status_code == 404


def test_valida_los_vinculos_y_las_fechas(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    _avisos(monkeypatch)
    abogada, cliente, proceso, _radicado, actuacion = _escenario(crear_usuario, crear_proceso, sesion_bd)
    otro = crear_proceso(abogada, "Otro proceso")
    ajena = crear_proceso(crear_usuario(), "Ajeno")
    iniciar(abogada)

    def crear(**datos):
        return cliente_http.post("/api/v2/tareas", headers=H, json={"titulo": "Algo", **datos})

    assert crear(cliente_id=cliente.id).json()["campos"] == {"proceso_id": "Elija primero el proceso."}
    assert crear(proceso_id=otro.id, cliente_id=cliente.id).json()["campos"] == {"cliente_id": "Elija un cliente del proceso."}
    assert crear(proceso_id=otro.id, actuacion_id=actuacion.id).json()["campos"] == {"actuacion_id": "Elija una actuación de la lista."}
    assert crear(proceso_id=ajena.id).status_code == 404
    assert crear(fecha_limite=(_hoy() - timedelta(days=1)).isoformat()).json()["codigo"] == "fecha_pasada"
    assert crear(titulo="   ").status_code == 422

    cliente_portal = crear_usuario("CLIENTE")
    iniciar(cliente_portal)
    assert crear().status_code == 403


def test_subtareas_y_recordatorios(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados, lanzados = _avisos(monkeypatch)
    abogada, cliente, proceso, _radicado, _actuacion = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(abogada)
    tarea = cliente_http.post("/api/v2/tareas", headers=H, json={"titulo": "Inventario", "proceso_id": proceso.id}).json()
    base = f"/api/v2/tareas/{tarea['id']}"

    r = cliente_http.post(f"{base}/subtareas", headers=H, json={"titulo": "Enviar escritura", "cliente_id": cliente.id})
    assert r.status_code == 201, r.text
    subtarea = r.json()["subtareas"][0]
    assert subtarea["cliente"]["nombre"] == "Gloria Restrepo"
    assert (cliente.id, "SUBTAREA_ASIGNADA") in enviados
    r = cliente_http.post(f"{base}/subtareas", headers=H, json={"titulo": "Revisar avalúo"})
    assert [s["titulo"] for s in r.json()["subtareas"]] == ["Enviar escritura", "Revisar avalúo"]
    r = cliente_http.patch(f"{base}/subtareas/{subtarea['id']}", headers=H, json={"completada": True})
    assert r.json()["subtareas"][0]["completada"] is True
    r = cliente_http.patch(f"{base}/subtareas/{subtarea['id']}", headers=H, json={"cliente_id": None})
    assert r.json()["subtareas"][0]["cliente"] is None
    r = cliente_http.delete(f"{base}/subtareas/{subtarea['id']}", headers=H)
    assert [s["titulo"] for s in r.json()["subtareas"]] == ["Revisar avalúo"]

    # Anticipación sin fecha límite no se puede; un momento exacto sí.
    r = cliente_http.post(f"{base}/recordatorios", headers=H, json={"anticipacion_minutos": 60})
    assert r.json()["campos"] == {"anticipacion_minutos": "Ponga primero una fecha límite."}
    momento = (utc_ahora() + timedelta(days=1)).replace(microsecond=0).isoformat() + "+00:00"
    r = cliente_http.post(f"{base}/recordatorios", headers=H, json={"fecha_hora": momento, "whatsapp": True})
    assert r.status_code == 201, r.text
    recordatorio = r.json()["recordatorios"][0]
    assert recordatorio["correo"] and recordatorio["whatsapp"] and recordatorio["cuando"]
    assert lanzados == [recordatorio["id"]]
    r = cliente_http.patch(f"{base}/recordatorios/{recordatorio['id']}", headers=H, json={"activo": False})
    assert r.json()["recordatorios"][0]["activo"] is False
    r = cliente_http.delete(f"{base}/recordatorios/{recordatorio['id']}", headers=H)
    assert r.json()["recordatorios"] == []

    cliente_http.patch(base, headers=H, json={"estado": "CANCELADA"})
    r = cliente_http.post(f"{base}/recordatorios", headers=H, json={"fecha_hora": momento})
    assert r.status_code == 409


def test_otro_abogado_no_ve_la_tarea(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    _avisos(monkeypatch)
    abogada, _cliente, proceso, _radicado, _actuacion = _escenario(crear_usuario, crear_proceso, sesion_bd)
    tarea = models.Tarea(usuario_id=abogada.id, proceso_id=proceso.id, titulo="Privada")
    sesion_bd.add(tarea)
    sesion_bd.commit()
    iniciar(crear_usuario())
    assert cliente_http.get(f"/api/v2/tareas/{tarea.id}").status_code == 404
    assert cliente_http.patch(f"/api/v2/tareas/{tarea.id}", headers=H, json={"titulo": "X"}).status_code == 404
    assert cliente_http.get(f"/api/v2/procesos/{proceso.id}/vinculos").status_code == 404
