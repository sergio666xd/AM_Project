from datetime import datetime, timedelta, timezone

from botocore.exceptions import ClientError

from app import models
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    admin = crear_usuario("ADMIN", nombre="Administración")
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    juan = crear_usuario("ABOGADO", nombre="Juan Pérez")
    suspendido = crear_usuario("ABOGADO", nombre="Pedro Suspendido", estado="SUSPENDIDO")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    sucesion = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria])
    crear_proceso(suspendido, "Ejecutivo Gómez")
    crear_proceso(abogada, "Archivado", archivado=True)
    ahora = utc_ahora()
    sesion_bd.add_all([
        models.Tarea(titulo="Vencida", usuario_id=juan.id, proceso_id=sucesion.id, fecha_limite=ahora - timedelta(days=2)),
        models.Tarea(titulo="Pronto", usuario_id=juan.id, proceso_id=sucesion.id, fecha_limite=ahora + timedelta(days=3)),
        models.Tarea(titulo="Lejos", usuario_id=abogada.id, proceso_id=sucesion.id, fecha_limite=ahora + timedelta(days=30)),
        models.Tarea(titulo="Hecha", usuario_id=abogada.id, proceso_id=sucesion.id, estado=models.EstadoTarea.COMPLETADA,
                     fecha_limite=ahora - timedelta(days=5)),
        models.EventoAuditoria(actor_id=abogada.id, accion="cuenta_cobro.emitir", tipo_recurso="cuenta_cobro", recurso_id="7",
                               created_at=ahora - timedelta(hours=3), metadata_json='{"total": 1500000}'),
        models.EventoAuditoria(actor_id=juan.id, accion="documento.descargar", tipo_recurso="documento_proceso", recurso_id="2",
                               created_at=ahora - timedelta(hours=2)),
        models.EventoAuditoria(actor_id=None, accion="proceso.etapa", tipo_recurso="proceso", recurso_id=str(sucesion.id),
                               created_at=ahora - timedelta(hours=1), endpoint="/api/v2/procesos/1/etapa", metodo="PUT",
                               error_tecnico="Timeout"),
        models.EventoAuditoria(actor_id=admin.id, accion="admin.usuario.crear", tipo_recurso="usuario", recurso_id=str(juan.id),
                               created_at=datetime(2026, 1, 10, 4, 0)),  # 9 de enero, 11 p. m. en Colombia
        models.DocumentoProceso(proceso_id=sucesion.id, nombre_archivo="Cedula.pdf", ruta_archivo="procesos/1/cedula.pdf",
                                mime_type="application/pdf"),
    ])
    sesion_bd.commit()
    return locals()


def test_solo_la_administracion(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])
    for ruta in ("/api/v2/admin/actividad", "/api/v2/admin/firma", "/api/v2/admin/almacenamiento", "/api/v2/admin/chats"):
        assert cliente_http.get(ruta).status_code == 403, ruta
    assert cliente_http.get("/api/v2/admin/carga").status_code == 200
    iniciar(e["juan"])
    assert cliente_http.get("/api/v2/admin/carga").status_code == 403


