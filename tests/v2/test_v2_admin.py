import importlib.util
from datetime import timedelta
from pathlib import Path

from app import models
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}
MIGRACION = Path(__file__).resolve().parents[2] / "alembic_migrations" / "versions" / "2026_10_29_0013_acceso_abogado.py"


def _sin_correos(monkeypatch):
    enviados = []
    monkeypatch.setattr("app.modulos.administracion.usuarios.notificar", lambda db, destinatario, **k: enviados.append((destinatario.id, k)))
    monkeypatch.setattr("app.modulos.administracion.usuarios.enviar_enlace_contrasena", lambda email, enlace: enviados.append((email, enlace)))
    return enviados


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    admin = crear_usuario("ADMIN", nombre="Administración")
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    gloria.creado_por_abogado_id = abogada.id
    nuevo = crear_usuario("CLIENTE", nombre="Hernán Cardona", debe_cambiar_password=True)
    nuevo.created_at = utc_ahora() - timedelta(days=10)
    reciente = crear_usuario("CLIENTE", nombre="Ana Reciente", debe_cambiar_password=True)
    suspendido = crear_usuario("CLIENTE", nombre="Zoe Suspendida", estado="SUSPENDIDO")
    sucesion = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria], radicados=["05001310300420240031200"])
    crear_proceso(abogada, "Archivado", clientes=[gloria], radicados=["05001310300420190000100"], archivado=True)
    radicado, archivado = sesion_bd.query(models.Radicado).order_by(models.Radicado.id).all()
    ahora = utc_ahora()
    sesion_bd.add_all([
        # Falló y luego anduvo: ya no es alerta.
        models.ConsultaRadicado(radicado_id=radicado.id, estado="ERROR", inicio=ahora - timedelta(hours=5)),
        models.ConsultaRadicado(radicado_id=radicado.id, estado="COMPLETADA", inicio=ahora - timedelta(hours=4)),
        models.ConsultaRadicado(radicado_id=radicado.id, estado="ERROR", inicio=ahora - timedelta(hours=1), error="Tiempo de espera agotado"),
        # De un proceso archivado: no se alerta.
        models.ConsultaRadicado(radicado_id=archivado.id, estado="ERROR", inicio=ahora),
        models.EntregaNotificacion(clave_idempotencia="a", usuario_id=gloria.id, tipo="ACTUACION", canal="EMAIL", asunto="x", cuerpo="x",
                                   estado="ERROR", intentos=3, error="535 Authentication failed", created_at=ahora - timedelta(days=1)),
        models.EntregaNotificacion(clave_idempotencia="b", usuario_id=gloria.id, tipo="ACTUACION", canal="EMAIL", asunto="x", cuerpo="x",
                                   estado="ERROR", intentos=3, error="535 Authentication failed", created_at=ahora),
        # Aún se reintenta: no es alerta.
        models.EntregaNotificacion(clave_idempotencia="c", usuario_id=gloria.id, tipo="ACTUACION", canal="WHATSAPP", asunto="x", cuerpo="x",
                                   estado="ERROR", intentos=1, created_at=ahora),
        models.SolicitudEdicionPerfilCliente(cliente_id=gloria.id, email_solicitado=gloria.email, nombre_completo_solicitado="Gloria R."),
        models.Tarea(titulo="Vencida", usuario_id=abogada.id, proceso_id=sucesion.id, fecha_limite=ahora - timedelta(days=2)),
        models.Tarea(titulo="A tiempo", usuario_id=abogada.id, proceso_id=sucesion.id, fecha_limite=ahora + timedelta(days=2)),
        models.EventoAuditoria(actor_id=abogada.id, accion="cuenta_cobro.emitir", tipo_recurso="cuenta_cobro", recurso_id="4"),
        models.EventoAuditoria(actor_id=abogada.id, accion="documento.descargar", tipo_recurso="documento_proceso", recurso_id="1"),
    ])
    sesion_bd.commit()
    return locals()


def test_solo_la_administracion(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])
    assert cliente_http.get("/api/v2/admin/resumen").status_code == 403
    assert cliente_http.get("/api/v2/admin/usuarios").status_code == 403
    assert cliente_http.post(f"/api/v2/admin/usuarios/{e['gloria'].id}/estado", json={"estado": "suspendido"}, headers=H).status_code == 403


