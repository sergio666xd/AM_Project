from datetime import timedelta

from app import models
from app.modulos.operacion.consultas import proxima_consulta
from app.modulos.operacion.esquemas import ResultadoPrueba
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    admin = crear_usuario("ADMIN", nombre="Administración")
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria], radicados=["05001310300420240031200"])
    crear_proceso(abogada, "Archivado", clientes=[gloria], radicados=["05001310300420190000100"], archivado=True)
    radicado, archivado = sesion_bd.query(models.Radicado).order_by(models.Radicado.id).all()
    ahora = utc_ahora()
    antes = models.EjecucionBarrido(id="e-1", clave_idempotencia="1", token_lanzamiento="t", tipo="AUTOMATICA", estado="COMPLETADA",
                                    inicio=ahora - timedelta(days=1), total_radicados=2, procesados=2)
    ultima = models.EjecucionBarrido(id="e-2", clave_idempotencia="2", token_lanzamiento="t", tipo="MANUAL", estado="COMPLETADA_CON_ERRORES",
                                     inicio=ahora - timedelta(hours=1), total_radicados=2, procesados=2, errores=1, actuaciones_nuevas=3)
    sesion_bd.add_all([antes, ultima])
    sesion_bd.flush()
    sesion_bd.add_all([
        models.EjecucionRadicado(ejecucion_id="e-2", radicado_id=archivado.id, estado="COMPLETADA", actuaciones_nuevas=3),
        models.EjecucionRadicado(ejecucion_id="e-2", radicado_id=radicado.id, estado="ERROR", error="Tiempo de espera agotado"),
        models.ConsultaRadicado(radicado_id=radicado.id, estado="ERROR", inicio=ahora, error="Tiempo de espera agotado"),
        models.ConsultaRadicado(radicado_id=archivado.id, estado="ERROR", inicio=ahora),
        models.EntregaNotificacion(clave_idempotencia="a", usuario_id=gloria.id, tipo="ACTUACION", canal="EMAIL", asunto="Nueva actuación",
                                   cuerpo="# Hola\n! Revise\nAbrir enlace: Ver | https://x", estado="ERROR", intentos=3, error="535 rechazado",
                                   created_at=ahora - timedelta(hours=2)),
        models.EntregaNotificacion(clave_idempotencia="b", usuario_id=gloria.id, tipo="TAREA_ACCION", canal="WHATSAPP", asunto="Tarea",
                                   cuerpo="x", estado="ENVIADA", intentos=1, created_at=ahora - timedelta(hours=1)),
        models.EntregaNotificacion(clave_idempotencia="c", usuario_id=gloria.id, tipo="ACTUACIONES", canal="PUSH", asunto="Push",
                                   cuerpo="x", estado="ERROR", intentos=1, created_at=ahora),
        models.EntregaNotificacion(clave_idempotencia="d", usuario_id=gloria.id, tipo="RESUMENES", canal="SIN_CANAL", asunto="Resumen",
                                   cuerpo="x", estado="OMITIDA", created_at=ahora - timedelta(hours=3)),
        models.PlantillaMensaje(clave="ACTUACIONES_DIGEST", nombre="Novedades judiciales", asunto_email="Novedades para {{nombre}}",
                                cuerpo_email="# Hay novedades\nHola, {{primer_nombre}}:\nRadicado: {{radicado}}\nAbrir enlace: Ver | {{enlace}}",
                                cuerpo_whatsapp="Hola, {{primer_nombre}}. Hay novedades.", titulo_push="Novedad en {{radicado}}",
                                cuerpo_push="{{actuacion}}", variables_ejemplo={"nombre": "María Pérez", "radicado": "05001310300420240031200"},
                                enlace_ejemplo="https://portal/procesos/1"),
        models.PlantillaMensaje(clave="PRUEBA_INTEGRACION", nombre="Prueba", asunto_email="Prueba", cuerpo_email="# Prueba\nTodo bien.",
                                cuerpo_whatsapp="Prueba"),
    ])
    sesion_bd.commit()
    return locals()


