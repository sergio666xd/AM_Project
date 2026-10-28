from datetime import timedelta

from app import models
from app.timezone import utc_ahora


def _tarea(sesion_bd, abogado, proceso, titulo, vence_en, estado="PENDIENTE"):
    sesion_bd.add(models.Tarea(usuario_id=abogado.id, proceso_id=proceso.id if proceso else None, titulo=titulo,
                               estado=models.EstadoTarea(estado), fecha_limite=utc_ahora() + vence_en))
    sesion_bd.commit()


def test_bandeja_ordena_lo_urgente(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    cliente = crear_usuario("CLIENTE", nombre="Gloria Restrepo")
    proceso = crear_proceso(abogada, "Sucesión Restrepo", clientes=[cliente])
    archivado = crear_proceso(abogada, "Archivado", archivado=True)
    ajeno = crear_proceso(crear_usuario(), "Ajeno")

    _tarea(sesion_bd, abogada, proceso, "Radicar inventario", timedelta(days=4))
    _tarea(sesion_bd, abogada, proceso, "Contestar demanda", -timedelta(days=1))
    _tarea(sesion_bd, abogada, proceso, "Ya hecha", -timedelta(days=2), estado="COMPLETADA")
    _tarea(sesion_bd, abogada, proceso, "Lejana", timedelta(days=30))
    _tarea(sesion_bd, abogada, None, "Renovar tarjeta profesional", timedelta(days=2))
    _tarea(sesion_bd, abogada, archivado, "De un archivado", -timedelta(days=1))
    _tarea(sesion_bd, abogada, ajeno, "De otro abogado", -timedelta(days=1))
    sesion_bd.add(models.EventoAgenda(titulo="Audiencia inicial", tipo="AUDIENCIA", fecha_inicio=utc_ahora() + timedelta(days=3),
                                      proceso_id=proceso.id))
    sesion_bd.add(models.DocumentoProceso(proceso_id=proceso.id, cliente_id=cliente.id, nombre_archivo="registro-civil.pdf",
                                          ruta_archivo="x", mime_type="application/pdf", estado_revision="RECIBIDO"))
    sesion_bd.add(models.DocumentoProceso(proceso_id=proceso.id, cliente_id=cliente.id, nombre_archivo="aprobado.pdf",
                                          ruta_archivo="y", mime_type="application/pdf", estado_revision="APROBADO"))
    sesion_bd.commit()
    iniciar(abogada)

    bandeja = cliente_http.get("/api/v2/bandeja").json()
    assert bandeja["resumen"] == {"procesos_activos": 1, "tareas_vencidas": 1, "vencen_esta_semana": 3, "documentos_por_revisar": 1}
    assert [(p["titulo"], p["urgencia"]) for p in bandeja["pendientes"]] == [
        ("Contestar demanda", "vencida"),
        ("registro-civil.pdf", "por_revisar"),
        ("Renovar tarjeta profesional", "pronto"),
        ("Radicar inventario", "pronto"),
    ]
    documento = bandeja["pendientes"][1]
    assert documento["detalle"] == "Lo entregó Gloria Restrepo"
    assert documento["proceso"] == {"id": proceso.id, "nombre": "Sucesión Restrepo"}
    assert documento["enlace"] == f"/gestion-procesos/abogado/procesos/{proceso.id}/documentos"
    assert bandeja["pendientes"][2]["proceso"] is None
    assert [(e["titulo"], e["detalle"], e["urgencia"]) for e in bandeja["agenda"]] == [("Audiencia inicial", "Audiencia", "pronto")]


def test_el_cliente_no_tiene_bandeja(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario("CLIENTE"))
    assert cliente_http.get("/api/v2/bandeja").status_code == 403
