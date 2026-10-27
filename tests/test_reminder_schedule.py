from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers.workflows import preparar_recordatorio_workflow
from app.timezone import utc_ahora


def test_reminder_prepared_before_due_time_reports_its_schedule():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        lawyer = models.Usuario(
            email="early-reminder@example.test",
            password_hash="hash",
            nombre_completo="Early reminder",
            whatsapp_numero="",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(lawyer)
        db.flush()
        task = models.Tarea(usuario_id=lawyer.id, titulo="Future task")
        db.add(task)
        db.flush()
        due = (utc_ahora() + timedelta(days=1)).replace(microsecond=0)
        reminder = models.RecordatorioTarea(tarea_id=task.id, fecha_hora=due, activo=True, notificar_email=True)
        db.add(reminder)
        db.commit()

        result = preparar_recordatorio_workflow(
            reminder.id,
            schemas.WorkflowRecordatorioPreparar(version=reminder.version),
            _=None,
            db=db,
        )

    assert result["estado"] == "TODAVIA_NO_VENCE"
    assert result["programado_para"] == due.isoformat() + "+00:00"
