from datetime import timedelta

from app import models
from app.modulos.documentos.repositorio import RepositorioDocumentos
from app.modulos.documentos.servicio import ServicioDocumentos
from app.nucleo.zona_horaria import a_colombia, fin_del_dia_utc
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _sin_avisos(monkeypatch):
    enviados = []
    monkeypatch.setattr("app.modulos.documentos.servicio.notificar", lambda db, destinatario, **k: enviados.append((destinatario.id, k)))
    return enviados


def _hoy():
    return a_colombia(utc_ahora()).date()


def _solicitud(sesion_bd, proceso, cliente, titulo, pedidos, vence_en_dias=None, **extra):
    solicitud = models.SolicitudDocumento(
        proceso_id=proceso.id, cliente_id=cliente.id, titulo=titulo,
        documentos_requeridos=[{"id": f"p{i}", "nombre": nombre} for i, nombre in enumerate(pedidos, start=1)],
        fecha_limite=fin_del_dia_utc(_hoy() + timedelta(days=vence_en_dias)) if vence_en_dias is not None else None, **extra,
    )
    sesion_bd.add(solicitud)
    sesion_bd.commit()
    return solicitud


def _entrega(sesion_bd, solicitud, pedido, nombre, estado="RECIBIDO", hace_dias=0, mime="application/pdf", **extra):
    documento = models.DocumentoProceso(
        proceso_id=solicitud.proceso_id, cliente_id=solicitud.cliente_id, solicitud_id=solicitud.id, solicitud_item_id=pedido,
        nombre_archivo=nombre, ruta_archivo=f"r2/{nombre}", mime_type=mime, estado_revision=estado,
        created_at=utc_ahora() - timedelta(days=hace_dias), **extra,
    )
    sesion_bd.add(documento)
    sesion_bd.commit()
    return documento


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    otro = crear_usuario(nombre="Otro abogado")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente])
    archivado = crear_proceso(abogada, "Archivado", clientes=[cliente], archivado=True)
    ajeno = crear_proceso(otro, "Ajeno", clientes=[cliente])

    pendiente = _solicitud(sesion_bd, proceso, cliente, "Para la demanda", ["Cédula", "Registro civil"], vence_en_dias=-1)
    primera = _entrega(sesion_bd, pendiente, "p1", "cedula-borrosa.pdf", "REQUIERE_CORRECCION", hace_dias=3,
                       comentario_revision="No se lee", revisado_por_id=abogada.id, revisado_en=utc_ahora() - timedelta(days=2))
    segunda = _entrega(sesion_bd, pendiente, "p1", "cedula.jpg", hace_dias=1, mime="image/jpeg")
    completa = _solicitud(sesion_bd, proceso, cliente, "Poder", ["Poder firmado"], vence_en_dias=5)
    aprobado = _entrega(sesion_bd, completa, "p1", "poder.pdf", "APROBADO", hace_dias=2)
    de_la_firma = models.DocumentoProceso(proceso_id=proceso.id, nombre_archivo="memorial.docx", ruta_archivo="r2/memorial",
                                          mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                          created_at=utc_ahora() - timedelta(days=4))
    sesion_bd.add(de_la_firma)
    _entrega(sesion_bd, _solicitud(sesion_bd, archivado, cliente, "Del archivado", ["Algo"]), "p1", "archivado.pdf")
    del_ajeno = _entrega(sesion_bd, _solicitud(sesion_bd, ajeno, cliente, "Ajena", ["Algo"]), "p1", "ajeno.pdf")
    sesion_bd.commit()
    return locals()


