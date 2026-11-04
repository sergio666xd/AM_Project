from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.modulos.avisos.fuentes import alertas_admin
from app.timezone import utc_ahora


def test_admin_alerts_are_real_actionable_and_keep_dispositions():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = models.Usuario(
            email="alerts-admin@example.com", password_hash="hash", nombre_completo="Admin",
            whatsapp_numero="3000000099", rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        lawyer = models.Usuario(
            email="alerts-lawyer@example.com", password_hash="hash", nombre_completo="Abogada",
            whatsapp_numero="3000000088", rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, lawyer])
        db.flush()
        process = models.Proceso(abogado_id=lawyer.id, nombre="Proceso alerta")
        db.add(process)
        db.flush()
        task = models.Tarea(
            usuario_id=lawyer.id, proceso_id=process.id, titulo="Presentar recurso",
            estado=models.EstadoTarea.PENDIENTE,
            fecha_limite=utc_ahora() - timedelta(days=1),
        )
        db.add(task)
        db.add(models.EventoAuditoria(
            actor_id=lawyer.id, accion="proceso.crear", tipo_recurso="proceso", recurso_id=str(process.id),
        ))
        db.commit()

        alerts = alertas_admin(db)
        task_alert = next(alert for alert in alerts if alert["id"] == f"tarea_vencida:{task.id}")
        event_alert = next(alert for alert in alerts if alert["id"].startswith("evento:"))
        assert task_alert["estado"] == "ACTIVA"
        assert task_alert["href"] == "/gestion-procesos/admin/tareas"
        assert "Presentar recurso" in task_alert["descripcion"]
        assert event_alert["descartable"] is True
        assert all("error técnico" not in alert["descripcion"].lower() for alert in alerts)

    finally:
        db.close()
        engine.dispose()


def test_admin_alerts_only_report_the_latest_failed_query_per_radicado():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = models.Usuario(
            email="query-admin@example.com", password_hash="hash", nombre_completo="Admin",
            whatsapp_numero="3000000077", rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(admin)
        db.flush()
        fallando = models.Radicado(numero="05318408900120240034500", numero_normalizado="05318408900120240034500", creado_por_id=admin.id, ambito_key="a")
        recuperado = models.Radicado(numero="05266311000120260044500", numero_normalizado="05266311000120260044500", creado_por_id=admin.id, ambito_key="b")
        db.add_all([fallando, recuperado])
        db.flush()
        ahora = utc_ahora()
        db.add_all([
            models.ConsultaRadicado(radicado_id=fallando.id, estado="ERROR", inicio=ahora - timedelta(days=2)),
            models.ConsultaRadicado(radicado_id=fallando.id, estado="ERROR", inicio=ahora - timedelta(days=1)),
            models.ConsultaRadicado(radicado_id=recuperado.id, estado="ERROR", inicio=ahora - timedelta(days=2)),
            models.ConsultaRadicado(radicado_id=recuperado.id, estado="COMPLETADA", inicio=ahora - timedelta(days=1)),
        ])
        db.commit()

        consultas = [alert for alert in alertas_admin(db) if alert["id"].startswith("consulta:")]
        assert len(consultas) == 1
        assert fallando.numero in consultas[0]["descripcion"]
    finally:
        db.close()
        engine.dispose()
