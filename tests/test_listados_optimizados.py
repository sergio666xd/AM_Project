from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.timezone import utc_ahora
from app import models
from app.routers.radicados import listar_mis_radicados, obtener_radicado
from app.routers.chat import _ack_entrega_push, confirmar_entrega_push, enviar_mensaje, listar_conversaciones, resolver_conversacion
from app.routers.expedientes import listar_procesos
from app import schemas


def _user(email: str, rol: models.RolUsuario, nombre: str) -> models.Usuario:
    return models.Usuario(
        email=email,
        password_hash="hash",
        nombre_completo=nombre,
        whatsapp_numero="",
        rol=rol,
        estado=models.EstadoUsuario.ACTIVO,
    )


@pytest.fixture()
def firma():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        admin = _user("admin@example.test", models.RolUsuario.ADMIN, "Admin")
        socia = _user("socia@example.test", models.RolUsuario.ABOGADO_ADMIN, "Socia")
        otra = _user("otra@example.test", models.RolUsuario.ABOGADO_ADMIN, "Otra socia")
        cliente = _user("cliente@example.test", models.RolUsuario.CLIENTE, "Cliente")
        db.add_all([admin, socia, otra, cliente])
        db.flush()

        procesos = []
        for indice in range(3):
            proceso = models.Proceso(abogado_id=socia.id, nombre=f"Proceso {indice}")
            db.add(proceso)
            db.flush()
            radicado = models.Radicado(numero=f"1234567890123456789012{indice}", creado_por_id=socia.id)
            db.add(radicado)
            db.flush()
            db.add_all([
                models.Actuacion(radicado_id=radicado.id, orden=orden, actuacion=f"Actuación {orden}")
                for orden in range(1, 4)
            ])
            db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
            db.add(models.ProcesoCliente(proceso_id=proceso.id, cliente_id=cliente.id))
            db.add(models.Tarea(
                titulo=f"Tarea {indice}",
                usuario_id=socia.id,
                proceso_id=proceso.id,
                fecha_limite=utc_ahora() - timedelta(days=1),
            ))
            procesos.append(proceso)
        ajeno = models.Proceso(abogado_id=otra.id, nombre="Proceso ajeno")
        db.add(ajeno)
        db.commit()
        yield {"db": db, "engine": engine, "admin": admin, "socia": socia, "otra": otra,
               "cliente": cliente, "procesos": procesos, "ajeno": ajeno}


def _contar_consultas(engine):
    contador = {"total": 0}

    def _sumar(*_args, **_kwargs):
        contador["total"] += 1

    event.listen(engine, "before_cursor_execute", _sumar)
    return contador, lambda: event.remove(engine, "before_cursor_execute", _sumar)


def test_listar_procesos_resume_actividad_sin_consultas_por_proceso(firma):
    db, socia = firma["db"], firma["socia"]
    db.expire_all()
    contador, detener = _contar_consultas(firma["engine"])
    try:
        resultado = listar_procesos(db=db, usuario=socia)
    finally:
        detener()

    assert sorted(item["nombre"] for item in resultado) == ["Proceso 0", "Proceso 1", "Proceso 2"]
    assert all(item["tareas_pendientes"] == 1 and item["tareas_vencidas"] == 1 for item in resultado)
    assert all(len(item["radicados"][0]["actuaciones"]) == 3 for item in resultado)
    assert all(item["clientes"][0]["nombre_completo"] == "Cliente" for item in resultado)
    # Antes eran 3 consultas por proceso más cargas perezosas; ahora es constante.
    assert contador["total"] <= 14


def test_radicados_resumen_y_detalle(firma):
    db, socia, otra = firma["db"], firma["socia"], firma["otra"]
    resumen = listar_mis_radicados(resumen=True, usuario_actual=socia, db=db)
    assert len(resumen) == 3
    assert all(item["actuaciones"] == [] for item in resumen)

    completo = listar_mis_radicados(resumen=False, usuario_actual=socia, db=db)
    assert all(len(item["actuaciones"]) == 3 for item in completo)

    detalle = obtener_radicado(radicado_id=completo[0]["id"], usuario_actual=socia, db=db)
    assert detalle["numero"] == completo[0]["numero"]
    assert [item["orden"] for item in detalle["actuaciones"]] == [1, 2, 3]

    with pytest.raises(HTTPException) as fuera_de_alcance:
        obtener_radicado(radicado_id=completo[0]["id"], usuario_actual=otra, db=db)
    assert fuera_de_alcance.value.status_code == 404


def test_listar_conversaciones_respeta_alcance_y_cuenta_no_leidos(firma, monkeypatch):
    db, socia, cliente, admin = firma["db"], firma["socia"], firma["cliente"], firma["admin"]
    monkeypatch.setattr("app.routers.chat._notify_chat_recipients", lambda *args, **kwargs: None, raising=False)

    conversaciones_cliente = listar_conversaciones(sincronizar=True, db=db, user=cliente)
    directas = [item for item in conversaciones_cliente if item["tipo"] == "PROCESO_DIRECTO"]
    assert len(directas) == 3
    assert all(item["no_leidos"] == 0 and item["ultimo_mensaje"] is None for item in directas)

    destino = directas[0]
    try:
        enviar_mensaje(destino["id"], schemas.ChatMensajeCreate(contenido="Hola"), db=db, user=socia)
        enviar_mensaje(destino["id"], schemas.ChatMensajeCreate(contenido="¿Me confirmas?"), db=db, user=socia)
    except HTTPException:
        pytest.skip("El envío requiere servicios de notificación no disponibles en pruebas.")

    db.expire_all()
    contador, detener = _contar_consultas(firma["engine"])
    try:
        sondeo = listar_conversaciones(sincronizar=False, db=db, user=cliente)
    finally:
        detener()
    actualizada = next(item for item in sondeo if item["id"] == destino["id"])
    assert actualizada["no_leidos"] == 2
    assert actualizada["ultimo_mensaje"] == "¿Me confirmas?"
    assert actualizada["ultimo_remitente"] == "Socia"
    assert actualizada["primer_no_leido_id"] is not None
    assert sondeo[0]["id"] == destino["id"]
    assert contador["total"] <= 10

    # El proceso archivado deja de aparecer en el chat del cliente.
    firma["procesos"][1].archivado_en = utc_ahora()
    db.commit()
    tras_archivar = listar_conversaciones(sincronizar=False, db=db, user=cliente)
    assert len([item for item in tras_archivar if item["tipo"] == "PROCESO_DIRECTO"]) == 2

    # ADMIN no participa en chats de procesos ajenos.
    admin_chats = listar_conversaciones(sincronizar=True, db=db, user=admin)
    assert all(item["tipo"] == "STAFF_DIRECT" for item in admin_chats)


