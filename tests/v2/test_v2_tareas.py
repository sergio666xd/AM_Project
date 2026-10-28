from datetime import date, timedelta

from app import models
from app.nucleo.zona_horaria import a_colombia
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _tarea(sesion_bd, responsable, proceso, titulo, vence_en=None, estado="PENDIENTE", **extra):
    tarea = models.Tarea(usuario_id=responsable.id, proceso_id=proceso.id if proceso else None, titulo=titulo,
                         estado=models.EstadoTarea(estado),
                         fecha_limite=utc_ahora() + vence_en if vence_en is not None else None, **extra)
    sesion_bd.add(tarea)
    sesion_bd.commit()
    return tarea


def _sin_avisos(monkeypatch):
    enviados = []
    monkeypatch.setattr("app.routers.tareas.emitir_notificacion_workflow", lambda *a, **k: enviados.append(k))
    monkeypatch.setattr("app.routers.tareas.iniciar_workflow_recordatorio", lambda *a, **k: None)
    return enviados


def test_lista_las_tareas_visibles_con_su_resumen(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    otro = crear_usuario(nombre="Otro abogado")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente], radicados=["05001311000420240031200"])
    colaboro = crear_proceso(otro, "Donde colaboro", colaboradores=[(abogada, True)])
    archivado = crear_proceso(abogada, "Archivado", archivado=True)
    ajeno = crear_proceso(otro, "Ajeno")

    vencida = _tarea(sesion_bd, abogada, proceso, "Contestar demanda", -timedelta(days=1), cliente_id=cliente.id)
    sesion_bd.add(models.Subtarea(tarea_id=vencida.id, titulo="Borrador", completada=True))
    sesion_bd.add(models.Subtarea(tarea_id=vencida.id, titulo="Radicar"))
    _tarea(sesion_bd, otro, colaboro, "Del colaborador", timedelta(days=3))
    _tarea(sesion_bd, abogada, None, "Renovar tarjeta", timedelta(days=20))
    _tarea(sesion_bd, abogada, proceso, "Hecha", -timedelta(days=2), estado="COMPLETADA", completada_en=utc_ahora())
    _tarea(sesion_bd, abogada, archivado, "De un archivado", timedelta(days=1))
    _tarea(sesion_bd, otro, ajeno, "Ajena", timedelta(days=1))
    _tarea(sesion_bd, otro, None, "General de otro", timedelta(days=1))
    iniciar(abogada)

    lista = cliente_http.get("/api/v2/tareas").json()
    assert [t["titulo"] for t in lista["items"]] == ["Contestar demanda", "Del colaborador", "Renovar tarjeta"]
    assert lista["total"] == 3
    assert lista["resumen"] == {"abiertas": 3, "vencidas": 1, "semana": 1, "completadas": 1}
    primera = lista["items"][0]
    assert primera["vencida"] is True
    assert primera["proceso"] == {"id": proceso.id, "nombre": "Sucesión Restrepo"}
    assert primera["cliente"] == {"id": cliente.id, "nombre": "Gloria Restrepo"}
    assert primera["responsable"]["nombre"] == "Alejandra Muñoz"
    assert primera["subtareas"] == {"total": 2, "hechas": 1}
    assert lista["items"][2]["proceso"] is None

    assert [t["titulo"] for t in cliente_http.get("/api/v2/tareas?grupo=vencidas").json()["items"]] == ["Contestar demanda"]
    assert [t["titulo"] for t in cliente_http.get("/api/v2/tareas?grupo=completadas").json()["items"]] == ["Hecha"]
    assert [t["titulo"] for t in cliente_http.get("/api/v2/tareas?solo_mias=true").json()["items"]] == ["Contestar demanda", "Renovar tarjeta"]
    filtrada = cliente_http.get(f"/api/v2/tareas?grupo=todas&proceso_id={proceso.id}").json()
    assert {t["titulo"] for t in filtrada["items"]} == {"Contestar demanda", "Hecha"}


def test_el_cliente_no_ve_las_tareas_del_equipo(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario("CLIENTE"))
    assert cliente_http.get("/api/v2/tareas").status_code == 403


