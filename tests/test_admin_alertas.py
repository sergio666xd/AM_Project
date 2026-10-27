from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.routers.admin.alertas import (
    actualizar_estado_alerta_admin,
    listar_alertas_admin,
)
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

        alerts = listar_alertas_admin(db, admin)
        task_alert = next(alert for alert in alerts if alert["id"] == f"tarea_vencida:{task.id}")
        event_alert = next(alert for alert in alerts if alert["id"].startswith("evento:"))
        assert task_alert["estado"] == "ACTIVA"
        assert task_alert["href"] == "/gestion-procesos/admin/tareas"
        assert "Presentar recurso" in task_alert["descripcion"]
        assert event_alert["descartable"] is True
        assert all("error técnico" not in alert["descripcion"].lower() for alert in alerts)

        actualizar_estado_alerta_admin(task_alert["id"], {"estado": "ATENDIDA"}, db, admin)
        alerts = listar_alertas_admin(db, admin)
        assert next(alert for alert in alerts if alert["id"] == task_alert["id"])["estado"] == "ATENDIDA"

        with pytest.raises(HTTPException) as error:
            actualizar_estado_alerta_admin(task_alert["id"], {"estado": "DESCARTADA"}, db, admin)
        assert error.value.status_code == 400

        actualizar_estado_alerta_admin(event_alert["id"], {"estado": "DESCARTADA"}, db, admin)
        alerts = listar_alertas_admin(db, admin)
        assert next(alert for alert in alerts if alert["id"] == event_alert["id"])["estado"] == "DESCARTADA"
    finally:
        db.close()
        engine.dispose()