def test_inventario_admin_devuelve_todo_con_campos_legibles(firma):
    from app.routers.admin.inventario import listar_inventario_global

    db, admin = firma["db"], firma["admin"]
    db.expire_all()
    contador, detener = _contar_consultas(firma["engine"])
    try:
        procesos = listar_inventario_global("procesos", sector="FIRMA", archivados=False, db=db, admin=admin)
    finally:
        detener()
    assert {item["nombre"] for item in procesos} == {"Proceso 0", "Proceso 1", "Proceso 2", "Proceso ajeno"}
    propio = next(item for item in procesos if item["nombre"] == "Proceso 0")
    assert propio["salud"] == "RIESGO"
    assert propio["clientes_nombres"] == ["Cliente"]
    assert len(propio["radicados_numeros"]) == 1
    assert contador["total"] <= 14

    radicados = listar_inventario_global("radicados", sector="FIRMA", db=db, admin=admin)
    assert all(item["ultima_actuacion"] == "Actuación 1" and item["procesos"] for item in radicados)

    tareas = listar_inventario_global("tareas", sector="FIRMA", db=db, admin=admin)
    assert len(tareas) == 3 and all(item["radicado"] is None and item["subtareas"] == 0 for item in tareas)

    assert listar_inventario_global("documentos", sector="FIRMA", db=db, admin=admin) == []


def test_cliente_ve_la_actuacion_mas_reciente_de_cada_radicado(firma):
    # La Rama Judicial devuelve primero lo más reciente, así que orden 1 es la última actuación.
    db, cliente = firma["db"], firma["cliente"]
    procesos = listar_procesos(db=db, usuario=cliente)
    assert procesos
    for proceso in procesos:
        assert [item["actuacion"] for item in proceso["radicados"][0]["actuaciones"]] == ["Actuación 1"]


def test_chat_carga_mensajes_por_paginas_desde_el_final(firma):
    db, socia, cliente = firma["db"], firma["socia"], firma["cliente"]
    conversacion = next(
        item for item in listar_conversaciones(sincronizar=True, db=db, user=cliente)
        if item["tipo"] == "PROCESO_DIRECTO"
    )
    db.add_all([
        models.ChatMensaje(conversacion_id=conversacion["id"], remitente_id=socia.id, contenido=f"Mensaje {numero}")
        for numero in range(1, 71)
    ])
    db.commit()

    ultimos = resolver_conversacion(conversacion["route_key"], limite=30, db=db, user=cliente)
    assert [item["contenido"] for item in ultimos["mensajes"]][::29] == ["Mensaje 41", "Mensaje 70"]
    assert ultimos["hay_mas"] is True

    anteriores = resolver_conversacion(
        conversacion["route_key"], before_id=ultimos["mensajes"][0]["id"], limite=30, db=db, user=cliente,
    )
    assert [item["contenido"] for item in anteriores["mensajes"]][::29] == ["Mensaje 11", "Mensaje 40"]
    assert anteriores["hay_mas"] is True
    assert anteriores["estados_mensajes"] == []

    primeros = resolver_conversacion(
        conversacion["route_key"], before_id=anteriores["mensajes"][0]["id"], limite=30, db=db, user=cliente,
    )
    assert [item["contenido"] for item in primeros["mensajes"]] == [f"Mensaje {numero}" for numero in range(1, 11)]
    assert primeros["hay_mas"] is False


def test_push_recibido_marca_el_mensaje_como_entregado(firma, monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "clave-de-prueba")
    db, socia, cliente = firma["db"], firma["socia"], firma["cliente"]
    conversacion = next(
        item for item in listar_conversaciones(sincronizar=True, db=db, user=cliente)
        if item["tipo"] == "PROCESO_DIRECTO"
    )
    mensaje = models.ChatMensaje(conversacion_id=conversacion["id"], remitente_id=socia.id, contenido="Hola")
    db.add(mensaje)
    db.commit()

    ack = _ack_entrega_push(cliente.id, mensaje.id)
    falsa = schemas.ChatPushEntrega(usuario_id=socia.id, mensaje_id=mensaje.id, firma=ack["firma"])
    with pytest.raises(HTTPException) as rechazo:
        confirmar_entrega_push(falsa, db=db)
    assert rechazo.value.status_code == 403

    confirmar_entrega_push(schemas.ChatPushEntrega(**{k: ack[k] for k in ("usuario_id", "mensaje_id", "firma")}), db=db)
    vista_socia = resolver_conversacion(f"process:{conversacion['proceso_id']}:{cliente.id}", db=db, user=socia)
    assert vista_socia["mensajes"][-1]["estado_entrega"] == "ENTREGADO"
    assert vista_socia["mensajes"][-1]["leidos"] == 0
