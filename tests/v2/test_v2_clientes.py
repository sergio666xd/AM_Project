from datetime import timedelta

from app import models, security
from app.nucleo.zona_horaria import a_colombia, fin_del_dia_utc
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _sin_avisos(monkeypatch):
    enviados = []
    monkeypatch.setattr("app.modulos.clientes.servicio.notificar", lambda db, destinatario, **k: enviados.append((destinatario.id, k)))
    return enviados


def _escenario(crear_usuario, crear_proceso, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    otro = crear_usuario(nombre="Otro abogado")
    gloria = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    hernan = crear_usuario("CLIENTE", nombre="Hernán Cardona", debe_cambiar_password=True)
    nuevo = crear_usuario("CLIENTE", nombre="Ana Nueva")
    nuevo.creado_por_abogado_id = abogada.id
    ajeno = crear_usuario("CLIENTE", nombre="Cliente ajeno")
    sucesion = crear_proceso(abogada, "Sucesión Restrepo", clientes=[gloria], radicados=["05001310300420240031200"])
    crear_proceso(abogada, "Archivado", clientes=[gloria], archivado=True)
    arriendo = crear_proceso(abogada, "Restitución Cardona", clientes=[hernan])
    del_otro = crear_proceso(otro, "Del otro", clientes=[ajeno, gloria])
    hoy = a_colombia(utc_ahora()).date()
    vencida = models.SolicitudDocumento(
        proceso_id=sucesion.id, cliente_id=gloria.id, titulo="Para el inventario",
        documentos_requeridos=[{"id": "p1", "nombre": "Escritura"}, {"id": "p2", "nombre": "Avalúo"}],
        fecha_limite=fin_del_dia_utc(hoy - timedelta(days=1)),
    )
    ajena = models.SolicitudDocumento(proceso_id=del_otro.id, cliente_id=gloria.id, titulo="Del otro",
                                      documentos_requeridos=[{"id": "p1", "nombre": "Algo"}])
    sesion_bd.add_all([vencida, ajena])
    sesion_bd.flush()
    sesion_bd.add(models.DocumentoProceso(proceso_id=sucesion.id, cliente_id=gloria.id, solicitud_id=vencida.id,
                                          solicitud_item_id="p1", nombre_archivo="escritura.pdf", ruta_archivo="r2/e", mime_type="application/pdf"))
    sesion_bd.commit()
    return locals()


def test_lista_con_procesos_pendientes_y_acceso(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    iniciar(e["abogada"])

    lista = cliente_http.get("/api/v2/clientes").json()
    assert lista["resumen"] == {"total": 3, "con_pendientes": 1, "sin_ingreso": 1, "sin_procesos": 1}
    por_nombre = {c["nombre"]: c for c in lista["items"]}
    assert list(por_nombre) == ["Ana Nueva", "Gloria Restrepo", "Hernán Cardona"]
    gloria = por_nombre["Gloria Restrepo"]
    # Solo los procesos activos que ella ve; lo pedido en el proceso del otro abogado no cuenta.
    assert gloria["procesos"] == [{"id": e["sucesion"].id, "nombre": "Sucesión Restrepo"}]
    assert (gloria["documentos_pendientes"], gloria["solicitudes_vencidas"]) == (1, 1)
    assert gloria["acceso"] == "activo" and gloria["proceso_chat_id"] == e["sucesion"].id
    assert por_nombre["Hernán Cardona"]["acceso"] == "sin_ingreso"
    assert por_nombre["Ana Nueva"]["procesos"] == [] and por_nombre["Ana Nueva"]["proceso_chat_id"] is None

    assert [c["nombre"] for c in cliente_http.get("/api/v2/clientes?grupo=con_pendientes").json()["items"]] == ["Gloria Restrepo"]
    assert [c["nombre"] for c in cliente_http.get("/api/v2/clientes?grupo=sin_ingreso").json()["items"]] == ["Hernán Cardona"]
    assert [c["nombre"] for c in cliente_http.get("/api/v2/clientes?grupo=sin_procesos").json()["items"]] == ["Ana Nueva"]


def test_ficha_del_cliente(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    sesion_bd.add(models.ContratoServicio(proceso_id=e["sucesion"].id, cliente_id=e["gloria"].id, abogado_id=e["abogada"].id,
                                          estado="FIRMADO", contenido_actual="", firmado_en=utc_ahora()))
    sesion_bd.commit()
    iniciar(e["abogada"])

    ficha = cliente_http.get(f"/api/v2/clientes/{e['gloria'].id}").json()
    assert ficha["expedientes"] == [{"id": e["sucesion"].id, "nombre": "Sucesión Restrepo", "etapa": None,
                                     "radicados": ["05001310300420240031200"], "responsable": "Alejandra Muñoz"}]
    [pendiente] = ficha["pendientes"]
    assert (pendiente["titulo"], pendiente["faltan"], pendiente["total"], pendiente["vencida"]) == ("Para el inventario", ["Avalúo"], 2, True)
    assert [(c["estado"], c["proceso"]["nombre"]) for c in ficha["contratos"]] == [("FIRMADO", "Sucesión Restrepo")]

    # Un cliente de otro abogado no aparece, ni un cliente consulta clientes.
    assert cliente_http.get(f"/api/v2/clientes/{e['ajeno'].id}").status_code == 404
    iniciar(e["otro"])
    ficha_del_otro = cliente_http.get(f"/api/v2/clientes/{e['gloria'].id}").json()
    assert ficha_del_otro["contratos"] is None
    assert [p["nombre"] for p in ficha_del_otro["procesos"]] == ["Del otro"]
    iniciar(e["gloria"])
    assert cliente_http.get("/api/v2/clientes", headers=H).status_code == 403


def test_crear_editar_y_reenviar_acceso(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd, monkeypatch):
    e = _escenario(crear_usuario, crear_proceso, sesion_bd)
    enviados = _sin_avisos(monkeypatch)
    iniciar(e["abogada"])

    falta_whatsapp = cliente_http.post("/api/v2/clientes", headers=H, json={"nombre": "Luz Ospina", "email": "luz@example.com", "canal": "WHATSAPP"})
    assert falta_whatsapp.status_code == 422 and "whatsapp" in falta_whatsapp.json()["campos"]
    creado = cliente_http.post("/api/v2/clientes", headers=H, json={
        "nombre": "  Luz   Marina Ospina ", "email": "Luz@Example.com", "whatsapp": "300 123 4567", "documento": "1.020.304",
    })
    assert creado.status_code == 201, creado.text
    luz = creado.json()
    assert (luz["nombre"], luz["email"], luz["documento"], luz["acceso"], luz["canal"]) == (
        "Luz Marina Ospina", "luz@example.com", "1020304", "sin_ingreso", "EMAIL")
    [(destino, aviso)] = enviados
    clave = aviso["variables"]["password"]
    assert destino == luz["id"] and aviso["plantilla_clave"] == "CLIENTE_CREDENCIALES" and len(clave) == 12
    cuenta = sesion_bd.get(models.Usuario, luz["id"])
    sesion_bd.refresh(cuenta)
    assert security.verify_password(clave, cuenta.password_hash)
    assert cuenta.creado_por_abogado_id == e["abogada"].id and cuenta.debe_cambiar_password

    repetido = cliente_http.post("/api/v2/clientes", headers=H, json={"nombre": "Otra Luz", "email": "LUZ@example.com"})
    assert repetido.status_code == 409 and repetido.json()["codigo"] == "correo_en_uso"

    editado = cliente_http.patch(f"/api/v2/clientes/{luz['id']}", headers=H, json={"domicilio": "Medellín", "genero": "FEMENINO"})
    assert (editado.json()["domicilio"], editado.json()["genero"], editado.json()["whatsapp"]) == ("Medellín", "FEMENINO", "300 123 4567")
    assert cliente_http.patch(f"/api/v2/clientes/{luz['id']}", headers=H, json={"nombre": "  "}).status_code == 422

    reenviado = cliente_http.post(f"/api/v2/clientes/{luz['id']}/acceso", headers=H)
    assert reenviado.json() == {"canal": "EMAIL", "destino": "luz@example.com"}
    nueva = enviados[-1][1]["variables"]["password"]
    sesion_bd.refresh(cuenta)
    assert nueva != clave and security.verify_password(nueva, cuenta.password_hash)
    ya_entro = cliente_http.post(f"/api/v2/clientes/{e['gloria'].id}/acceso", headers=H)
    assert ya_entro.status_code == 409 and ya_entro.json()["codigo"] == "ya_ingreso"
