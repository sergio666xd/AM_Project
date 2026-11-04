import importlib
import zipfile
from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from fastapi import HTTPException
from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    delete,
    insert,
    inspect,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app import (
    models,
    monthly_summary,
    rama_judicial_api,
    reminder_workflow,
    security,
    whatsapp,
)
from app.audit import registrar_evento_auditoria
from app.document_validation import (
    document_content_matches_type as _document_content_matches_type,
)
from app.firm_access import (
    lawyer_scope_id,
    require_process_access,
)
from app.migrate_radicados_canonicos import migrar as migrar_radicados_canonicos
from app.migrate_radicados_canonicos import (
    previsualizar as previsualizar_migracion_radicados,
)
from app.notification_policy import (
    abogados_notificables_para_radicado,
    canales_habilitados,
    whatsapp_habilitado,
)
from app.radicados import (
    iniciar_consulta_nuevo_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
)
from app.api.internos.workflows import (
    DETALLE_RECONCILIACION_COMPLETA,
    _aplicar_delta_contadores_barrido,
    _reconciliacion_completa_vencida,
    ejecutar_consulta_barrido_radicado,
    enviar_entrega_notificacion_workflow,
    finalizar_barrido,
    listar_radicados_barrido,
    preparar_notificaciones_actuaciones,
    preparar_recordatorio_workflow,
    reclamar_barrido,
    verificar_token_workflow,
)
from app.api.internos import esquemas as schemas
from app.nucleo.errores import SinPermiso
from app.timezone import utc_ahora
from app.workflow_service import (
    workflow_401_reason,
    workflow_frontend_url,
    workflow_service_headers,
)


def test_database_engine_does_not_retain_connections_on_vercel(monkeypatch):
    from sqlalchemy.pool import NullPool

    from app.database import _crear_engine

    monkeypatch.setenv("VERCEL", "1")
    serverless_engine = _crear_engine("sqlite://")
    assert isinstance(serverless_engine.pool, NullPool)
    serverless_engine.dispose()

    monkeypatch.delenv("VERCEL")
    local_engine = _crear_engine("sqlite://")
    assert not isinstance(local_engine.pool, NullPool)
    local_engine.dispose()