def test_lista_entregas_con_versiones_y_solicitudes(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])

    lista = cliente_http.get("/api/v2/documentos").json()
    assert lista["resumen"] == {"por_revisar": 1, "por_corregir": 0, "solicitudes_abiertas": 1, "solicitudes_vencidas": 1}
    assert lista["total"] == 1
    cedula = lista["items"][0]
    assert cedula["id"] == e["segunda"].id
    assert cedula["nombre"] == "Cédula"
    assert cedula["vista_previa"] is True
    assert cedula["entregado_por_cliente"] is True
    assert cedula["solicitud"] == {"id": e["pendiente"].id, "titulo": "Para la demanda"}
    assert cedula["cliente"] == {"id": e["cliente"].id, "nombre": "Gloria Restrepo"}
    assert [(v["numero"], v["nombre_archivo"], v["estado_revision"]) for v in cedula["versiones"]] == [
        (2, "cedula.jpg", "RECIBIDO"), (1, "cedula-borrosa.pdf", "REQUIERE_CORRECCION")]
    assert cedula["versiones"][1]["comentario"] == "No se lee"
    assert cedula["versiones"][1]["revisado_por"] == "Alejandra Muñoz"

    todos = cliente_http.get("/api/v2/documentos?grupo=todos").json()["items"]
    assert [a["nombre"] for a in todos] == ["Cédula", "Poder firmado", "memorial.docx"]
    assert todos[2]["entregado_por_cliente"] is False and todos[2]["vista_previa"] is False
    assert [a["nombre"] for a in cliente_http.get("/api/v2/documentos?grupo=aprobados").json()["items"]] == ["Poder firmado"]
    assert cliente_http.get(f"/api/v2/documentos?grupo=todos&proceso_id={e['ajeno'].id}").json()["total"] == 0

    solicitudes = cliente_http.get("/api/v2/documentos/solicitudes?grupo=todas").json()["items"]
    assert [(s["titulo"], s["estado"], s["entregados"], s["vencida"]) for s in solicitudes] == [
        ("Poder", "completa", 1, False), ("Para la demanda", "esperando_cliente", 1, True)]
    pedidos = solicitudes[1]["pedidos"]
    assert [(p["nombre"], p["estado"], p["versiones"]) for p in pedidos] == [("Cédula", "RECIBIDO", 2), ("Registro civil", "FALTANTE", 0)]
    assert pedidos[0]["archivo_id"] == e["segunda"].id
    assert solicitudes[1]["puede_recordar"] is True
    assert solicitudes[1]["fecha_limite"] == (_hoy() - timedelta(days=1)).isoformat()
    assert [s["titulo"] for s in cliente_http.get("/api/v2/documentos/solicitudes").json()["items"]] == ["Para la demanda"]
    assert cliente_http.get("/api/v2/documentos/solicitudes?grupo=vencidas").json()["total"] == 1

    unico = cliente_http.get(f"/api/v2/documentos/{e['primera'].id}").json()
    assert unico["id"] == e["segunda"].id
    assert cliente_http.get(f"/api/v2/documentos/{e['del_ajeno'].id}").status_code == 404


def test_el_cliente_no_usa_los_documentos_de_la_firma(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario("CLIENTE"))
    assert cliente_http.get("/api/v2/documentos").status_code == 403
    assert cliente_http.get("/api/v2/documentos/solicitudes").status_code == 403


