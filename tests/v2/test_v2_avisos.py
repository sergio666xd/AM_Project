from datetime import timedelta

from app import models
from app.nucleo.zona_horaria import ahora_utc

CSRF = {"X-AM-Solicitud": "1"}


def _solicitud(sesion_bd, proceso, cliente, titulo="Registro civil de defunción"):
    solicitud = models.SolicitudDocumento(proceso_id=proceso.id, cliente_id=cliente.id, titulo=titulo, documentos_requeridos=[])
    sesion_bd.add(solicitud)
    sesion_bd.commit()
    return solicitud


def test_abogado_y_cliente_ven_el_mismo_pendiente_a_su_manera(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente])
    solicitud = _solicitud(sesion_bd, proceso, cliente)

    iniciar(abogada)
    para_abogada = cliente_http.get("/api/v2/avisos").json()
    aviso = next(item for item in para_abogada["items"] if item["id"] == f"documento:{solicitud.id}")
    assert aviso["titulo"] == "Registro civil de defunción"
    assert aviso["proceso"] == "Sucesión Restrepo"
    assert aviso["fecha"].endswith("-05:00")
    assert aviso["leido"] is False
    assert para_abogada["sin_leer"] >= 1

    iniciar(cliente)
    para_cliente = cliente_http.get("/api/v2/avisos").json()
    assert f"solicitud:{solicitud.id}" in {item["id"] for item in para_cliente["items"]}


def test_marcar_leidos_baja_el_contador_e_ignora_ajenos(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario()
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogado, clientes=[cliente])
    primera = _solicitud(sesion_bd, proceso, cliente, "Cédula")
    _solicitud(sesion_bd, proceso, cliente, "Poder firmado")
    iniciar(abogado)

    antes = cliente_http.get("/api/v2/avisos").json()["sin_leer"]
    marcado = cliente_http.post("/api/v2/avisos/leer", json={"ids": [f"documento:{primera.id}", "documento:999999"]}, headers=CSRF)
    assert marcado.json() == {"marcados": 1}
    assert cliente_http.get("/api/v2/avisos").json()["sin_leer"] == antes - 1

    todos = cliente_http.post("/api/v2/avisos/leer-todos", headers=CSRF)
    assert todos.json()["marcados"] == antes - 1
    despues = cliente_http.get("/api/v2/avisos").json()
    assert despues["sin_leer"] == 0
    assert all(item["leido"] for item in despues["items"])


def test_el_limite_recorta_la_lista_pero_no_el_total(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogado = crear_usuario()
    cliente = crear_usuario("CLIENTE")
    proceso = crear_proceso(abogado, clientes=[cliente])
    for n in range(4):
        _solicitud(sesion_bd, proceso, cliente, f"Documento {n}")
    iniciar(abogado)

    respuesta = cliente_http.get("/api/v2/avisos", params={"limite": 2}).json()
    assert len(respuesta["items"]) == 2
    assert respuesta["sin_leer"] >= 4


def test_administracion_ve_las_alertas_de_la_firma(iniciar, crear_usuario, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    tarea = models.Tarea(usuario_id=abogada.id, titulo="Contestar demanda", fecha_limite=ahora_utc().replace(tzinfo=None) - timedelta(days=1))
    sesion_bd.add(tarea)
    sesion_bd.commit()

    iniciar(crear_usuario("ADMIN"))
    avisos = cliente_http.get("/api/v2/avisos").json()
    aviso = next(item for item in avisos["items"] if item["id"] == f"tarea_vencida:{tarea.id}")
    assert aviso["titulo"] == "Tarea vencida: Contestar demanda"
    assert aviso["href"] == "/gestion-procesos/admin/tareas"


def test_marcar_sin_encabezado_csrf_se_rechaza(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario())
    respuesta = cliente_http.post("/api/v2/avisos/leer-todos")
    assert respuesta.status_code == 403
    assert respuesta.json()["codigo"] == "csrf"