def test_database_url_uses_declared_psycopg_driver():
    from app.database import _normalizar_url

    assert _normalizar_url("postgresql://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    assert _normalizar_url("postgres://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    assert _normalizar_url("postgresql+psycopg://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    assert _normalizar_url("sqlite://") == "sqlite://"


def test_workflow_sweep_claim_is_idempotent_and_prevents_parallel_runs():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="sweep-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000002",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        admin = models.Usuario(
            email="sweep-manual-admin@example.test",
            password_hash="hash",
            nombre_completo="Admin",
            whatsapp_numero="0000000006",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        associate = models.Usuario(
            email="sweep-associate@example.test",
            password_hash="hash",
            nombre_completo="Associate",
            whatsapp_numero="0000000007",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([owner, admin, associate])
        db.flush()
        db.add(
            models.Radicado(
                numero="12345678901234567890123",
                creado_por_id=owner.id,
            )
        )
        db.add(
            models.Radicado(
                numero="12345678901234567890124",
                creado_por_id=associate.id,
            )
        )
        db.add(
            models.ConfiguracionConsultas(
                id=1,
                activa=True,
                dias_habilitados=[0, 1, 2, 3, 4],
            )
        )
        db.commit()

        automatic_claim = schemas.WorkflowClaimConsulta(
            clave_idempotencia="AUTO:2026-10-05:12:00",
            token_lanzamiento="launch-token-1",
            tipo="AUTOMATICA",
            fecha_local="2026-10-05",
            hora_local="12:00",
        )
        first = reclamar_barrido(automatic_claim, _=None, db=db)
        retry = reclamar_barrido(automatic_claim, _=None, db=db)
        parallel_manual = reclamar_barrido(
            schemas.WorkflowClaimConsulta(
                clave_idempotencia="MANUAL:run-2",
                token_lanzamiento="launch-token-2",
                tipo="MANUAL",
                fecha_local="2026-10-05",
                hora_local="MANUAL",
                solicitada_por_id=admin.id,
            ),
            _=None,
            db=db,
        )

        assert first["debe_ejecutar"] is True
        assert first["ejecucion"]["total_radicados"] == 2
        assert retry["debe_ejecutar"] is True
        assert retry["ejecucion"]["id"] == first["ejecucion"]["id"]
        assert parallel_manual["debe_ejecutar"] is False
        assert parallel_manual["motivo"] == "YA_HAY_UN_BARRIDO_ACTIVO"
        assert db.query(models.EjecucionBarrido).count() == 1


def test_workflow_service_requires_configured_constant_time_token(monkeypatch):
    monkeypatch.delenv("WORKFLOW_SERVICE_TOKEN", raising=False)
    with pytest.raises(HTTPException) as disabled:
        verificar_token_workflow("Bearer any-token")
    assert disabled.value.status_code == 503

    monkeypatch.setenv("WORKFLOW_SERVICE_TOKEN", "unit-test-workflow-secret")
    with pytest.raises(HTTPException) as invalid:
        verificar_token_workflow("Bearer wrong-token")
    assert invalid.value.status_code == 401

    assert verificar_token_workflow("Bearer unit-test-workflow-secret") is None


def test_automatic_workflow_claim_obeys_enabled_days():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add(models.ConfiguracionConsultas(id=1, activa=True, dias_habilitados=[0, 1, 2, 3, 4]))
        db.commit()
        claim = schemas.WorkflowClaimConsulta(
            clave_idempotencia="AUTO:2026-10-04:12:00",
            token_lanzamiento="launch-token-sunday",
            tipo="AUTOMATICA",
            fecha_local="2026-10-04",
            hora_local="12:00",
        )

        result = reclamar_barrido(claim, _=None, db=db)

        assert result["debe_ejecutar"] is False
        assert result["motivo"] == "DIA_DESHABILITADO"
        assert db.query(models.EjecucionBarrido).count() == 0


def test_new_radicado_workflow_claim_processes_only_the_selected_case(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="workflow-new-case-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000150",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado, _ = obtener_o_vincular_radicado(
            db,
            owner,
            "12345678901234567890123",
        )
        db.commit()
        mensaje, consulta_id = iniciar_consulta_nuevo_radicado(db, owner, radicado)
        monkeypatch.setattr(
            "app.api.internos.workflows.ejecutar_consulta_api_radicado",
            lambda db, radicado, reconciliar_historial=False: {
                "estado": "ok",
                "actuaciones_nuevas": [],
                "reconciliacion_completa": reconciliar_historial,
            },
        )

        claim = reclamar_barrido(
            schemas.WorkflowClaimConsulta(
                clave_idempotencia=f"NUEVO:{consulta_id}",
                token_lanzamiento="new-case-launch",
                tipo="AUTOMATICA_NUEVO",
                fecha_local="2026-10-01",
                hora_local="NUEVO",
                solicitada_por_id=owner.id,
                radicado_id=radicado.id,
                consulta_id=consulta_id,
            ),
            _=None,
            db=db,
        )
        execution_id = claim["ejecucion"]["id"]
        page = listar_radicados_barrido(execution_id, limite=50, _=None, db=db)
        result = ejecutar_consulta_barrido_radicado(
            execution_id,
            radicado.id,
            _=None,
            db=db,
        )
        finished = finalizar_barrido(execution_id, _=None, db=db)

        assert "Workflow" in mensaje
        assert claim["debe_ejecutar"] is True
        assert [item["id"] for item in page["radicados"]] == [radicado.id]
        assert result["estado"] == "COMPLETADA"
        assert finished["estado"] == "COMPLETADA"
        assert db.query(models.ConsultaRadicado).filter_by(id=consulta_id).one().tipo == "AUTOMATICA_NUEVO"


def test_admin_manual_workflow_claim_supports_one_selected_batch():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        admin = models.Usuario(
            email="workflow-manual-admin@example.test",
            password_hash="hash",
            nombre_completo="Admin",
            whatsapp_numero="0000000151",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        owner = models.Usuario(
            email="workflow-manual-owner@example.test",
            password_hash="hash",
            nombre_completo="SaaS owner",
            whatsapp_numero="0000000152",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, owner])
        db.flush()
        first, _ = obtener_o_vincular_radicado(db, admin, "12345678901234567890123")
        second, _ = obtener_o_vincular_radicado(db, owner, "12345678901234567890124")
        db.commit()

        claim = reclamar_barrido(
            schemas.WorkflowClaimConsulta(
                clave_idempotencia="MANUAL_RADICADO:batch-launch",
                token_lanzamiento="batch-launch-token",
                tipo="MANUAL",
                fecha_local="2026-10-01",
                hora_local="MANUAL",
                solicitada_por_id=admin.id,
                radicado_ids=[first.id, second.id],
            ),
            _=None,
            db=db,
        )
        page = listar_radicados_barrido(
            claim["ejecucion"]["id"],
            limite=50,
            _=None,
            db=db,
        )

        assert claim["debe_ejecutar"] is True
        assert claim["ejecucion"]["total_radicados"] == 2
        assert {item["id"] for item in page["radicados"]} == {first.id, second.id}
        assert db.query(models.ConsultaRadicado).filter(
            models.ConsultaRadicado.radicado_id.in_([first.id, second.id])
        ).count() == 2


def test_workflow_radicado_step_persists_result_and_retries_without_duplicate_api_call(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    api_calls = []

    def fake_consulta(db, radicado, reconciliar_historial=False):
        api_calls.append(radicado.id)
        if len(api_calls) == 1:
            return {"estado": "error_api: falla transitoria"}
        return {
            "estado": "ok",
            "actuaciones_nuevas": [{"actuacion": "Nueva"}],
            "reconciliacion_completa": reconciliar_historial,
        }

    monkeypatch.setattr(
        "app.api.internos.workflows.ejecutar_consulta_api_radicado",
        fake_consulta,
    )

    with Session(engine) as db:
        owner = models.Usuario(
            email="sweep-step-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000003",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        admin = models.Usuario(
            email="sweep-detail-admin@example.test",
            password_hash="hash",
            nombre_completo="Admin",
            whatsapp_numero="0000000004",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(admin)
        db.flush()
        radicado = models.Radicado(
            numero="12345678901234567890123",
            creado_por_id=owner.id,
        )
        db.add(radicado)
        ejecucion = models.EjecucionBarrido(
            id="run-step-1",
            clave_idempotencia="MANUAL:run-step-1",
            token_lanzamiento="launch-step-1",
            tipo="MANUAL",
            estado="EN_PROCESO",
            inicio=utc_ahora(),
            total_radicados=1,
        )
        db.add(ejecucion)
        db.commit()

        failed_attempt = ejecutar_consulta_barrido_radicado(
            ejecucion.id, radicado.id, _=None, db=db
        )
        consulta_id = db.query(models.ConsultaRadicado).filter_by(
            radicado_id=radicado.id
        ).one().id
        recovered = ejecutar_consulta_barrido_radicado(
            ejecucion.id, radicado.id, _=None, db=db
        )
        repeated = ejecutar_consulta_barrido_radicado(
            ejecucion.id, radicado.id, _=None, db=db
        )

        assert failed_attempt["estado"] == "ERROR"
        assert recovered["estado"] == "COMPLETADA"
        assert recovered["actuaciones_nuevas"] == 1
        assert repeated["repetida"] is True
        assert api_calls == [radicado.id, radicado.id]
        consulta = db.query(models.ConsultaRadicado).filter_by(radicado_id=radicado.id).one()
        assert consulta.id == consulta_id
        assert consulta.detalle == DETALLE_RECONCILIACION_COMPLETA
        db.refresh(ejecucion)
        assert ejecucion.procesados == 1
        assert ejecucion.errores == 0
        assert ejecucion.actuaciones_nuevas == 1


def test_sweep_counters_apply_deltas_after_stale_parallel_reads(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sweep-counters.db'}")
    models.Base.metadata.create_all(engine)
    first_session = Session(engine)
    second_session = Session(engine)
    try:
        execution = models.EjecucionBarrido(
            id="run-parallel-counters",
            clave_idempotencia="MANUAL:parallel-counters",
            token_lanzamiento="launch-parallel-counters",
            tipo="MANUAL",
            inicio=utc_ahora(),
            total_radicados=2,
        )
        first_session.add(execution)
        first_session.commit()

        first_snapshot = first_session.query(models.EjecucionBarrido).filter_by(
            id=execution.id
        ).one()
        second_snapshot = second_session.query(models.EjecucionBarrido).filter_by(
            id=execution.id
        ).one()
        assert first_snapshot.procesados == second_snapshot.procesados == 0

        _aplicar_delta_contadores_barrido(
            first_session,
            execution.id,
            procesados_delta=1,
            errores_delta=0,
            actuaciones_delta=0,
            lease_hasta=utc_ahora(),
        )
        first_session.commit()
        _aplicar_delta_contadores_barrido(
            second_session,
            execution.id,
            procesados_delta=1,
            errores_delta=0,
            actuaciones_delta=0,
            lease_hasta=utc_ahora(),
        )
        second_session.commit()

        first_session.refresh(first_snapshot)
        assert first_snapshot.procesados == 2
        assert first_snapshot.errores == 0
    finally:
        first_session.close()
        second_session.close()


def test_canonical_radicado_is_shared_across_the_whole_firm():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        firm_owner = models.Usuario(
            email="canonical-firm-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000111",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        firm_colleague = models.Usuario(
            email="canonical-firm-colleague@example.test",
            password_hash="hash",
            nombre_completo="Firm colleague",
            whatsapp_numero="0000000112",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        associate = models.Usuario(
            email="canonical-associate@example.test",
            password_hash="hash",
            nombre_completo="Associate",
            whatsapp_numero="0000000113",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([firm_owner, firm_colleague, associate])
        db.flush()

        number = "12345678901234567890123"
        firm_radicado = models.Radicado(numero=number, usuario_id=firm_owner.id)
        associate_radicado = models.Radicado(numero="12345678901234567890124", usuario_id=associate.id)
        db.add_all([firm_radicado, associate_radicado])
        db.flush()

        firm_radicado.usuarios_vinculados.append(firm_colleague)
        db.flush()

        assert firm_radicado.ambito_key == "FIRMA"
        assert associate_radicado.ambito_key == "FIRMA"
        assert firm_radicado.numero_normalizado == number
        assert {user.id for user in firm_radicado.usuarios_vinculados} == {
            firm_owner.id,
            firm_colleague.id,
        }

        db.add(models.Radicado(numero=number, usuario_id=associate.id))
        with pytest.raises(IntegrityError):
            db.flush()


def test_obtener_o_vincular_radicado_reuses_the_firm_radicado():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        firm_owner = models.Usuario(
            email="linked-firm-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000121",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        firm_colleague = models.Usuario(
            email="linked-firm-colleague@example.test",
            password_hash="hash",
            nombre_completo="Firm colleague",
            whatsapp_numero="0000000122",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        associate = models.Usuario(
            email="linked-associate@example.test",
            password_hash="hash",
            nombre_completo="Associate",
            whatsapp_numero="0000000123",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([firm_owner, firm_colleague, associate])
        db.flush()

        number = "12345678901234567890123"
        assert not radicado_vinculado_a_usuario(db, firm_owner, number)
        firm_radicado, created = obtener_o_vincular_radicado(db, firm_owner, number)
        assert radicado_vinculado_a_usuario(db, firm_owner, number)
        same_firm_radicado, created_again = obtener_o_vincular_radicado(
            db, firm_colleague, number
        )
        associate_radicado, created_by_associate = obtener_o_vincular_radicado(db, associate, number)
        db.commit()

        assert created is True
        assert created_again is False
        assert created_by_associate is False
        assert same_firm_radicado.id == firm_radicado.id == associate_radicado.id
        assert {user.id for user in firm_radicado.usuarios_vinculados} == {
            firm_owner.id,
            firm_colleague.id,
            associate.id,
        }


def test_new_radicado_records_automatic_new_consultation_for_workflow():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="new-radicado-consult-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000144",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado, created = obtener_o_vincular_radicado(
            db,
            owner,
            "12345678901234567890123",
        )
        db.commit()

        message, consulta_id = iniciar_consulta_nuevo_radicado(db, owner, radicado)
        consulta = db.query(models.ConsultaRadicado).filter_by(
            radicado_id=radicado.id
        ).one()

        assert created is True
        assert "Workflow" in message
        assert consulta_id == consulta.id
        assert consulta.tipo == "AUTOMATICA_NUEVO"
        assert consulta.estado == "ENCOLADA"
        assert consulta.task_id is None


def test_actuation_notification_recipients_are_the_active_firm_lawyers_linked_to_it():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        firm_owner = models.Usuario(
            email="notification-firm-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000140",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        firm_colleague = models.Usuario(
            email="notification-firm-colleague@example.test",
            password_hash="hash",
            nombre_completo="Firm colleague",
            whatsapp_numero="0000000141",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
            notificaciones_whatsapp=True,
        )
        firm_inactive = models.Usuario(
            email="notification-firm-inactive@example.test",
            password_hash="hash",
            nombre_completo="Inactive lawyer",
            whatsapp_numero="0000000142",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.SUSPENDIDO,
        )
        associate = models.Usuario(
            email="notification-associate@example.test",
            password_hash="hash",
            nombre_completo="Associate",
            whatsapp_numero="0000000143",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([firm_owner, firm_colleague, firm_inactive, associate])
        db.flush()

        firm_radicado = models.Radicado(numero="12345678901234567890123", usuario_id=firm_owner.id)
        firm_radicado.usuarios_vinculados.extend([firm_colleague, firm_inactive])
        associate_radicado = models.Radicado(numero="12345678901234567890124", usuario_id=associate.id)
        associate_radicado.usuarios_vinculados.append(firm_colleague)
        db.add_all([firm_radicado, associate_radicado])
        db.commit()

        firm_recipients = abogados_notificables_para_radicado(firm_radicado)
        associate_recipients = abogados_notificables_para_radicado(associate_radicado)

        assert {user.id for user in firm_recipients} == {firm_owner.id, firm_colleague.id}
        assert {user.id for user in associate_recipients} == {associate.id, firm_colleague.id}
        assert not whatsapp_habilitado(firm_owner)
        assert whatsapp_habilitado(firm_colleague)


def test_workflow_actuation_notifications_consolidate_by_user_channel_and_scope():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        lawyer = models.Usuario(
            email="actuation-lawyer@example.test",
            password_hash="hash",
            nombre_completo="Firm lawyer",
            whatsapp_numero="0000000153",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
            notificaciones_email=True,
            notificaciones_whatsapp=True,
            preferencias_notificacion={
                "ACTUACIONES": {"email": True, "whatsapp": False},
            },
        )
        client = models.Usuario(
            email="actuation-client@example.test",
            password_hash="hash",
            nombre_completo="Assigned client",
            whatsapp_numero="0000000154",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            canal_notificacion_cliente="WHATSAPP",
            notificaciones_email=False,
            notificaciones_whatsapp=True,
        )
        unassigned_client = models.Usuario(
            email="actuation-unassigned@example.test",
            password_hash="hash",
            nombre_completo="Unassigned client",
            whatsapp_numero="0000000155",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            canal_notificacion_cliente="EMAIL",
        )
        db.add_all([lawyer, client, unassigned_client])
        db.flush()
        radicado, _ = obtener_o_vincular_radicado(
            db,
            lawyer,
            "12345678901234567890123",
        )
        proceso = models.Proceso(abogado_id=lawyer.id, nombre="Proceso asignado")
        db.add(proceso)
        db.flush()
        db.add_all([
            models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id),
            models.ProcesoCliente(proceso_id=proceso.id, cliente_id=client.id),
        ])
        actuacion = models.Actuacion(
            radicado_id=radicado.id,
            orden=1,
            fecha_actuacion="02/10/2026",
            actuacion="Auto interlocutorio",
            anotacion="Notificación de prueba",
            fecha_inicia_termino="",
            fecha_finaliza_termino="",
            fecha_registro="02/10/2026",
            es_fijacion=False,
        )
        ejecucion = models.EjecucionBarrido(
            id="run-notification-aggregation",
            clave_idempotencia="AUTO:notification-aggregation",
            token_lanzamiento="notification-aggregation-token",
            tipo="AUTOMATICA",
            estado="EN_PROCESO",
            inicio=utc_ahora(),
            total_radicados=1,
        )
        db.add_all([
            actuacion,
            ejecucion,
            models.EjecucionRadicado(
                ejecucion_id=ejecucion.id,
                radicado_id=radicado.id,
                estado="COMPLETADA",
                actuaciones_nuevas=1,
            ),
        ])
        db.commit()

        payload = schemas.WorkflowNovedadesPreparar(
            eventos=[
                schemas.WorkflowEventoActuaciones(
                    radicado_id=radicado.id,
                    actuaciones_nuevas=[schemas.WorkflowActuacionNueva(
                        orden=1,
                        fecha_actuacion=actuacion.fecha_actuacion,
                        actuacion=actuacion.actuacion,
                        anotacion=actuacion.anotacion,
                        fecha_inicia_termino=actuacion.fecha_inicia_termino,
                        fecha_finaliza_termino=actuacion.fecha_finaliza_termino,
                        fecha_registro=actuacion.fecha_registro,
                        es_fijacion=False,
                    )],
                )
            ]
        )
        result = preparar_notificaciones_actuaciones(
            ejecucion.id,
            payload,
            _=None,
            db=db,
        )
        deliveries = db.query(models.EntregaNotificacion).order_by(
            models.EntregaNotificacion.usuario_id.asc()
        ).all()

        assert len(result["entrega_ids"]) == 2
        assert {(item.usuario_id, item.canal) for item in deliveries} == {
            (lawyer.id, "EMAIL"),
            (client.id, "WHATSAPP"),
        }
        assert all("Proceso asignado" in item.cuerpo for item in deliveries)
        assert db.query(models.EntregaNotificacionActuacion).count() == 2

        repeated = preparar_notificaciones_actuaciones(
            ejecucion.id,
            payload,
            _=None,
            db=db,
        )
        assert set(repeated["entrega_ids"]) == set(result["entrega_ids"])
        assert db.query(models.EntregaNotificacion).count() == 2
        assert db.query(models.EntregaNotificacionActuacion).count() == 2


def test_notification_delivery_retry_is_idempotent(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        recipient = models.Usuario(
            email="delivery-retry@example.test",
            password_hash="hash",
            nombre_completo="Delivery recipient",
            whatsapp_numero="0000000156",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(recipient)
        db.flush()
        delivery = models.EntregaNotificacion(
            clave_idempotencia="ACTUACIONES:retry:1:EMAIL",
            usuario_id=recipient.id,
            tipo="ACTUACIONES",
            canal="EMAIL",
            asunto="Novedades judiciales",
            cuerpo="Una novedad",
            estado="PENDIENTE",
        )
        db.add(delivery)
        db.commit()
        delivery_id = delivery.id

    sends = []
    monkeypatch.setattr(
        "app.api.internos.workflows.enviar_correo",
        lambda email, subject, body, **_: sends.append(email) or len(sends) > 1,
    )
    with Session(engine) as db:
        with pytest.raises(HTTPException) as failed:
            enviar_entrega_notificacion_workflow(delivery_id, _=None, db=db)
        assert failed.value.status_code == 503
        assert db.query(models.EntregaNotificacion).filter_by(id=delivery_id).one().intentos == 1

        sent = enviar_entrega_notificacion_workflow(delivery_id, _=None, db=db)
        duplicate = enviar_entrega_notificacion_workflow(delivery_id, _=None, db=db)

        assert sent["estado"] == "ENVIADA"
        assert duplicate["repetida"] is True
        assert sends == ["delivery-retry@example.test", "delivery-retry@example.test"]
        assert db.query(models.EntregaNotificacion).filter_by(id=delivery_id).one().intentos == 2


def test_deleted_reminder_delivery_is_omitted_after_foreign_key_is_cleared(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        recipient = models.Usuario(
            email="deleted-reminder@example.test",
            password_hash="hash",
            nombre_completo="Reminder recipient",
            whatsapp_numero="",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
            notificaciones_email=True,
        )
        db.add(recipient)
        db.flush()
        delivery = models.EntregaNotificacion(
            clave_idempotencia="RECORDATORIOS:deleted-generation",
            usuario_id=recipient.id,
            tipo="RECORDATORIOS",
            canal="EMAIL",
            recordatorio_version=3,
            asunto="Recordatorio",
            cuerpo="No debe enviarse",
            estado="PENDIENTE",
        )
        db.add(delivery)
        db.commit()
        delivery_id = delivery.id

    monkeypatch.setattr(
        "app.api.internos.workflows.enviar_correo",
        lambda *args, **_: pytest.fail("A deleted reminder must not be delivered."),
    )
    with Session(engine) as db:
        result = enviar_entrega_notificacion_workflow(delivery_id, _=None, db=db)
        assert result["estado"] == "OMITIDA"
        assert db.query(models.EntregaNotificacion).filter_by(id=delivery_id).one().intentos == 0


def test_canonical_radicado_migration_merges_firm_duplicates_and_preserves_references():
    engine = create_engine("sqlite:///:memory:")
    legacy_metadata = MetaData()
    users = Table(
        "usuarios",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("rol", String(30), nullable=False),
    )
    legacy_radicados = Table(
        "radicados",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("numero", String(40), nullable=False),
        Column("usuario_id", Integer, ForeignKey("usuarios.id"), nullable=False),
        Column("estado_consulta", String(50)),
        Column("despacho_departamento", String(255)),
        Column("demandante", String(255)),
        Column("demandado", String(255)),
        Column("consultado_en", String(50)),
        Column("alerta_enviada", Boolean),
        Column("detalle_pendiente", String),
        Column("created_at", String(50)),
    )
    procesos = Table(
        "procesos",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("abogado_id", Integer, ForeignKey("usuarios.id"), nullable=False),
    )
    proceso_radicados = Table(
        "procesos_radicados",
        legacy_metadata,
        Column("proceso_id", Integer, ForeignKey("procesos.id"), primary_key=True),
        Column("radicado_id", Integer, ForeignKey("radicados.id"), primary_key=True),
    )
    actuaciones = Table(
        "actuaciones",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("radicado_id", Integer, ForeignKey("radicados.id"), nullable=False),
        Column("orden", Integer, nullable=False),
        Column("fecha_actuacion", String(20)),
        Column("actuacion", String),
        Column("anotacion", String),
        Column("fecha_inicia_termino", String(20)),
        Column("fecha_finaliza_termino", String(20)),
        Column("fecha_registro", String(20)),
        Column("es_fijacion", Boolean),
    )
    consultas = Table(
        "consultas_radicados",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("radicado_id", Integer, ForeignKey("radicados.id"), nullable=False),
    )
    tareas = Table(
        "tareas",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("radicado_id", Integer, ForeignKey("radicados.id")),
        Column("actuacion_id", Integer, ForeignKey("actuaciones.id")),
    )
    subtareas = Table(
        "subtareas",
        legacy_metadata,
        Column("id", Integer, primary_key=True),
        Column("radicado_id", Integer, ForeignKey("radicados.id")),
        Column("actuacion_id", Integer, ForeignKey("actuaciones.id")),
    )
    legacy_metadata.create_all(engine)

    number = "12345678901234567890123"
    with engine.begin() as connection:
        connection.execute(
            insert(users),
            [
                {"id": 1, "rol": "ABOGADO_ADMIN"},
                {"id": 2, "rol": "ABOGADO_ADMIN"},
                {"id": 3, "rol": "ABOGADO"},
                {"id": 4, "rol": "ABOGADO"},
            ],
        )
        connection.execute(
            insert(procesos),
            [{"id": 50, "abogado_id": 1}, {"id": 51, "abogado_id": 2}],
        )
        connection.execute(
            insert(legacy_radicados),
            [
                {"id": 10, "numero": number, "usuario_id": 1, "alerta_enviada": True},
                {"id": 11, "numero": "123.456.789.012.345.678.901.23", "usuario_id": 2, "alerta_enviada": True},
                {"id": 12, "numero": number, "usuario_id": 3, "alerta_enviada": True},
                {"id": 13, "numero": number, "usuario_id": 4, "alerta_enviada": True},
            ],
        )
        connection.execute(
            insert(proceso_radicados),
            [
                {"proceso_id": 50, "radicado_id": 10},
                {"proceso_id": 50, "radicado_id": 11},
                {"proceso_id": 51, "radicado_id": 11},
            ],
        )
        connection.execute(
            insert(actuaciones),
            [
                {"id": 100, "radicado_id": 10, "orden": 1, "fecha_actuacion": "02/10/2026", "actuacion": "Publicación", "anotacion": "", "fecha_inicia_termino": "", "fecha_finaliza_termino": "", "fecha_registro": "02/10/2026", "es_fijacion": False},
                {"id": 200, "radicado_id": 11, "orden": 1, "fecha_actuacion": "02/10/2026", "actuacion": "Publicación", "anotacion": "", "fecha_inicia_termino": "", "fecha_finaliza_termino": "", "fecha_registro": "02/10/2026", "es_fijacion": False},
                {"id": 201, "radicado_id": 11, "orden": 2, "fecha_actuacion": "01/10/2026", "actuacion": "Auto", "anotacion": "", "fecha_inicia_termino": "", "fecha_finaliza_termino": "", "fecha_registro": "01/10/2026", "es_fijacion": False},
            ],
        )
        connection.execute(insert(consultas), [{"id": 300, "radicado_id": 11}])
        connection.execute(insert(tareas), [{"id": 400, "radicado_id": 11, "actuacion_id": 200}])
        connection.execute(insert(subtareas), [{"id": 500, "radicado_id": 11, "actuacion_id": 200}])

        preview = previsualizar_migracion_radicados(connection)
        assert preview["duplicate_groups"] == 1
        assert preview["rows_to_merge"] == 1
        assert preview["invalid_rows"] == 0
        assert preview["cross_scope_references"] == 0

        connection.execute(insert(procesos), [{"id": 52, "abogado_id": 3}])
        connection.execute(
            insert(proceso_radicados),
            [{"proceso_id": 52, "radicado_id": 10}],
        )
        unsafe_preview = previsualizar_migracion_radicados(connection)
        assert unsafe_preview["cross_scope_references"] == 1
        with pytest.raises(RuntimeError):
            migrar_radicados_canonicos(connection)
        assert "usuario_id" in {column["name"] for column in inspect(connection).get_columns("radicados")}

        connection.execute(
            delete(proceso_radicados).where(proceso_radicados.c.proceso_id == 52)
        )
        connection.execute(delete(procesos).where(procesos.c.id == 52))
        report = migrar_radicados_canonicos(connection)

        columns = {column["name"] for column in inspect(connection).get_columns("radicados")}
        assert "usuario_id" not in columns
        assert "creado_por_id" in columns
        migrated = Table("radicados", MetaData(), autoload_with=connection)
        cases = connection.execute(select(migrated)).mappings().all()
        assert len(cases) == 3
        firm_case = next(case for case in cases if case["ambito_key"] == "FIRMA")
        assert firm_case["id"] == 10
        assert firm_case["numero_normalizado"] == number

        links = models.radicados_usuarios
        firm_user_ids = set(
            connection.execute(
                select(links.c.usuario_id).where(links.c.radicado_id == firm_case["id"])
            ).scalars()
        )
        assert firm_user_ids == {1, 2}
        assert set(connection.execute(select(proceso_radicados)).all()) == {
            (50, 10),
            (51, 10),
        }
        assert connection.execute(select(consultas.c.radicado_id)).scalar_one() == 10
        assert connection.execute(select(tareas.c.radicado_id, tareas.c.actuacion_id)).one() == (10, 100)
        assert connection.execute(select(subtareas.c.radicado_id, subtareas.c.actuacion_id)).one() == (10, 100)
        firm_actions = connection.execute(
            select(actuaciones.c.id, actuaciones.c.orden, actuaciones.c.radicado_id)
            .where(actuaciones.c.radicado_id == 10)
            .order_by(actuaciones.c.orden)
        ).all()
        assert len(firm_actions) == 2
        assert {row.radicado_id for row in firm_actions} == {10}
        assert report["rows_to_merge"] == 1


def test_initial_rama_lookup_persists_process_id(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="rama-id-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm lawyer",
            whatsapp_numero="0000000131",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado = models.Radicado(
            numero="12345678901234567890123",
            creado_por_id=owner.id,
        )
        db.add(radicado)
        db.commit()
        radicado_id = radicado.id

        monkeypatch.setattr(
            rama_judicial_api,
            "_obtener_proceso",
            lambda numero: {
                "idProceso": 123,
                "llaveProceso": numero,
                "esPrivado": False,
                "despacho": "Juzgado de prueba",
                "departamento": "Bogota",
                "sujetosProcesales": "",
            },
        )
        monkeypatch.setattr(
            rama_judicial_api,
            "_obtener_actuaciones",
            lambda id_proceso, claves_conocidas=None: [],
        )

        result = rama_judicial_api.ejecutar_consulta_api_radicado(db, radicado)
        db.refresh(radicado)

        assert result["estado"] == "ok"
        assert radicado.id_proceso_rama == "123"
        assert db.query(models.Radicado).filter_by(id=radicado_id).one().id_proceso_rama == "123"


def test_full_rama_reconciliation_replaces_the_saved_history(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="rama-reconciliation-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm lawyer",
            whatsapp_numero="0000000133",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado = models.Radicado(
            numero="12345678901234567890123",
            creado_por_id=owner.id,
            id_proceso_rama="123",
            estado_consulta="ok",
        )
        db.add(radicado)
        db.flush()
        db.add(
            models.Actuacion(
                radicado_id=radicado.id,
                orden=1,
                fecha_actuacion="01/10/2026",
                actuacion="Texto desactualizado",
                anotacion="",
                fecha_inicia_termino="",
                fecha_finaliza_termino="",
                fecha_registro="01/10/2026",
                es_fijacion=False,
            )
        )
        db.commit()

        fetch_options = []

        def fetch_full_history(id_proceso, claves_conocidas=None):
            fetch_options.append(claves_conocidas)
            return [
                {
                    "fechaActuacion": "2026-10-01T00:00:00Z",
                    "actuacion": "Texto corregido por Rama",
                    "anotacion": "",
                    "fechaInicial": "",
                    "fechaFinal": "",
                    "fechaRegistro": "2026-10-01T00:00:00Z",
                },
                {
                    "fechaActuacion": "2026-09-01T00:00:00Z",
                    "actuacion": "Actuación antigua agregada",
                    "anotacion": "",
                    "fechaInicial": "",
                    "fechaFinal": "",
                    "fechaRegistro": "2026-09-01T00:00:00Z",
                },
            ]

        monkeypatch.setattr(rama_judicial_api, "_obtener_actuaciones", fetch_full_history)

        result = rama_judicial_api.ejecutar_consulta_api_radicado(
            db,
            radicado,
            reconciliar_historial=True,
        )

        historial = (
            db.query(models.Actuacion)
            .filter_by(radicado_id=radicado.id)
            .order_by(models.Actuacion.orden.asc())
            .all()
        )
        assert result["estado"] == "ok"
        assert result["reconciliacion_completa"] is True
        assert fetch_options == [None]
        assert [act.actuacion for act in historial] == [
            "Texto corregido por Rama",
            "Actuación antigua agregada",
        ]


def test_reconciliation_interval_expires_after_30_days():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="reconciliation-interval-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm lawyer",
            whatsapp_numero="0000000134",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado = models.Radicado(
            numero="12345678901234567890123",
            creado_por_id=owner.id,
        )
        db.add(radicado)
        db.flush()
        reconciliacion = models.ConsultaRadicado(
            radicado_id=radicado.id,
            estado="COMPLETADA",
            detalle=DETALLE_RECONCILIACION_COMPLETA,
            finalizacion=datetime(2026, 9, 1),
        )
        db.add(reconciliacion)
        db.commit()

        assert not _reconciliacion_completa_vencida(
            db,
            radicado.id,
            datetime(2026, 9, 30),
        )
        assert _reconciliacion_completa_vencida(
            db,
            radicado.id,
            datetime(2026, 10, 1),
        )


def test_known_rama_process_skips_lookup_and_merges_only_new_actions(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="rama-known-id-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm lawyer",
            whatsapp_numero="0000000132",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado = models.Radicado(
            numero="12345678901234567890123",
            creado_por_id=owner.id,
            id_proceso_rama="123",
            estado_consulta="ok",
        )
        db.add(radicado)
        db.flush()
        db.add(
            models.Actuacion(
                radicado_id=radicado.id,
                orden=1,
                fecha_actuacion="01/10/2026",
                actuacion="Existente",
                anotacion="",
                fecha_inicia_termino="",
                fecha_finaliza_termino="",
                fecha_registro="01/10/2026",
                es_fijacion=False,
            )
        )
        db.commit()

        def unexpected_number_lookup(numero):
            raise AssertionError("No debe buscarse de nuevo un proceso con idProceso guardado.")

        fetched_process_ids = []

        def fetch_actuaciones(id_proceso, claves_conocidas=None):
            fetched_process_ids.append(id_proceso)
            return [
                {
                    "fechaActuacion": "2026-10-02T00:00:00Z",
                    "actuacion": "Nueva",
                    "anotacion": "",
                    "fechaInicial": "",
                    "fechaFinal": "",
                    "fechaRegistro": "2026-10-02T00:00:00Z",
                    "es_fijacion": False,
                },
                {
                    "fechaActuacion": "2026-10-02T00:00:00Z",
                    "actuacion": "Nueva",
                    "anotacion": "",
                    "fechaInicial": "",
                    "fechaFinal": "",
                    "fechaRegistro": "2026-10-02T00:00:00Z",
                    "es_fijacion": False,
                },
                {
                    "fechaActuacion": "2026-10-01T00:00:00Z",
                    "actuacion": "Existente",
                    "anotacion": "",
                    "fechaInicial": "",
                    "fechaFinal": "",
                    "fechaRegistro": "2026-10-01T00:00:00Z",
                    "es_fijacion": False,
                },
            ]

        monkeypatch.setattr(rama_judicial_api, "_obtener_proceso", unexpected_number_lookup)
        monkeypatch.setattr(rama_judicial_api, "_obtener_actuaciones", fetch_actuaciones)

        result = rama_judicial_api.ejecutar_consulta_api_radicado(db, radicado)

        assert result["estado"] == "ok"
        assert fetched_process_ids == [123]
        assert len(result["actuaciones_nuevas"]) == 1
        assert result["actuaciones_nuevas"][0]["actuacion"] == "Nueva"
        assert [(action.orden, action.actuacion) for action in db.query(models.Actuacion).filter_by(
            radicado_id=radicado.id
        ).order_by(models.Actuacion.orden)] == [(1, "Nueva"), (2, "Existente")]

        repeated_result = rama_judicial_api.ejecutar_consulta_api_radicado(db, radicado)

        assert repeated_result["estado"] == "ok"
        assert repeated_result["actuaciones_nuevas"] == []
        assert fetched_process_ids == [123, 123]
        assert db.query(models.Actuacion).filter_by(radicado_id=radicado.id).count() == 2


def test_rama_actuation_pagination_stops_at_first_known_action(monkeypatch):
    pages = {
        1: {
            "actuaciones": [
                {"fechaActuacion": "2026-10-04T00:00:00Z", "actuacion": "Nueva 1"},
                {"fechaActuacion": "2026-10-03T00:00:00Z", "actuacion": "Nueva 2"},
            ],
            "paginacion": {"cantidadPaginas": 3},
        },
        2: {
            "actuaciones": [
                {"fechaActuacion": "2026-10-02T00:00:00Z", "actuacion": "Nueva 3"},
                {"fechaActuacion": "2026-10-01T00:00:00Z", "actuacion": "Conocida"},
                {"fechaActuacion": "2026-09-30T00:00:00Z", "actuacion": "Más antigua"},
            ],
            "paginacion": {"cantidadPaginas": 3},
        },
    }
    requested_pages = []

    def fake_get_json(ruta, parametros):
        requested_pages.append(parametros["pagina"])
        return pages[parametros["pagina"]]

    known_action = {
        "fechaActuacion": "2026-10-01T00:00:00Z",
        "actuacion": "Conocida",
    }
    known_keys = {rama_judicial_api._clave_actuacion_api(known_action)}
    monkeypatch.setattr(rama_judicial_api, "_obtener_json", fake_get_json)

    result = rama_judicial_api._obtener_actuaciones(
        123,
        claves_conocidas=known_keys,
    )

    assert requested_pages == [1, 2]
    assert [action["actuacion"] for action in result] == [
        "Nueva 1",
        "Nueva 2",
        "Nueva 3",
        "Conocida",
    ]


def test_jwt_secret_reads_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "secret_test_123")
    importlib.reload(security)
    assert security.get_jwt_secret() == "secret_test_123"


def test_password_reset_token_expires_and_is_invalidated_by_password_change(monkeypatch):
    secret = "reset_test_secret_123"
    password_hash = "bcrypt-hash-before-reset"
    monkeypatch.setenv("JWT_SECRET_KEY", secret)

    token = security.create_password_reset_token(42, password_hash)

    assert security.password_reset_token_user_id(token) == 42
    assert security.verify_password_reset_token(token, password_hash) == 42
    assert security.verify_password_reset_token(token, "bcrypt-hash-after-reset") is None
    assert security.verify_password_reset_token(
        security.create_access_token({"sub": "42"}), password_hash
    ) is None

    claims = security.jwt.decode(token, secret, algorithms=[security.ALGORITHM])
    claims["exp"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).timestamp()
    expired_token = security.jwt.encode(claims, secret, algorithm=security.ALGORITHM)
    assert security.verify_password_reset_token(expired_token, password_hash) is None


def test_single_firm_access_scopes_associates_and_allows_firm_admins():
    class User:
        def __init__(self, user_id, role):
            self.id = user_id
            self.rol = role

    admin = User(1, models.RolUsuario.ADMIN)
    managing_lawyer = User(2, models.RolUsuario.ABOGADO_ADMIN)
    associate = User(3, models.RolUsuario.ABOGADO)

    assert lawyer_scope_id(managing_lawyer) == 2
    assert lawyer_scope_id(associate) == 3
    require_process_access(admin, 99)
    require_process_access(managing_lawyer, 2)
    require_process_access(associate, 3)
    with pytest.raises(SinPermiso):
        require_process_access(associate, 99)


def test_workflow_frontend_url_uses_vercel_deployment_without_reverse_binding(monkeypatch):
    monkeypatch.delenv("WORKFLOW_FRONTEND_URL", raising=False)
    monkeypatch.delenv("NODE_ENV", raising=False)
    monkeypatch.setenv("VERCEL_URL", "project-git-test-workflows.vercel.app")
    monkeypatch.setenv("WORKFLOW_SERVICE_TOKEN", "unit-test-workflow-token")
    monkeypatch.setenv("VERCEL_AUTOMATION_BYPASS_SECRET", "unit-test-bypass-secret")

    assert workflow_frontend_url() == "https://project-git-test-workflows.vercel.app"
    headers = workflow_service_headers()
    assert headers["Authorization"] == "Bearer unit-test-workflow-token"
    assert headers["x-vercel-protection-bypass"] == "unit-test-bypass-secret"

    monkeypatch.setenv("WORKFLOW_FRONTEND_URL", "https://override.example.test/")
    assert workflow_frontend_url() == "https://override.example.test"


def test_vercel_auth_protection_json_is_classified_separately_from_token_failure():
    class ProtectedDeploymentResponse:
        headers = {"content-type": "application/json"}

        @staticmethod
        def json():
            return {
                "message": "Protected by Vercel Authentication",
                "protection": {"vercel_auth_enabled": True},
            }

    assert workflow_401_reason(ProtectedDeploymentResponse()) == "VERCEL_DEPLOYMENT_PROTECTED"


def test_whatsapp_depends_only_on_each_person_preferences():
    class User:
        estado = models.EstadoUsuario.ACTIVO
        email = ""
        notificaciones_email = False
        notificaciones_whatsapp = True
        whatsapp_numero = "573001112233"
        preferencias_notificacion = {}
        avisos_por_tipo = False

        def __init__(self, role):
            self.rol = role

    associate = User(models.RolUsuario.ABOGADO)
    client = User(models.RolUsuario.CLIENTE)

    assert whatsapp_habilitado(associate)
    assert canales_habilitados(associate, "ACTUACIONES") == ("WHATSAPP",)
    assert canales_habilitados(client, "ACTUACIONES") == ("WHATSAPP",)


def test_audit_event_contains_actor_action_and_resource_without_extra_data():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        actor = models.Usuario(
            email="admin@example.test",
            password_hash="hash",
            nombre_completo="Admin",
            whatsapp_numero="0000000000",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(actor)
        db.flush()
        registrar_evento_auditoria(db, actor, "admin.usuario.estado.ACTIVO", "usuario", 42)
        db.commit()

        event = db.query(models.EventoAuditoria).one()
        assert event.actor_id == actor.id
        assert event.accion == "admin.usuario.estado.ACTIVO"
        assert event.tipo_recurso == "usuario"
        assert event.recurso_id == "42"


def test_document_upload_type_is_checked_against_file_signature():
    docx = BytesIO()
    with zipfile.ZipFile(docx, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "<document />")

    assert _document_content_matches_type("application/pdf", b"%PDF-1.7")
    assert _document_content_matches_type("image/jpeg", b"\xff\xd8\xff\xe0")
    assert _document_content_matches_type("image/png", b"\x89PNG\r\n\x1a\n")
    assert _document_content_matches_type(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        docx.getvalue(),
    )
    assert not _document_content_matches_type("application/pdf", b"not a PDF")
    assert not _document_content_matches_type("image/png", b"%PDF-1.7")
    assert not _document_content_matches_type(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b"PK\x03\x04 but not a DOCX package",
    )


def test_due_reminders_use_workflow_delivery_and_complete_after_send(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine)
    monkeypatch.setattr(reminder_workflow, "SessionLocal", test_session)
    workflow_launches = []

    class AcceptedLaunch:
        ok = True

    monkeypatch.setattr(
        "app.reminder_workflow.requests.post",
        lambda url, **kwargs: workflow_launches.append(kwargs["json"]) or AcceptedLaunch(),
    )
    monkeypatch.setenv("WORKFLOW_FRONTEND_URL", "https://frontend.example.test")
    monkeypatch.setenv("WORKFLOW_SERVICE_TOKEN", "reminder-test-token")
    sent = []
    monkeypatch.setattr(
        "app.api.internos.workflows.enviar_mensaje_whatsapp",
        lambda numero, mensaje, **kwargs: sent.append((numero, mensaje)) or True,
    )

    with Session(engine) as db:
        lawyer = models.Usuario(
            email="reminder-owner@example.com",
            password_hash="hash",
            nombre_completo="Reminder owner",
            whatsapp_numero="573000000001",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
            notificaciones_whatsapp=True,
            preferencias_notificacion={
                "RECORDATORIOS": {"email": False, "whatsapp": True},
            },
        )
        db.add(lawyer)
        db.flush()
        task = models.Tarea(usuario_id=lawyer.id, titulo="Due task")
        db.add(task)
        db.flush()
        reminder = models.RecordatorioTarea(
            tarea_id=task.id,
            fecha_hora=datetime(2020, 1, 1, 0, 0),
            activo=True,
        )
        db.add(reminder)
        db.commit()
        reminder_id = reminder.id

    result = reminder_workflow.procesar_recordatorios_tareas()
    assert result["recordatorios_programados"] == 1
    assert result["recordatorios_enviados"] == 0
    assert result["errores"] == 0
    assert sent == []
    assert len(workflow_launches) == 1
    assert workflow_launches[0]["programado_para"] == "2020-01-01T00:00:00Z"
    with Session(engine) as db:
        reminder = db.query(models.RecordatorioTarea).filter_by(id=reminder_id).one()
        assert reminder.enviado_en is None
        assert reminder.workflow_version_lanzada == reminder.version == 1

    repeated = reminder_workflow.procesar_recordatorios_tareas()
    assert repeated["recordatorios_programados"] == 0
    assert len(workflow_launches) == 1
    with Session(engine) as db:
        prepared = preparar_recordatorio_workflow(
            reminder_id,
            schemas.WorkflowRecordatorioPreparar(version=1),
            _=None,
            db=db,
        )
        assert prepared["estado"] == "PREPARADO"
        delivery = db.query(models.EntregaNotificacion).filter_by(recordatorio_id=reminder_id).one()
        assert delivery.estado == "PENDIENTE"
        assert delivery.recordatorio_version == 1
        delivery_id = delivery.id
        sent_delivery = enviar_entrega_notificacion_workflow(delivery_id, _=None, db=db)
        assert sent_delivery["estado"] == "ENVIADA"
        assert db.query(models.RecordatorioTarea).filter_by(id=reminder_id).one().enviado_en is not None
    assert len(sent) == 1

    completed = reminder_workflow.procesar_recordatorios_tareas()
    assert completed["recordatorios_programados"] == 0

    with Session(engine) as db:
        reminder = db.query(models.RecordatorioTarea).filter_by(id=reminder_id).one()
        reminder.enviado_en = None
        reminder.version = 2
        db.commit()
        stale = preparar_recordatorio_workflow(
            reminder_id,
            schemas.WorkflowRecordatorioPreparar(version=1),
            _=None,
            db=db,
        )
        assert stale == {"estado": "CANCELADO", "entrega_ids": []}
        assert db.query(models.EntregaNotificacion).filter_by(recordatorio_version=2).count() == 0
        delivery = db.query(models.EntregaNotificacion).filter_by(id=delivery_id).one()
        delivery.estado = "PENDIENTE"
        delivery.intentos = 0
        delivery.enviado_en = None
        db.commit()
        stale_delivery = enviar_entrega_notificacion_workflow(delivery_id, _=None, db=db)
        assert stale_delivery["estado"] == "OMITIDA"
        assert db.query(models.EntregaNotificacion).filter_by(id=delivery_id).one().intentos == 0


def test_reminder_401_is_visible_and_recovered_by_reconciler(monkeypatch, caplog):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    monkeypatch.setattr(reminder_workflow, "SessionLocal", sessionmaker(bind=engine))

    class LaunchResponse:
        def __init__(self, ok, status_code, headers=None, code=None):
            self.ok = ok
            self.status_code = status_code
            self.headers = headers or {}
            self.code = code

        def json(self):
            return {"code": self.code}

    responses = iter([
        LaunchResponse(
            False,
            401,
            {"content-type": "application/json"},
            "WORKFLOW_SERVICE_TOKEN_MISMATCH",
        ),
        LaunchResponse(False, 401, {"content-type": "text/html; charset=utf-8"}),
        LaunchResponse(False, 401, {"content-type": "application/json"}),
        LaunchResponse(True, 202),
    ])
    launches = []
    monkeypatch.setattr(
        "app.reminder_workflow.requests.post",
        lambda url, **kwargs: launches.append(kwargs["json"]) or next(responses),
    )
    monkeypatch.setenv("WORKFLOW_FRONTEND_URL", "https://frontend.example.test")
    monkeypatch.setenv("WORKFLOW_SERVICE_TOKEN", "reminder-test-token")

    with Session(engine) as db:
        lawyer = models.Usuario(
            email="retry-reminder@example.test",
            password_hash="hash",
            nombre_completo="Retry reminder owner",
            whatsapp_numero="",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
            notificaciones_email=True,
        )
        db.add(lawyer)
        db.flush()
        task = models.Tarea(usuario_id=lawyer.id, titulo="Retry reminder task")
        db.add(task)
        db.flush()
        reminder = models.RecordatorioTarea(
            tarea_id=task.id,
            fecha_hora=datetime(2020, 1, 1),
            activo=True,
        )
        db.add(reminder)
        db.commit()
        reminder_id = reminder.id

    failed = reminder_workflow.procesar_recordatorios_tareas()
    assert failed["recordatorios_programados"] == 0
    assert failed["errores"] == 1
    assert "WORKFLOW_SERVICE_TOKEN_MISMATCH" in caplog.text
    with Session(engine) as db:
        reminder = db.query(models.RecordatorioTarea).filter_by(id=reminder_id).one()
        assert reminder.workflow_version_lanzada == 0
        assert reminder.workflow_pendiente_lanzamiento is True

    protection_failed = reminder_workflow.procesar_recordatorios_tareas()
    assert protection_failed["recordatorios_programados"] == 0
    assert protection_failed["errores"] == 1
    assert "DEPLOYMENT_PROTECTION_OR_PROXY" in caplog.text

    generic_rejected = reminder_workflow.procesar_recordatorios_tareas()
    assert generic_rejected["recordatorios_programados"] == 0
    assert generic_rejected["errores"] == 1
    assert "AUTH_REJECTED_WITHOUT_LAUNCHER_CODE" in caplog.text

    recovered = reminder_workflow.procesar_recordatorios_tareas()
    assert recovered["recordatorios_programados"] == 1
    assert recovered["errores"] == 0
    assert len(launches) == 4
    with Session(engine) as db:
        reminder = db.query(models.RecordatorioTarea).filter_by(id=reminder_id).one()
        assert reminder.workflow_version_lanzada == reminder.version == 1
        assert reminder.workflow_pendiente_lanzamiento is False


def test_monthly_summary_uses_idempotent_workflow_delivery(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    monkeypatch.setattr(monthly_summary, "SessionLocal", sessionmaker(bind=engine))

    class MonthEndDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 31, 12, 0)

    monkeypatch.setattr(monthly_summary, "datetime", MonthEndDatetime)
    workflow_launches = []
    monkeypatch.setattr(
        "app.notification_service._iniciar_workflow",
        lambda delivery_ids: workflow_launches.extend(delivery_ids),
    )

    with Session(engine) as db:
        lawyer = models.Usuario(
            email="monthly-summary@example.test",
            password_hash="hash",
            nombre_completo="Monthly summary lawyer",
            whatsapp_numero="",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
            notificaciones_email=True,
            preferencias_notificacion={
                "RESUMENES": {"email": True, "whatsapp": False},
            },
        )
        db.add(lawyer)
        db.flush()
        radicado = models.Radicado(
            numero="92345678901234567890125",
            creado_por_id=lawyer.id,
            ambito_key="FIRMA",
            numero_normalizado="92345678901234567890125",
        )
        db.add(radicado)
        db.commit()

    result = monthly_summary.enviar_resumen_mensual()
    assert result == {"estado": "ok", "usuarios_notificados": 1}
    with Session(engine) as db:
        delivery = db.query(models.EntregaNotificacion).one()
        assert delivery.tipo == "RESUMENES"
        assert delivery.canal == "EMAIL"
        assert delivery.clave_idempotencia.startswith("RESUMENES:")
        delivery_id = delivery.id

    repeated = monthly_summary.enviar_resumen_mensual()
    assert repeated == {"estado": "ok", "usuarios_notificados": 1}
    with Session(engine) as db:
        assert db.query(models.EntregaNotificacion).count() == 1
    assert workflow_launches == [delivery_id, delivery_id]


def test_transactional_email_preserves_utf8_accents(monkeypatch):
    from email import policy
    from email.parser import BytesParser

    from app import email_service

    monkeypatch.setattr(email_service, "get_integration_settings", lambda: {
        "smtp_host": "smtp.example.test",
        "smtp_from": "sender@example.test",
        "smtp_port": 587,
        "smtp_user": "sender@example.test",
        "smtp_password": "test-password",
        "smtp_starttls": True,
    })
    monkeypatch.setattr(email_service, "get_firm_settings", lambda: {})
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            self.host = host

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def ehlo(self):
            return None

        def starttls(self):
            return None

        def login(self, username, password):
            return None

        def send_message(self, message):
            captured["wire"] = message.as_bytes()

    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    body = "Prueba de acentuación: á, é, í, ó, ú, ü y ñ."
    assert email_service.enviar_correo(
        "recipient@example.test", "Prueba UTF-8: revisión", body
    )

    parsed = BytesParser(policy=policy.default).parsebytes(captured["wire"])
    # El correo lleva versión de texto y HTML; el texto plano conserva el cuerpo exacto.
    plain = parsed.get_body(preferencelist=("plain",))
    assert plain.get_content_charset() == "utf-8"
    assert plain.get_content().rstrip("\r\n") == body
    assert str(parsed["Subject"]) == "Prueba UTF-8: revisión"


def test_whatsapp_api_skips_unconfigured_transport_without_printing_message(monkeypatch, capsys):
    monkeypatch.setattr(whatsapp, "get_integration_settings", lambda: {"whatsapp_api_url": "", "whatsapp_token": ""})

    assert whatsapp.enviar_mensaje_whatsapp("3001234567", "private message") is False
    assert "private message" not in capsys.readouterr().out


def test_whatsapp_api_uses_configured_http_transport(monkeypatch):
    class Response:
        status_code = 200

    calls = []
    monkeypatch.setattr(
        whatsapp,
        "get_integration_settings",
        lambda: {"whatsapp_api_url": "https://whatsapp.example.test/send", "whatsapp_token": "test-token"},
    )
    monkeypatch.setattr(
        whatsapp.requests,
        "post",
        lambda url, **kwargs: calls.append((url, kwargs)) or Response(),
    )

    assert whatsapp.enviar_mensaje_whatsapp("3001234567", "hello") is True
    assert calls[0][0] == "https://whatsapp.example.test/send"
    assert calls[0][1]["timeout"] == 10
