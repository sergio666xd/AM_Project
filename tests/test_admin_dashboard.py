from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.routers.admin.dashboard import obtener_dashboard_admin


def test_admin_dashboard_returns_scoped_attention_and_human_activity():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    try:
        admin = models.Usuario(
            email="admin@example.com",
            password_hash="hash",
            nombre_completo="Admin Principal",
            whatsapp_numero="3000000000",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        lawyer = models.Usuario(
            email="lawyer@example.com",
            password_hash="hash",
            nombre_completo="Abogada Firma",
            whatsapp_numero="3000000001",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        client = models.Usuario(
            email="client@example.com",
            password_hash="hash",
            nombre_completo="Cliente Uno",
            whatsapp_numero="3000000002",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
        )
        saas_lawyer = models.Usuario(
            email="saas@example.com",
            password_hash="hash",
            nombre_completo="Abogado Externo",
            whatsapp_numero="3000000003",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        pending_lawyer = models.Usuario(
            email="pending@example.com",
            password_hash="hash",
            nombre_completo="Abogado Pendiente",
            whatsapp_numero="3000000004",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.PENDIENTE_APROBACION,
        )
        db.add_all([admin, lawyer, client, saas_lawyer, pending_lawyer])
        db.flush()
        db.add(models.SolicitudRegistro(
            usuario_id=pending_lawyer.id,
            ruta_tarjeta_profesional="tarjetas/pending.pdf",
        ))

        process = models.Proceso(abogado_id=lawyer.id, nombre="Caso con vencimiento")
        quiet_process = models.Proceso(abogado_id=lawyer.id, nombre="Caso sin actividad")
        saas_process = models.Proceso(abogado_id=saas_lawyer.id, nombre="Caso SaaS")
        db.add_all([process, quiet_process, saas_process])
        db.flush()
        db.add_all([
            models.Proceso(abogado_id=lawyer.id, nombre=f"Caso adicional {index}")
            for index in range(205)
        ])
        db.flush()
        db.add(models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id))
        task = models.Tarea(
            usuario_id=lawyer.id,
            proceso_id=process.id,
            titulo="Entregar respuesta",
            estado=models.EstadoTarea.PENDIENTE,
            prioridad=models.PrioridadTarea.ALTA,
            fecha_limite=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1),
        )
        db.add(task)
        db.add(models.SolicitudDocumento(
            proceso_id=process.id,
            cliente_id=client.id,
            titulo="Certificado pendiente",
        ))
        db.add(models.EventoAuditoria(
            actor_id=lawyer.id,
            accion="proceso.actualizar",
            tipo_recurso="proceso",
            recurso_id=str(process.id),
        ))
        db.add(models.EntregaNotificacion(
            clave_idempotencia="dashboard-critical-delivery",
            usuario_id=client.id,
            tipo="TAREA",
            canal="EMAIL",
            asunto="Recordatorio",
            cuerpo="Contenido",
            estado="ERROR",
            intentos=3,
        ))
        db.commit()

        dashboard = obtener_dashboard_admin(db=db, admin=admin)

        assert dashboard["resumen"]["usuarios_activos"] == 3
        assert dashboard["resumen"]["usuarios_pendientes_aprobacion"] == 1
        assert dashboard["resumen"]["solicitudes_pendientes"] == 1
        assert dashboard["resumen"]["procesos_activos"] == 208
        assert dashboard["resumen"]["tareas_pendientes"] == 1
        assert dashboard["resumen"]["documentos_pendientes"] == 1
        assert dashboard["resumen"]["alertas"] == 4
        assert dashboard["resumen"]["errores_operativos"] == 1
        notification_alert = next(item for item in dashboard["atencion"] if item["key"] == "notificaciones")
        assert notification_alert["count"] == 1
        assert dashboard["firma"]["procesos"] == 207
        assert dashboard["saas"]["procesos"] == 1
        assert len(dashboard["procesos_criticos"]) == dashboard["firma"]["procesos"]

        critical = next(row for row in dashboard["procesos_criticos"] if row["id"] == process.id)
        assert critical["cliente"] == "Cliente Uno"
        assert critical["riesgo"] == "Tarea vencida"
        assert critical["proxima_accion"] == "Entregar respuesta"
        quiet = next(row for row in dashboard["procesos_criticos"] if row["id"] == quiet_process.id)
        assert quiet["sin_actividad"] is True

        event = dashboard["actividad"][0]
        assert event["actor"] == "Abogada Firma"
        assert event["descripcion"] == "actualizó un proceso"
        assert event["href"] == "/gestion-procesos/admin/procesos"
    finally:
        db.close()
        engine.dispose()