def test_completar_y_reprogramar_en_lote(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _sin_avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN")
    proceso = crear_proceso(abogada, "Sucesión")
    a = _tarea(sesion_bd, abogada, proceso, "Una", timedelta(days=3))
    b = _tarea(sesion_bd, abogada, proceso, "Otra", timedelta(days=5))
    sesion_bd.add(models.RecordatorioTarea(tarea_id=a.id, anticipacion_minutos=1440, interno_sistema=True, activo=True))
    sesion_bd.commit()
    iniciar(abogada)

    respuesta = cliente_http.patch("/api/v2/tareas/lote", json={"ids": [a.id, b.id], "estado": "COMPLETADA"}, headers=H)
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["mensaje"] == "2 tareas actualizadas"
    sesion_bd.expire_all()
    assert {t.estado for t in sesion_bd.query(models.Tarea)} == {models.EstadoTarea.COMPLETADA}
    assert sesion_bd.get(models.Tarea, a.id).completada_en is not None
    assert sesion_bd.query(models.RecordatorioTarea).count() == 0, "completar descarta los recordatorios"
    assert enviados == [], "la responsable no se avisa a sí misma"

    manana = a_colombia(utc_ahora()).date() + timedelta(days=1)
    respuesta = cliente_http.patch("/api/v2/tareas/lote", headers=H, json={
        "ids": [a.id], "estado": "PENDIENTE", "prioridad": "URGENTE", "fecha_limite": manana.isoformat(),
    })
    assert respuesta.status_code == 200, respuesta.text
    sesion_bd.expire_all()
    tarea = sesion_bd.get(models.Tarea, a.id)
    assert (tarea.estado, tarea.prioridad, tarea.completada_en) == (models.EstadoTarea.PENDIENTE, models.PrioridadTarea.URGENTE, None)
    assert a_colombia(tarea.fecha_limite).strftime("%Y-%m-%d %H:%M") == f"{manana.isoformat()} 23:59"
    assert sesion_bd.query(models.RecordatorioTarea).filter_by(tarea_id=a.id, interno_sistema=True).count() >= 1

    cliente_http.patch("/api/v2/tareas/lote", json={"ids": [a.id], "fecha_limite": None}, headers=H)
    sesion_bd.expire_all()
    assert sesion_bd.get(models.Tarea, a.id).fecha_limite is None


def test_el_lote_es_todo_o_nada(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    _sin_avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN")
    mia = _tarea(sesion_bd, abogada, crear_proceso(abogada), "Mía")
    otro = crear_usuario()
    ajena = _tarea(sesion_bd, otro, crear_proceso(otro), "Ajena")
    iniciar(abogada)

    respuesta = cliente_http.patch("/api/v2/tareas/lote", json={"ids": [mia.id, ajena.id], "eliminar": True}, headers=H)
    assert respuesta.status_code == 404
    assert respuesta.json()["campos"] == {"ids": str(ajena.id)}
    assert sesion_bd.query(models.Tarea).count() == 2

    assert cliente_http.patch("/api/v2/tareas/lote", json={"ids": [mia.id]}, headers=H).status_code == 422
    assert cliente_http.patch("/api/v2/tareas/lote", json={"ids": [mia.id], "eliminar": True, "estado": "PENDIENTE"}, headers=H).status_code == 422
    ayer = a_colombia(utc_ahora()).date() - timedelta(days=1)
    pasada = cliente_http.patch("/api/v2/tareas/lote", json={"ids": [mia.id], "fecha_limite": ayer.isoformat()}, headers=H)
    assert pasada.status_code == 400 and pasada.json()["codigo"] == "fecha_pasada"

    eliminar = cliente_http.patch("/api/v2/tareas/lote", json={"ids": [mia.id], "eliminar": True}, headers=H)
    assert eliminar.json()["mensaje"] == "1 tarea eliminada"
    assert [t.titulo for t in sesion_bd.query(models.Tarea)] == ["Ajena"]


PLANTILLA = {
    "nombre": "Traslado de excepciones",
    "descripcion": "Pronunciarse dentro del traslado.",
    "palabras_clave": ["Traslado", " excepciones ", ""],
    "pasos": [
        {"titulo": "Estudiar las excepciones", "dias_habiles": 2, "prioridad": "ALTA"},
        {"titulo": "Radicar el escrito", "dias_habiles": 9, "prioridad": "URGENTE"},
        {"titulo": "Avisar al cliente", "dias_habiles": None},
    ],
}


def test_plantillas_se_crean_sugieren_y_protegen(iniciar, crear_usuario, cliente_http, sesion_bd):
    abogado = crear_usuario("ABOGADO")
    iniciar(abogado)
    creada = cliente_http.post("/api/v2/tareas/plantillas", json=PLANTILLA, headers=H)
    assert creada.status_code == 201, creada.text
    plantilla = creada.json()
    assert plantilla["palabras_clave"] == ["traslado", "excepciones"]
    assert plantilla["pasos"][2] == {"titulo": "Avisar al cliente", "dias_habiles": None, "prioridad": "MEDIA"}
    assert plantilla["puede_editar"] is True
    sesion_bd.add(models.PlantillaTarea(nombre="Audiencia", palabras_clave=["audiencia"], pasos=[{"titulo": "Preparar"}]))
    sesion_bd.commit()

    sugeridas = cliente_http.get("/api/v2/tareas/plantillas", params={"para": "Córrase TRASLADO de las excepciones de mérito"}).json()
    assert [(p["nombre"], p["coincide"]) for p in sugeridas["items"]] == [("Traslado de excepciones", True), ("Audiencia", False)]
    assert sugeridas["items"][1]["puede_editar"] is False, "la sembrada la edita quien administra"

    otro = crear_usuario("ABOGADO")
    iniciar(otro)
    assert cliente_http.put(f"/api/v2/tareas/plantillas/{plantilla['id']}", json=PLANTILLA, headers=H).status_code == 403
    iniciar(crear_usuario("ABOGADO_ADMIN"))
    editada = cliente_http.put(f"/api/v2/tareas/plantillas/{plantilla['id']}", json={**PLANTILLA, "nombre": "Excepciones"}, headers=H)
    assert editada.json()["nombre"] == "Excepciones"
    assert cliente_http.delete(f"/api/v2/tareas/plantillas/{plantilla['id']}", headers=H).status_code == 204
    assert cliente_http.post("/api/v2/tareas/plantillas", json={**PLANTILLA, "pasos": []}, headers=H).status_code == 422


def test_aplicar_una_plantilla_cuenta_dias_habiles(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    _sin_avisos(monkeypatch)
    responsable = crear_usuario("ABOGADO_ADMIN")
    colaboradora = crear_usuario("ABOGADO_ADMIN")
    proceso = crear_proceso(responsable, "Ejecutivo", colaboradores=[(colaboradora, True)])
    plantilla = models.PlantillaTarea(nombre="Traslado", palabras_clave=[], pasos=PLANTILLA["pasos"])
    sesion_bd.add(plantilla)
    sesion_bd.commit()
    iniciar(colaboradora)

    # Lunes 14 de diciembre de 2026: 2 días hábiles caen el 16; 9 cruzan la vacancia (20 dic a 10 ene)
    # y el festivo de Reyes (lunes 11 de enero) y caen el lunes 18 de enero de 2027.
    notificacion = date(2026, 12, 14)
    respuesta = cliente_http.post(f"/api/v2/tareas/plantillas/{plantilla.id}/aplicar", headers=H,
                                  json={"proceso_id": proceso.id, "notificacion": notificacion.isoformat(), "folio": 7})
    assert respuesta.status_code == 201, respuesta.text
    creadas = respuesta.json()["items"]
    assert [(t["titulo"], t["prioridad"], (t["fecha_limite"] or "")[:10]) for t in creadas] == [
        ("Estudiar las excepciones", "ALTA", "2026-12-16"),
        ("Radicar el escrito", "URGENTE", "2027-01-18"),
        ("Avisar al cliente", "MEDIA", ""),
    ]
    assert all(t["responsable"]["id"] == colaboradora.id for t in creadas), "quien es del equipo queda como responsable"
    assert sesion_bd.query(models.Tarea).first().descripcion == "Plantilla «Traslado», actuación del folio 7."

    ajeno = crear_proceso(crear_usuario(), "Ajeno")
    fuera = cliente_http.post(f"/api/v2/tareas/plantillas/{plantilla.id}/aplicar", headers=H,
                              json={"proceso_id": ajeno.id, "notificacion": notificacion.isoformat()})
    assert fuera.status_code == 404