def test_resumen_con_alertas_integraciones_cifras_y_actividad(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    resumen = cliente_http.get("/api/v2/admin/resumen").json()

    tipos = [a["tipo"] for a in resumen["alertas"]]
    # Las graves primero y, entre ellas, la más reciente.
    assert tipos == ["entrega_fallida", "consulta_fallida", "solicitud_perfil", "sin_ingreso"]
    entregas, consulta, perfil, sin_ingreso = resumen["alertas"]
    assert consulta["titulo"] == "No se pudo consultar el radicado 05001 31 03 004 2024 00312 00"
    assert consulta["detalle"] == "Sucesión Restrepo. Tiempo de espera agotado" and consulta["gravedad"] == "alta"
    assert entregas["titulo"] == "2 avisos por correo no llegaron tras tres intentos"
    assert entregas["detalle"] == "535 Authentication failed"
    assert perfil["titulo"] == "Gloria Restrepo pidió corregir sus datos"
    # Solo quien lleva más de una semana sin entrar.
    assert sin_ingreso["titulo"] == "1 cuenta no ha entrado en más de una semana"
    assert sin_ingreso["detalle"].startswith("Hernán Cardona.")
    assert resumen["alertas_descartadas"] == 0

    assert [i["clave"] for i in resumen["integraciones"]] == ["rama_judicial", "correo", "whatsapp", "push", "almacenamiento"]
    cifras = {c["clave"]: c for c in resumen["firma"]}
    assert cifras["procesos_activos"]["texto"] == "1 proceso activo"
    assert cifras["tareas_vencidas"]["texto"] == "1 tarea vencida" and cifras["tareas_vencidas"]["atencion"]
    assert cifras["cuentas_vencidas"]["texto"] == "Ninguna cuenta de cobro vencida"

    # Las descargas no cuentan como actividad.
    assert [(a["actor"], a["frase"]) for a in resumen["actividad"]] == [("Alejandra Muñoz", "emitió una cuenta de cobro")]
    assert resumen["actividad"][0]["enlace"] == "/gestion-procesos/admin/cobros"


def test_descartar_y_restaurar_una_alerta(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    alerta = cliente_http.get("/api/v2/admin/resumen").json()["alertas"][2]

    vigentes = cliente_http.post(f"/api/v2/admin/alertas/{alerta['id']}/descartar", headers=H).json()
    assert alerta["id"] not in [a["id"] for a in vigentes["items"]] and vigentes["descartadas"] == 1
    resumen = cliente_http.get("/api/v2/admin/resumen").json()
    assert resumen["alertas_descartadas"] == 1 and len(resumen["alertas"]) == 3
    assert [a["id"] for a in cliente_http.get("/api/v2/admin/alertas?descartadas=true").json()["items"]] == [alerta["id"]]

    descartadas = cliente_http.post(f"/api/v2/admin/alertas/{alerta['id']}/restaurar", headers=H).json()
    assert descartadas["items"] == [] and descartadas["descartadas"] == 0
    assert cliente_http.post("/api/v2/admin/alertas/perfil:999/descartar", headers=H).json()["codigo"] == "alerta_no_vigente"


def test_lista_de_usuarios_por_grupo_busqueda_y_paginas(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])

    clientes = cliente_http.get("/api/v2/admin/usuarios?grupo=clientes").json()
    assert clientes["conteo"] == {"equipo": 1, "clientes": 4, "administradores": 1, "sin_ingreso": 2, "suspendidos": 1}
    assert [u["nombre"] for u in clientes["items"]] == ["Ana Reciente", "Gloria Restrepo", "Hernán Cardona", "Zoe Suspendida"]
    gloria = clientes["items"][1]
    assert gloria["procesos"] == 1 and gloria["responsable"] == {"id": e["abogada"].id, "nombre": "Alejandra Muñoz"}
    assert gloria["acceso"] == "activo" and clientes["items"][3]["acceso"] == "suspendido"

    equipo = cliente_http.get("/api/v2/admin/usuarios").json()["items"]
    assert [(u["nombre"], u["procesos"]) for u in equipo] == [("Alejandra Muñoz", 1)]
    assert [u["nombre"] for u in cliente_http.get("/api/v2/admin/usuarios?grupo=clientes&acceso=sin_ingreso").json()["items"]] == ["Ana Reciente", "Hernán Cardona"]
    assert [u["nombre"] for u in cliente_http.get("/api/v2/admin/usuarios?grupo=clientes&q=restre").json()["items"]] == ["Gloria Restrepo"]
    assert cliente_http.get("/api/v2/admin/usuarios?grupo=clientes&estado=suspendido").json()["total"] == 1

    primera = cliente_http.get("/api/v2/admin/usuarios?grupo=clientes&limite=3").json()
    segunda = cliente_http.get(f"/api/v2/admin/usuarios?grupo=clientes&limite=3&cursor={primera['siguiente']}").json()
    assert [u["nombre"] for u in segunda["items"]] == ["Zoe Suspendida"] and segunda["siguiente"] is None


def test_crear_cuentas_con_acceso_por_correo(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    enviados = _sin_correos(monkeypatch)
    iniciar(e["admin"])

    sin_responsable = cliente_http.post("/api/v2/admin/usuarios", json={"nombre": "Carlos Mejía", "email": "carlos@correo.co", "rol": "CLIENTE"}, headers=H)
    assert sin_responsable.status_code == 422 and "responsable_id" in sin_responsable.json()["campos"]

    creado = cliente_http.post("/api/v2/admin/usuarios", json={
        "nombre": "  Carlos   Mejía ", "email": "Carlos@Correo.co", "rol": "CLIENTE", "responsable_id": e["abogada"].id,
    }, headers=H)
    assert creado.status_code == 201, creado.text
    ficha = creado.json()
    assert (ficha["nombre"], ficha["email"], ficha["acceso"], ficha["debe_cambiar_password"]) == ("Carlos Mejía", "carlos@correo.co", "sin_ingreso", True)
    assert ficha["responsable"]["nombre"] == "Alejandra Muñoz" and ficha["puede_eliminarse"]
    destinatario, aviso = enviados[-1]
    assert destinatario == ficha["id"] and aviso["plantilla_clave"] == "CLIENTE_CREDENCIALES"
    assert len(aviso["variables"]["password"]) == 12 and aviso["incluir_email"]

    abogado = cliente_http.post("/api/v2/admin/usuarios", json={"nombre": "Laura Gómez", "email": "laura@firma.co", "rol": "ABOGADO_ADMIN"}, headers=H).json()
    assert abogado["rol"] == "ABOGADO_ADMIN" and abogado["responsable"] is None
    assert enviados[-1][1]["plantilla_clave"] == "ABOGADO_CREDENCIALES"

    repetido = cliente_http.post("/api/v2/admin/usuarios", json={"nombre": "Otra", "email": "laura@firma.co", "rol": "ABOGADO_ADMIN"}, headers=H)
    assert repetido.status_code == 409 and repetido.json()["codigo"] == "correo_en_uso"


def test_ficha_rol_y_eliminar_solo_sin_informacion(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    _sin_correos(monkeypatch)
    iniciar(e["admin"])

    gloria = cliente_http.get(f"/api/v2/admin/usuarios/{e['gloria'].id}").json()
    assert gloria["totales"]["procesos"] == 1
    assert [(p["nombre"], p["papel"], p["archivado"]) for p in gloria["procesos_detalle"]] == [
        ("Sucesión Restrepo", "cliente", False), ("Archivado", "cliente", True),
    ]
    assert not gloria["puede_eliminarse"] and not gloria["puede_cambiar_rol"]
    assert cliente_http.delete(f"/api/v2/admin/usuarios/{e['gloria'].id}", headers=H).json()["codigo"] == "cuenta_con_informacion"
    cambio = cliente_http.patch(f"/api/v2/admin/usuarios/{e['gloria'].id}", json={"rol": "ABOGADO_ADMIN"}, headers=H)
    assert cambio.status_code == 409 and cambio.json()["codigo"] == "rol_con_informacion"

    editada = cliente_http.patch(f"/api/v2/admin/usuarios/{e['gloria'].id}", json={"nombre": "Gloria Restrepo Arango", "whatsapp": "315 222 3344"}, headers=H).json()
    assert (editada["nombre"], editada["whatsapp"]) == ("Gloria Restrepo Arango", "315 222 3344")

    # Una cuenta recién creada por error sí cambia de rol y se puede eliminar.
    ana = e["reciente"].id
    a_equipo = cliente_http.patch(f"/api/v2/admin/usuarios/{ana}", json={"rol": "ABOGADO_ADMIN"}, headers=H).json()
    assert a_equipo["rol"] == "ABOGADO_ADMIN" and a_equipo["responsable"] is None
    sin_responsable = cliente_http.patch(f"/api/v2/admin/usuarios/{ana}", json={"rol": "CLIENTE"}, headers=H)
    assert sin_responsable.status_code == 422
    assert cliente_http.delete(f"/api/v2/admin/usuarios/{ana}", headers=H).status_code == 204
    assert cliente_http.get(f"/api/v2/admin/usuarios/{ana}").status_code == 404

    cuenta_admin = cliente_http.post(f"/api/v2/admin/usuarios/{e['admin'].id}/estado", json={"estado": "suspendido"}, headers=H)
    assert cuenta_admin.status_code == 409 and cuenta_admin.json()["codigo"] == "cuenta_admin"


def test_suspender_reactivar_y_acceso(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    enviados = _sin_correos(monkeypatch)
    monkeypatch.setattr("app.modulos.administracion.usuarios.ServicioUsuariosAdmin._ponerse_al_dia", lambda self, admin, cuenta: enviados.append(("al_dia", cuenta.id)))
    iniciar(e["admin"])
    gloria = e["gloria"].id

    suspendida = cliente_http.post(f"/api/v2/admin/usuarios/{gloria}/estado", json={"estado": "suspendido"}, headers=H).json()
    assert (suspendida["estado"], suspendida["acceso"]) == ("suspendido", "suspendido")
    sesion_bd.expire_all()
    assert sesion_bd.get(models.Usuario, gloria).sesiones_cerradas_en is not None
    assert cliente_http.post(f"/api/v2/admin/usuarios/{gloria}/enlace-contrasena", headers=H).json()["codigo"] == "cuenta_suspendida"

    assert cliente_http.post(f"/api/v2/admin/usuarios/{gloria}/estado", json={"estado": "activo"}, headers=H).json()["estado"] == "activo"
    assert ("al_dia", gloria) in enviados

    enlace = cliente_http.post(f"/api/v2/admin/usuarios/{gloria}/enlace-contrasena", headers=H).json()
    assert enlace == {"destino": e["gloria"].email} and enviados[-1][0] == e["gloria"].email
    assert "restablecer-password?token=" in enviados[-1][1]
    assert cliente_http.post(f"/api/v2/admin/usuarios/{gloria}/acceso", headers=H).json()["codigo"] == "ya_ingreso"

    hernan = e["nuevo"]
    clave_anterior = hernan.password_hash
    assert cliente_http.post(f"/api/v2/admin/usuarios/{hernan.id}/acceso", headers=H).json() == {"destino": hernan.email}
    sesion_bd.expire_all()
    assert sesion_bd.get(models.Usuario, hernan.id).password_hash != clave_anterior
    assert cliente_http.post(f"/api/v2/admin/usuarios/{hernan.id}/enlace-contrasena", headers=H).json()["codigo"] == "sin_ingreso"

    varios = cliente_http.post("/api/v2/admin/usuarios/estado", json={"ids": [gloria, hernan.id, e["admin"].id], "estado": "suspendido"}, headers=H).json()
    assert varios == {"actualizados": 2}

    cerradas = cliente_http.post(f"/api/v2/admin/usuarios/{e['abogada'].id}/cerrar-sesiones", headers=H)
    assert cerradas.status_code == 200
    sesion_bd.expire_all()
    assert sesion_bd.get(models.Usuario, e["abogada"].id).sesiones_cerradas_en is not None
    # La ficha muestra lo que hizo esa persona, descargas incluidas.
    assert [a["frase"] for a in cerradas.json()["actividad"]] == ["descargó un documento", "emitió una cuenta de cobro"]


def test_actividad_en_frases():
    from app.modulos.administracion.actividad import enlace, frase

    assert frase("cuenta_cobro.emitir") == "emitió una cuenta de cobro"
    assert frase("proceso.archivar") == "archivó un proceso"
    assert frase("admin.usuario.estado.SUSPENDIDO") == "suspendió una cuenta"
    assert frase("algo.raro") == "hizo un cambio (algo.raro)"
    assert enlace("usuario", "7") == "/gestion-procesos/admin/usuarios/7"
    assert enlace("proceso", "3") == "/gestion-procesos/admin/procesos/3"
    assert enlace("chat_conversacion", "1") is None


def test_correo_de_acceso_de_abogados_lleva_la_contrasena_solo_por_correo():
    especificacion = importlib.util.spec_from_file_location("migracion_acceso_abogado", MIGRACION)
    migracion = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(migracion)
    assert "Contraseña temporal: {{password}}" in migracion.NUEVO["cuerpo_email"]
    assert "{{password}}" not in migracion.NUEVO["cuerpo_whatsapp"]
    assert set(migracion.NUEVO) == set(migracion.ANTERIOR)