def test_solo_la_administracion(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])
    for ruta in ("/api/v2/admin/consultas", "/api/v2/admin/envios", "/api/v2/admin/integraciones", "/api/v2/admin/plantillas"):
        assert cliente_http.get(ruta).status_code == 403, ruta


def test_consultas_programacion_errores_y_ejecuciones(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    panel = cliente_http.get("/api/v2/admin/consultas").json()
    assert panel["configuracion"] == {"activa": False, "dias": [0, 1, 2, 3, 4], "horas": ["12:00", "17:00"], "proxima": None}
    # Solo el radicado del proceso activo, agrupado.
    assert [(r["numero"], r["proceso"]) for r in panel["con_error"]] == [("05001 31 03 004 2024 00312 00", "Sucesión Restrepo")]

    assert cliente_http.put("/api/v2/admin/consultas/programacion", json={"activa": True, "dias": []}, headers=H).status_code == 422
    assert cliente_http.put("/api/v2/admin/consultas/programacion", json={"activa": True, "dias": [7]}, headers=H).status_code == 422
    config = cliente_http.put("/api/v2/admin/consultas/programacion", json={"activa": True, "dias": [4, 0, 0]}, headers=H).json()
    assert config["dias"] == [0, 4] and config["proxima"]
    assert sesion_bd.query(models.EventoAuditoria).filter_by(accion="admin.consultas.configuracion.actualizar").count() == 1

    pagina = cliente_http.get("/api/v2/admin/consultas/ejecuciones?limite=1").json()
    assert [(x["id"], x["manual"], x["estado"]) for x in pagina["items"]] == [("e-2", True, "con_errores")]
    siguiente = cliente_http.get(f"/api/v2/admin/consultas/ejecuciones?limite=1&cursor={pagina['siguiente']}").json()
    assert [x["estado"] for x in siguiente["items"]] == ["completada"] and siguiente["siguiente"] is None

    detalle = cliente_http.get("/api/v2/admin/consultas/ejecuciones/e-2").json()
    # Los errores primero.
    assert [(r["estado"], r["actuaciones_nuevas"]) for r in detalle["radicados"]] == [("con_error", 0), ("consultado", 3)]
    assert cliente_http.get("/api/v2/admin/consultas/ejecuciones/nada").status_code == 404

    encontrados = cliente_http.get("/api/v2/admin/consultas/radicados?q=2024").json()
    assert [(r["numero"], r["proceso"]) for r in encontrados] == [("05001 31 03 004 2024 00312 00", "Sucesión Restrepo")]
    assert [r["proceso"] for r in cliente_http.get("/api/v2/admin/consultas/radicados?q=archiv").json()] == ["Archivado"]


def test_proxima_consulta():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    zona = ZoneInfo("America/Bogota")
    jueves_tarde = datetime(2026, 10, 29, 18, 0, tzinfo=zona)
    assert proxima_consulta(True, [0, 4], jueves_tarde) == datetime(2026, 10, 30, 12, 0, tzinfo=zona)
    assert proxima_consulta(True, [3], datetime(2026, 10, 29, 13, 0, tzinfo=zona)) == datetime(2026, 10, 29, 17, 0, tzinfo=zona)
    assert proxima_consulta(False, [0], jueves_tarde) is None


def test_envios_filtros_detalle_y_reintento(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    lanzados = []
    monkeypatch.setattr("app.modulos.operacion.envios.lanzar_envios", lanzados.extend)
    iniciar(e["admin"])

    todos = cliente_http.get("/api/v2/admin/envios").json()
    assert [(x["tipo"], x["canal"], x["estado"]) for x in todos["items"]] == [
        ("Actuación judicial", "PUSH", "fallido"),
        ("Tarea", "WHATSAPP", "enviado"),
        ("Actuación judicial", "EMAIL", "agotado"),
        ("Resumen de pendientes", None, "omitido"),
    ]
    assert todos["conteo"] == {"fallidos": 1, "pendientes": 0}
    assert todos["items"][1]["contacto"] == "3000000000"
    assert todos["items"][2]["contacto"] == e["gloria"].email

    fallidos = cliente_http.get("/api/v2/admin/envios?filtro=fallidos&canal=EMAIL").json()
    assert [x["asunto"] for x in fallidos["items"]] == ["Nueva actuación"]
    assert cliente_http.get("/api/v2/admin/envios?q=resumen").json()["total"] == 1
    pagina = cliente_http.get("/api/v2/admin/envios?limite=3").json()
    assert len(pagina["items"]) == 3 and pagina["siguiente"]
    assert len(cliente_http.get(f"/api/v2/admin/envios?limite=3&cursor={pagina['siguiente']}").json()["items"]) == 1

    correo = fallidos["items"][0]
    detalle = cliente_http.get(f"/api/v2/admin/envios/{correo['id']}").json()
    # Sin las marcas del correo.
    assert detalle["cuerpo"] == "Hola\nRevise\nVer: https://x"

    push = todos["items"][0]
    # El aviso del navegador no se reintenta desde aquí.
    assert cliente_http.post("/api/v2/admin/envios/reintentar", json={"ids": [push["id"]]}, headers=H).status_code == 409
    assert cliente_http.post("/api/v2/admin/envios/reintentar", json={"ids": [correo["id"], push["id"]]}, headers=H).json() == {"reintentados": 1}
    entrega = sesion_bd.get(models.EntregaNotificacion, correo["id"])
    sesion_bd.refresh(entrega)
    assert (entrega.estado, entrega.intentos, entrega.error) == ("PENDIENTE", 0, None)
    assert lanzados == [correo["id"]]


def test_integraciones_configurar_probar_y_enviar(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    for variable in ("SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD", "WHATSAPP_API_URL", "WHATSAPP_TOKEN"):
        monkeypatch.delenv(variable, raising=False)
    iniciar(e["admin"])
    panel = cliente_http.get("/api/v2/admin/integraciones").json()
    assert {x["clave"] for x in panel["estados"]} >= {"rama_judicial", "correo", "whatsapp"}
    assert panel["correo"]["configurado"] is False and panel["correo"]["tiene_clave"] is False

    assert cliente_http.post("/api/v2/admin/integraciones/correo/probar", headers=H).json()["estado"] == "sin_configurar"
    malo = cliente_http.put("/api/v2/admin/integraciones/correo", json={"servidor": "smtp.firma.co", "puerto": 587, "remitente": "avisos"}, headers=H)
    assert malo.status_code == 422 and "remitente" in malo.json()["campos"]
    datos = {"servidor": "smtp.firma.co", "puerto": 587, "remitente": "avisos@firma.co", "usuario": "avisos", "clave": "secreta"}
    panel = cliente_http.put("/api/v2/admin/integraciones/correo", json=datos, headers=H).json()
    assert panel["correo"] == {"servidor": "smtp.firma.co", "puerto": 587, "remitente": "avisos@firma.co", "starttls": True,
                               "usuario": "avisos", "tiene_clave": True, "configurado": True}
    assert "secreta" not in str(panel)
    # Sin clave nueva, se conserva la guardada.
    panel = cliente_http.put("/api/v2/admin/integraciones/correo", json={**datos, "clave": None}, headers=H).json()
    assert panel["correo"]["tiene_clave"] is True

    usados = []
    monkeypatch.setattr("app.modulos.operacion.integraciones.conectar_correo",
                        lambda config: usados.append(config["smtp_password"]) or ResultadoPrueba(estado="falla", mensaje="El servidor rechazó el usuario o la clave."))
    assert cliente_http.post("/api/v2/admin/integraciones/correo/probar", headers=H).json()["estado"] == "falla"
    assert usados == ["secreta"]
    monkeypatch.setattr("app.modulos.operacion.integraciones.conectar_rama", lambda: ResultadoPrueba(estado="ok", mensaje="Respondió."))
    assert cliente_http.post("/api/v2/admin/integraciones/rama_judicial/probar", headers=H).json()["estado"] == "ok"
    assert cliente_http.post("/api/v2/admin/integraciones/whatsapp/probar", headers=H).json()["estado"] == "sin_configurar"

    assert cliente_http.put("/api/v2/admin/integraciones/whatsapp", json={"url": "ftp://x"}, headers=H).status_code == 422
    panel = cliente_http.put("/api/v2/admin/integraciones/whatsapp", json={"url": "https://api.proveedor.co/send", "token": "abc"}, headers=H).json()
    assert panel["whatsapp"] == {"url": "https://api.proveedor.co/send", "tiene_token": True, "configurado": True}
    panel = cliente_http.put("/api/v2/admin/integraciones/whatsapp", json={"url": "https://api.proveedor.co/send", "borrar_token": True}, headers=H).json()
    assert panel["whatsapp"]["tiene_token"] is False

    enviados = []
    monkeypatch.setattr("app.modulos.operacion.integraciones.enviar_correo_prueba", lambda destino, asunto, cuerpo: enviados.append(destino) or True)
    assert cliente_http.post("/api/v2/admin/integraciones/envio-prueba", json={"canal": "EMAIL", "destinatario": "no-es-correo"}, headers=H).status_code == 422
    assert cliente_http.post("/api/v2/admin/integraciones/envio-prueba", json={"canal": "EMAIL", "destinatario": "Yo@Firma.co"}, headers=H).json() == {"destino": "Yo@firma.co"}
    assert enviados == ["Yo@firma.co"]
    monkeypatch.setattr("app.modulos.operacion.integraciones.enviar_correo_prueba", lambda destino, asunto, cuerpo: False)
    fallo = cliente_http.post("/api/v2/admin/integraciones/envio-prueba", json={"canal": "EMAIL", "destinatario": "yo@firma.co"}, headers=H)
    assert fallo.status_code == 502 and fallo.json()["codigo"] == "proveedor_no_disponible"


def test_plantillas_editar_y_vista_previa(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    filas = cliente_http.get("/api/v2/admin/plantillas").json()
    assert [(p["clave"], p["tiene_push"]) for p in filas] == [("ACTUACIONES_DIGEST", True), ("PRUEBA_INTEGRACION", False)]

    plantilla = cliente_http.get("/api/v2/admin/plantillas/ACTUACIONES_DIGEST").json()
    assert plantilla["variables"] == ["nombre", "radicado", "primer_nombre", "actuacion"]
    assert cliente_http.get("/api/v2/admin/plantillas/NO_EXISTE").status_code == 404

    textos = {"asunto": "Novedades para {{nombre}}", "cuerpo_email": "# Hay novedades\nHola, {{primer_nombre}}:\nRadicado: {{radicado}}\nVence: {{fecha}}",
              "cuerpo_whatsapp": "Hola, {{primer_nombre}}.", "titulo_push": "Novedad en {{radicado}}", "cuerpo_push": "Ver"}
    vista = cliente_http.post("/api/v2/admin/plantillas/ACTUACIONES_DIGEST/vista-previa", json=textos, headers=H).json()
    assert vista["asunto"] == "Novedades para María Pérez"
    assert "Hola, María:" in vista["html"] and "05001 31 03 004 2024 00312 00" in vista["html"]
    # La línea de ficha sin valor no aparece, y el botón se agrega con el enlace de ejemplo.
    assert "Vence" not in vista["html"] and "https://portal/procesos/1" in vista["html"]
    assert vista["whatsapp"].startswith("👋 Hola, María.") and "🔗 *Ver en el portal*" in vista["whatsapp"] and vista["titulo_push"] == "Novedad en 05001 31 03 004 2024 00312 00"

    sin_push = cliente_http.put("/api/v2/admin/plantillas/ACTUACIONES_DIGEST", json={**textos, "titulo_push": ""}, headers=H)
    assert sin_push.status_code == 422
    guardada = cliente_http.put("/api/v2/admin/plantillas/ACTUACIONES_DIGEST", json=textos, headers=H).json()
    assert guardada["cuerpo_email"].endswith("Vence: {{fecha}}") and "fecha" in guardada["variables"]
    assert sesion_bd.query(models.EventoAuditoria).filter_by(accion="admin.mensaje.plantilla.actualizar").count() == 1
