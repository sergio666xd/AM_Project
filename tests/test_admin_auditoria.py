from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.timezone import utc_ahora
from app import models
from app.audit import (
    establecer_contexto_solicitud_auditoria,
    limpiar_contexto_solicitud_auditoria,
    registrar_evento_auditoria,
)
from app.routers.admin import listar_eventos_auditoria


def test_admin_audit_has_human_summary_technical_detail_and_filters():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = models.Usuario(
            email="audit-admin@example.com", password_hash="hash", nombre_completo="Admin Principal",
            whatsapp_numero="3000000077", rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        lawyer = models.Usuario(
            email="audit-lawyer@example.com", password_hash="hash", nombre_completo="Sergio Pérez",
            whatsapp_numero="3000000078", rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, lawyer])
        db.flush()
        now = utc_ahora()
        db.add_all([
            models.EventoAuditoria(
                actor_id=lawyer.id, accion="proceso.crear", tipo_recurso="proceso",
                recurso_id="41", created_at=now,
            ),
            models.EventoAuditoria(
                actor_id=admin.id, accion="admin.alerta.atender", tipo_recurso="alerta",
                recurso_id="tarea_vencida:2", created_at=now - timedelta(days=3),
            ),
        ])
        context_token = establecer_contexto_solicitud_auditoria("PATCH", "/api/tareas/9")
        try:
            registrar_evento_auditoria(
                db, admin, "tarea.actualizar", "tarea", 9,
                metadata={"campo": "estado"}, error_tecnico="Fallo de persistencia",
            )
        finally:
            limpiar_contexto_solicitud_auditoria(context_token)
        db.commit()

        all_events = listar_eventos_auditoria(db=db, admin=admin)
        created = next(event for event in all_events if event["accion"] == "proceso.crear")
        assert created["actor"] == "Sergio Pérez"
        assert created["descripcion"] == "Sergio Pérez creó un proceso."
        assert created["resultado"] == "REGISTRADO"
        assert created["detalle_tecnico"]["recurso"] == "proceso"
        assert created["detalle_tecnico"]["id"] == "41"
        assert created["detalle_tecnico"]["endpoint"] is None
        assert created["detalle_tecnico"]["metodo"] is None

        technical_event = next(event for event in all_events if event["accion"] == "tarea.actualizar")
        assert technical_event["detalle_tecnico"] == {
            "endpoint": "/api/tareas/9",
            "metodo": "PATCH",
            "recurso": "tarea",
            "id": "9",
            "metadata": {"campo": "estado"},
            "error": "Fallo de persistencia",
        }
        assert technical_event["resultado"] == "ERROR"

        filtered = listar_eventos_auditoria(
            db=db, admin=admin, usuario="Sergio", accion="proceso.crear", modulo="Procesos",
            fecha_desde=now.date(), fecha_hasta=now.date(), resultado="REGISTRADO",
        )
        assert [event["id"] for event in filtered] == [created["id"]]
        assert len(listar_eventos_auditoria(db=db, admin=admin, resultado="ERROR")) == 1
    finally:
        db.close()
        engine.dispose()
