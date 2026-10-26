from datetime import timedelta

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import models
from app.radicados import obtener_o_vincular_radicado
from app.timezone import utc_ahora


def seed_notification_center(db, total_processes):
    """Crea procesos con todas las fuentes que alimentan el centro de notificaciones."""
    now = utc_ahora().replace(microsecond=0)
    lawyer = models.Usuario(
        email="center-lawyer@example.test", password_hash="hash", nombre_completo="Center lawyer",
        whatsapp_numero="", rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
    )
    db.add(lawyer)
    db.flush()
    for index in range(total_processes):
        client = models.Usuario(
            email=f"center-client-{index}@example.test", password_hash="hash", nombre_completo=f"Client {index}",
            whatsapp_numero="", rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
        )
        process = models.Proceso(abogado_id=lawyer.id, nombre=f"Process {index}", created_at=now - timedelta(days=60))
        db.add_all([client, process])
        db.flush()
        db.add(models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id))
        if index % 2:
            db.add(models.EventoAuditoria(
                actor_id=lawyer.id, accion="proceso.actualizar", tipo_recurso="proceso",
                recurso_id=str(process.id), created_at=now - timedelta(days=1),
            ))
        db.add_all([
            models.Tarea(usuario_id=lawyer.id, proceso_id=process.id, titulo=f"Task {index}",
                         fecha_limite=now + timedelta(days=index - 1)),
            models.SolicitudDocumento(proceso_id=process.id, cliente_id=client.id, titulo=f"Request {index}",
                                      created_at=now - timedelta(hours=index + 1)),
            models.DocumentoProceso(proceso_id=process.id, cliente_id=client.id, nombre_archivo=f"doc-{index}.pdf",
                                    ruta_archivo=f"docs/{index}", mime_type="application/pdf",
                                    estado_revision="RECIBIDO", created_at=now - timedelta(hours=index + 2)),
            models.EventoAgenda(proceso_id=process.id, titulo=f"Event {index}", tipo="AUDIENCIA",
                                estado="PROGRAMADO", fecha_inicio=now + timedelta(days=2, hours=index)),
            models.NotificacionProceso(abogado_id=lawyer.id, proceso_id=process.id, cliente_id=client.id,
                                       actuacion_id=1, asunto=f"Notice {index}", cuerpo="Body",
                                       created_at=now - timedelta(hours=index + 3)),
            models.SolicitudEdicionPerfilCliente(cliente_id=client.id, email_solicitado=client.email,
                                                 nombre_completo_solicitado=client.nombre_completo,
                                                 solicitada_en=now - timedelta(hours=index + 4)),
        ])
        radicado, _ = obtener_o_vincular_radicado(db, lawyer, f"{index + 1:023d}")
        db.flush()
        radicado.estado_consulta = "ERROR" if index % 3 == 0 else "OK"
        db.add(models.ProcesoRadicado(proceso_id=process.id, radicado_id=radicado.id))
    db.add(models.LecturaNotificacionAbogado(usuario_id=lawyer.id, notificacion_id="tarea:1"))
    db.commit()
    return lawyer


def run_center(total_processes):
    from app.routers.expedientes import _notificaciones_abogado, listar_notificaciones_despacho

    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    statements = []
    with Session(engine) as db:
        lawyer = seed_notification_center(db, total_processes)
        db.expire_all()
        event.listen(engine, "before_cursor_execute", lambda *args: statements.append(args[2]))
        center = _notificaciones_abogado(db, lawyer)
        center_queries = len(statements)
        notices = listar_notificaciones_despacho(db=db, usuario=lawyer)
    for item in center:
        if item["tipo"] == "ERROR_CONSULTA":
            item["fecha"] = None  # Usa la hora actual.
    return center, notices, center_queries, len(statements) - center_queries


def test_notification_center_lists_every_source_with_process_names():
    center, notices, _, _ = run_center(4)

    tipos = sorted(item["tipo"] for item in center)
    assert tipos.count("SIN_ACTIVIDAD") == 2
    assert tipos.count("ERROR_CONSULTA") == 2
    assert tipos.count("PERFIL_CLIENTE") == 4
    assert {item["proceso"] for item in center} == {f"Process {index}" for index in range(4)}
    assert next(item for item in center if item["id"] == "tarea:1")["leida"] is True
    assert {item["cliente"] for item in notices} == {f"Client {index}" for index in range(4)}
    assert {item["proceso"] for item in notices} == {f"Process {index}" for index in range(4)}


def test_notification_center_query_count_does_not_grow_with_processes():
    _, _, center_few, notices_few = run_center(3)
    _, _, center_many, notices_many = run_center(25)
    assert center_many == center_few
    assert notices_many == notices_few