def test_actividad_filtros_detalle_y_csv(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    pagina = cliente_http.get("/api/v2/admin/actividad?limite=2").json()
    # Las descargas son de rutina: no salen salvo con todo=true.
    assert pagina["total"] == 3 and len(pagina["items"]) == 2 and pagina["siguiente"]
    primero = pagina["items"][0]
    assert primero["actor"] is None and primero["frase"] == "cambió la etapa de un proceso" and primero["con_error"]
    assert primero["area"] == "procesos" and primero["enlace"].endswith(f"/procesos/{e['sucesion'].id}")
    resto = cliente_http.get(f"/api/v2/admin/actividad?limite=2&cursor={pagina['siguiente']}").json()
    assert [r["accion"] for r in resto["items"]] == ["admin.usuario.crear"] and resto["siguiente"] is None
    assert cliente_http.get("/api/v2/admin/actividad?todo=true").json()["total"] == 4

    def acciones(consulta):
        return [r["accion"] for r in cliente_http.get(f"/api/v2/admin/actividad?{consulta}").json()["items"]]

    assert acciones("q=alejandra") == ["cuenta_cobro.emitir"]
    assert acciones(f"actor_id={e['admin'].id}") == ["admin.usuario.crear"]
    assert acciones("area=cobros") == ["cuenta_cobro.emitir"]
    assert acciones("solo_errores=true") == ["proceso.etapa"]
    assert acciones("desde=2026-01-09&hasta=2026-01-09") == ["admin.usuario.crear"]
    assert acciones("desde=2026-01-10&hasta=2026-01-10") == []
    malo = cliente_http.get("/api/v2/admin/actividad?desde=2026-01-10&hasta=2026-01-09")
    assert malo.status_code == 422 and "hasta" in malo.json()["campos"]

    detalle = cliente_http.get(f"/api/v2/admin/actividad/{primero['id']}").json()
    assert detalle["endpoint"] == "/api/v2/procesos/1/etapa" and detalle["metodo"] == "PUT" and detalle["error"] == "Timeout"
    cobro = next(r for r in cliente_http.get("/api/v2/admin/actividad").json()["items"] if r["accion"] == "cuenta_cobro.emitir")
    assert cliente_http.get(f"/api/v2/admin/actividad/{cobro['id']}").json()["datos"] == {"total": 1500000}
    assert cliente_http.get("/api/v2/admin/actividad/999999").status_code == 404

    csv = cliente_http.get("/api/v2/admin/actividad/csv?area=cobros")
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    lineas = csv.content.decode("utf-8-sig").strip().splitlines()
    assert lineas[0].startswith("Fecha,Persona") and "Alejandra Muñoz,emitió una cuenta de cobro,cobros" in lineas[1]
    assert len(lineas) == 2


def test_carga_de_trabajo(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    carga = cliente_http.get("/api/v2/admin/carga").json()
    filas = {c["persona"]["nombre"]: c for c in carga["personas"]}
    assert list(filas) == ["Juan Pérez", "Alejandra Muñoz", "Pedro Suspendido"]
    assert filas["Juan Pérez"] | {"persona": None} == {
        "persona": None, "activa": True, "procesos": 0, "tareas_abiertas": 2, "vencidas": 1, "proximas": 1,
    }
    assert filas["Alejandra Muñoz"]["procesos"] == 1 and filas["Alejandra Muñoz"]["tareas_abiertas"] == 1
    assert filas["Pedro Suspendido"]["activa"] is False and filas["Pedro Suspendido"]["procesos"] == 1
    assert (carga["procesos"], carga["tareas_abiertas"], carga["vencidas"], carga["proximas"]) == (2, 3, 1, 1)


def test_datos_de_la_firma(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["admin"])
    datos = cliente_http.get("/api/v2/admin/firma").json()
    assert datos["nombre"] and "zona_horaria" not in datos
    cambio = {**{k: v for k, v in datos.items() if k not in ("actualizado_en", "actualizado_por")},
              "nombre": "  Alejandra   Muñoz Abogada ", "correo_pqr": "", "sitio_web": "https://am.example"}
    guardado = cliente_http.put("/api/v2/admin/firma", json=cambio, headers=H).json()
    assert guardado["nombre"] == "Alejandra Muñoz Abogada" and guardado["correo_pqr"] is None
    assert guardado["actualizado_por"] == "Administración"
    malo = cliente_http.put("/api/v2/admin/firma", json={**cambio, "logo_url": "ftp://x"}, headers=H)
    assert malo.status_code == 422 and "logo_url" in malo.json()["campos"]
    evento = sesion_bd.query(models.EventoAuditoria).filter_by(accion="admin.configuracion_firma.actualizar").one()
    assert "nombre" in evento.metadata_json and "correo_pqr" in evento.metadata_json


class R2:
    def __init__(self):
        self.objetos = {
            "procesos/1/cedula.pdf": 1200, "procesos/1/viejo.pdf": 800, "procesos/2/a.pdf": 10, "huerfanos/x.txt": 5,
            "huerfanos/sub/y.txt": 6, "raiz.txt": 3,
        }
        self.borrados: list[str] = []

    def list_objects_v2(self, Bucket, Prefix="", Delimiter=None, MaxKeys=1000, ContinuationToken=None):
        claves = sorted(k for k in self.objetos if k.startswith(Prefix))
        if not Delimiter:
            return {"Contents": [{"Key": k, "Size": self.objetos[k]} for k in claves], "IsTruncated": False}
        carpetas = sorted({Prefix + k[len(Prefix):].split("/")[0] + "/" for k in claves if "/" in k[len(Prefix):]})
        archivos = [k for k in claves if "/" not in k[len(Prefix):]]
        fecha = datetime(2026, 10, 1, 15, 0, tzinfo=timezone.utc)
        return {"CommonPrefixes": [{"Prefix": c} for c in carpetas],
                "Contents": [{"Key": k, "Size": self.objetos[k], "LastModified": fecha} for k in archivos], "IsTruncated": False}

    def head_object(self, Bucket, Key):
        if Key not in self.objetos:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {}

    def generate_presigned_url(self, operacion, Params, ExpiresIn):
        return f"https://r2/{Params['Key']}?e={ExpiresIn}"

    def delete_object(self, Bucket, Key):
        self.objetos.pop(Key)
        self.borrados.append(Key)

    def delete_objects(self, Bucket, Delete, **_):
        for objeto in Delete["Objects"]:
            self.delete_object(Bucket, objeto["Key"])
        return {}


def test_almacenamiento(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    r2 = R2()
    monkeypatch.setattr("app.storage.get_r2_client", lambda: r2)
    monkeypatch.setattr("app.storage.get_r2_system_bucket", lambda: "cubeta")
    iniciar(e["admin"])
    raiz = cliente_http.get("/api/v2/admin/almacenamiento").json()
    assert [c["ruta"] for c in raiz["carpetas"]] == ["huerfanos", "procesos"] and [a["nombre"] for a in raiz["archivos"]] == ["raiz.txt"]
    carpeta = cliente_http.get("/api/v2/admin/almacenamiento?ruta=procesos/1/").json()
    archivos = {a["nombre"]: a for a in carpeta["archivos"]}
    assert carpeta["ruta"] == "procesos/1"
    assert archivos["cedula.pdf"]["vinculo"] == {
        "tipo": "documento", "descripcion": "Cedula.pdf, del proceso Sucesión Restrepo",
        "enlace": f"/gestion-procesos/admin/procesos/{e['sucesion'].id}",
    }
    assert archivos["viejo.pdf"]["vinculo"] is None and archivos["viejo.pdf"]["tamano"] == 800
    assert cliente_http.get("/api/v2/admin/almacenamiento?ruta=../x").status_code == 422

    assert cliente_http.get("/api/v2/admin/almacenamiento/enlace?clave=procesos/1/viejo.pdf").json()["url"].startswith("https://r2/")
    assert cliente_http.get("/api/v2/admin/almacenamiento/enlace?clave=no/esta.pdf").status_code == 404

    vinculado = cliente_http.post("/api/v2/admin/almacenamiento/eliminar-archivo", json={"clave": "procesos/1/cedula.pdf"}, headers=H)
    assert vinculado.status_code == 409 and vinculado.json()["codigo"] == "archivo_vinculado"
    assert cliente_http.post("/api/v2/admin/almacenamiento/eliminar-archivo", json={"clave": "procesos/1/viejo.pdf"},
                             headers=H).json() == {"archivos": 1}

    con_documentos = cliente_http.post("/api/v2/admin/almacenamiento/eliminar-carpeta",
                                       json={"ruta": "procesos", "confirmacion": "procesos"}, headers=H)
    assert con_documentos.status_code == 409 and con_documentos.json()["codigo"] == "carpeta_con_vinculos"
    sin_confirmar = cliente_http.post("/api/v2/admin/almacenamiento/eliminar-carpeta",
                                      json={"ruta": "huerfanos", "confirmacion": "otra"}, headers=H)
    assert sin_confirmar.status_code == 422 and "confirmacion" in sin_confirmar.json()["campos"]
    assert cliente_http.post("/api/v2/admin/almacenamiento/eliminar-carpeta",
                             json={"ruta": "huerfanos", "confirmacion": "huerfanos"}, headers=H).json() == {"archivos": 2}
    assert sorted(r2.borrados) == ["huerfanos/sub/y.txt", "huerfanos/x.txt", "procesos/1/viejo.pdf"]
    assert sesion_bd.query(models.EventoAuditoria).filter(models.EventoAuditoria.accion.like("admin.r2.%")).count() == 2


def test_almacenamiento_sin_configurar(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    for variable in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(variable, raising=False)
    from app import storage

    storage.get_r2_client.cache_clear()
    iniciar(e["admin"])
    respuesta = cliente_http.get("/api/v2/admin/almacenamiento")
    storage.get_r2_client.cache_clear()
    assert respuesta.status_code == 503 and respuesta.json()["codigo"] == "almacenamiento_sin_configurar"


def test_limpieza_de_chats(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    ahora = utc_ahora()
    con_cliente = models.ChatConversacion(clave="process:1:x", tipo="PROCESO_DIRECTO", proceso_id=e["sucesion"].id)
    equipo = models.ChatConversacion(clave="direct:1:2", tipo="STAFF_DIRECT")
    vacia = models.ChatConversacion(clave="process:1:collaborators", tipo="PROCESO_COLABORADORES", proceso_id=e["sucesion"].id,
                                    updated_at=ahora - timedelta(days=9))
    sesion_bd.add_all([con_cliente, equipo, vacia])
    sesion_bd.flush()
    sesion_bd.add_all([
        models.ChatParticipante(conversacion_id=con_cliente.id, usuario_id=e["abogada"].id, ultimo_leido_mensaje_id=2),
        models.ChatParticipante(conversacion_id=con_cliente.id, usuario_id=e["gloria"].id),
        models.ChatParticipante(conversacion_id=equipo.id, usuario_id=e["abogada"].id),
        models.ChatParticipante(conversacion_id=equipo.id, usuario_id=e["juan"].id),
        models.ChatMensaje(conversacion_id=con_cliente.id, remitente_id=e["gloria"].id, contenido="secreto", created_at=ahora - timedelta(hours=2)),
        models.ChatMensaje(conversacion_id=con_cliente.id, remitente_id=e["abogada"].id, contenido="otro", created_at=ahora - timedelta(hours=1)),
        models.ChatMensaje(conversacion_id=equipo.id, remitente_id=e["juan"].id, contenido="hola", created_at=ahora - timedelta(days=1)),
    ])
    sesion_bd.commit()
    iniciar(e["admin"])
    pagina = cliente_http.get("/api/v2/admin/chats?limite=2").json()
    assert pagina["total"] == 3 and pagina["siguiente"]
    primero, segundo = pagina["items"]
    assert primero == {
        "id": con_cliente.id, "tipo": "cliente", "proceso": "Sucesión Restrepo", "participantes": ["Alejandra Muñoz", "Gloria Restrepo"],
        "mensajes": 2, "ultimo_mensaje": primero["ultimo_mensaje"],
    }
    assert "secreto" not in str(pagina)
    assert segundo["tipo"] == "equipo" and segundo["mensajes"] == 1
    resto = cliente_http.get(f"/api/v2/admin/chats?limite=2&cursor={pagina['siguiente']}").json()
    assert [(c["tipo"], c["mensajes"], c["ultimo_mensaje"]) for c in resto["items"]] == [("colaboradores", 0, None)]

    sin_palabra = cliente_http.post(f"/api/v2/admin/chats/{con_cliente.id}/vaciar", json={"confirmacion": "si"}, headers=H)
    assert sin_palabra.status_code == 422
    assert cliente_http.post(f"/api/v2/admin/chats/{con_cliente.id}/vaciar", json={"confirmacion": "VACIAR"},
                             headers=H).json() == {"mensajes_eliminados": 2}
    sesion_bd.expire_all()
    assert sesion_bd.query(models.ChatMensaje).filter_by(conversacion_id=con_cliente.id).count() == 0
    assert all(p.ultimo_leido_mensaje_id == 0 for p in sesion_bd.query(models.ChatParticipante).filter_by(conversacion_id=con_cliente.id))
    assert cliente_http.post("/api/v2/admin/chats/99999/vaciar", json={"confirmacion": "VACIAR"}, headers=H).status_code == 404