def test_revisar_la_version_vigente(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _sin_avisos(monkeypatch)
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    folio = models.FolioExpediente(proceso_id=e["proceso"].id, numero=1, tipo="documento", origen_id=e["segunda"].id, fecha=utc_ahora())
    sesion_bd.add(folio)
    sesion_bd.commit()
    iniciar(e["abogada"])

    anterior = cliente_http.patch(f"/api/v2/documentos/{e['primera'].id}/revision", json={"estado": "APROBADO"}, headers=H)
    assert anterior.status_code == 409
    assert anterior.json()["codigo"] == "version_anterior"
    sin_motivo = cliente_http.patch(f"/api/v2/documentos/{e['segunda'].id}/revision", json={"estado": "REQUIERE_CORRECCION", "comentario": " "}, headers=H)
    assert sin_motivo.status_code == 422
    de_la_firma = cliente_http.patch(f"/api/v2/documentos/{e['de_la_firma'].id}/revision", json={"estado": "APROBADO"}, headers=H)
    assert de_la_firma.json()["codigo"] == "documento_de_la_firma"

    respuesta = cliente_http.patch(f"/api/v2/documentos/{e['segunda'].id}/revision", json={"estado": "APROBADO", "comentario": "Bien"}, headers=H)
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["estado_revision"] == "APROBADO"
    assert respuesta.json()["versiones"][0]["revisado_por"] == "Alejandra Muñoz"
    sesion_bd.expire_all()
    assert sesion_bd.get(models.FolioExpediente, folio.id).revisado_en is not None
    # Aún falta el registro civil: la solicitud sigue esperando al cliente.
    assert sesion_bd.get(models.SolicitudDocumento, e["pendiente"].id).atendida_en is None
    assert [(destino, aviso["plantilla_clave"], aviso["variables"]["documento"]) for destino, aviso in enviados] == [
        (e["cliente"].id, "DOCUMENTO_REVISION", "Cédula")]


def test_pedir_documentos(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _sin_avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    ajeno = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Sucesión", clientes=[cliente])
    iniciar(abogada)
    base = {"proceso_id": proceso.id, "cliente_id": cliente.id, "titulo": "Para la demanda", "documentos": ["Cédula", "Registro civil"]}

    no_vinculado = cliente_http.post("/api/v2/documentos/solicitudes", json={**base, "cliente_id": ajeno.id}, headers=H)
    assert no_vinculado.status_code == 422
    assert "cliente_id" in no_vinculado.json()["campos"]
    pasada = cliente_http.post("/api/v2/documentos/solicitudes", json={**base, "fecha_limite": (_hoy() - timedelta(days=1)).isoformat()}, headers=H)
    assert pasada.json()["codigo"] == "fecha_pasada"
    repetidos = cliente_http.post("/api/v2/documentos/solicitudes", json={**base, "documentos": ["Cédula", "cédula "]}, headers=H)
    assert repetidos.status_code == 422

    fecha = (_hoy() + timedelta(days=3)).isoformat()
    respuesta = cliente_http.post("/api/v2/documentos/solicitudes", json={**base, "fecha_limite": fecha, "instrucciones": " Legibles "}, headers=H)
    assert respuesta.status_code == 201, respuesta.text
    creada = respuesta.json()
    assert creada["fecha_limite"] == fecha
    assert creada["instrucciones"] == "Legibles"
    assert [p["estado"] for p in creada["pedidos"]] == ["FALTANTE", "FALTANTE"]
    assert creada["estado"] == "esperando_cliente" and creada["vencida"] is False
    assert enviados[0][0] == cliente.id
    assert enviados[0][1]["plantilla_clave"] == "SOLICITUD_DOCUMENTO"
    assert enviados[0][1]["variables"]["documentos"] == "- Cédula\n- Registro civil"


def test_recordar_cambiar_fecha_y_eliminar(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    enviados = _sin_avisos(monkeypatch)
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])
    pendiente, completa = e["pendiente"].id, e["completa"].id

    assert cliente_http.post(f"/api/v2/documentos/solicitudes/{completa}/recordar", headers=H).json()["codigo"] == "nada_pendiente"
    respuesta = cliente_http.post(f"/api/v2/documentos/solicitudes/{pendiente}/recordar", headers=H)
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["puede_recordar"] is False
    assert respuesta.json()["ultimo_recordatorio_en"] is not None
    aviso = enviados[-1][1]
    assert aviso["plantilla_clave"] == "RECORDATORIO_DOCUMENTO"
    assert aviso["variables"]["pendientes"] == "- Registro civil"
    assert aviso["variables"]["cuando"].startswith("venció el ")
    otra_vez = cliente_http.post(f"/api/v2/documentos/solicitudes/{pendiente}/recordar", headers=H)
    assert otra_vez.status_code == 409 and otra_vez.json()["codigo"] == "recordatorio_reciente"

    nueva = (_hoy() + timedelta(days=7)).isoformat()
    cambio = cliente_http.patch(f"/api/v2/documentos/solicitudes/{pendiente}", json={"fecha_limite": nueva}, headers=H)
    assert cambio.json()["fecha_limite"] == nueva and cambio.json()["vencida"] is False
    sin_fecha = cliente_http.patch(f"/api/v2/documentos/solicitudes/{pendiente}", json={"fecha_limite": None}, headers=H)
    assert sin_fecha.json()["fecha_limite"] is None

    assert cliente_http.delete(f"/api/v2/documentos/solicitudes/{pendiente}", headers=H).status_code == 204
    sesion_bd.expire_all()
    assert sesion_bd.get(models.SolicitudDocumento, pendiente) is None
    assert sesion_bd.get(models.DocumentoProceso, e["segunda"].id).solicitud_id is None
    assert cliente_http.delete(f"/api/v2/documentos/solicitudes/{pendiente}", headers=H).status_code == 404


def test_recordatorios_automaticos(crear_usuario, crear_proceso, sesion_bd, monkeypatch):
    enviados = _sin_avisos(monkeypatch)
    abogada = crear_usuario("ABOGADO_ADMIN")
    cliente = crear_usuario("CLIENTE")
    inactivo = crear_usuario("CLIENTE", estado="SUSPENDIDO")
    proceso = crear_proceso(abogada, "Sucesión", clientes=[cliente, inactivo])
    pronto = _solicitud(sesion_bd, proceso, cliente, "Vence pronto", ["Cédula"], vence_en_dias=2)
    vencida = _solicitud(sesion_bd, proceso, cliente, "Vencida ayer", ["Cédula"], vence_en_dias=-1,
                         ultimo_recordatorio_en=utc_ahora() - timedelta(days=3))
    _solicitud(sesion_bd, proceso, cliente, "Lejos", ["Cédula"], vence_en_dias=10)
    _solicitud(sesion_bd, proceso, inactivo, "Cliente inactivo", ["Cédula"], vence_en_dias=1)
    entregada = _solicitud(sesion_bd, proceso, cliente, "Ya entregada", ["Cédula"], vence_en_dias=1)
    _entrega(sesion_bd, entregada, "p1", "cedula.pdf")
    servicio = ServicioDocumentos(sesion_bd, RepositorioDocumentos(sesion_bd))

    resultado = servicio.enviar_recordatorios(_hoy())
    assert sorted(resultado.solicitudes) == sorted([pronto.id, vencida.id])
    assert {aviso["variables"]["solicitud"] for _, aviso in enviados} == {"Vence pronto", "Vencida ayer"}
    # Al día siguiente ya no se repiten.
    assert servicio.enviar_recordatorios(_hoy() + timedelta(days=1)).enviados == 0
    # Vencida la primera, recibe el aviso de vencimiento una vez.
    assert servicio.enviar_recordatorios(_hoy() + timedelta(days=3)).solicitudes == [pronto.id]


def test_ver_y_descargar_el_archivo(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)

    class R2:
        def get_object(self, Bucket, Key):
            assert Key == "r2/cedula.jpg"
            return {"Body": iter([b"\xff\xd8", b"imagen"])}

    monkeypatch.setattr("app.storage.get_r2_client", lambda: R2())
    monkeypatch.setattr("app.storage.get_r2_bucket", lambda: "cubeta")
    iniciar(e["abogada"])

    vista = cliente_http.get(f"/api/v2/documentos/{e['segunda'].id}/archivo?descargar=false")
    assert vista.status_code == 200
    assert vista.content == b"\xff\xd8imagen"
    assert vista.headers["content-type"] == "image/jpeg"
    assert vista.headers["content-disposition"].startswith("inline;")
    descarga = cliente_http.get(f"/api/v2/documentos/{e['segunda'].id}/archivo")
    assert descarga.headers["content-disposition"] == "attachment; filename*=UTF-8''cedula.jpg"
    assert cliente_http.get(f"/api/v2/documentos/{e['del_ajeno'].id}/archivo").status_code == 404
