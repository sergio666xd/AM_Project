import importlib
from io import BytesIO
from datetime import datetime, timedelta, timezone
import zipfile

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from sqlalchemy import Boolean, Column, ForeignKey, Integer, MetaData, String, Table, create_engine, delete, insert, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app import security
from app import models, schemas
from app import tasks as celery_tasks
from app import whatsapp
from app import rama_judicial_api
from app.audit import registrar_evento_auditoria
from app.firm_access import has_firm_wide_access, lawyer_scope_id, require_process_access
from app.notification_policy import plan_whatsapp_habilitado, whatsapp_habilitado
from app.radicados import obtener_o_vincular_radicado
from app.migrate_radicados_canonicos import migrar as migrar_radicados_canonicos, previsualizar as previsualizar_migracion_radicados
from app.routers import admin as admin_router
from app.routers.admin import (
    actualizar_recurso_admin,
    crear_recurso_admin,
    eliminar_recurso_admin,
    guardar_contenido_publico_admin,
    listar_inventario_global,
    listar_contenido_publico_admin,
    cargar_documento_admin,
    emitir_url_temporal_documento_admin,
    consultar_radicado_admin,
    consultar_todos_radicados_admin,
    restaurar_proceso_admin,
    restaurar_contenido_publico_admin,
    aplicar_migracion_radicados_admin,
)
from app.routers.expedientes import (
    _cliente_asignado,
    _document_content_matches_type,
    asignar_cliente,
    asignar_colaborador_proceso,
    asignar_radicado,
    cargar_documento_cliente,
    descargar_documento,
    eliminar_proceso,
    listar_procesos,
    listar_procesos_archivados,
    listar_documentos_despacho,
    listar_mis_solicitudes_edicion_perfil,
    listar_solicitudes_edicion_perfil_pendientes,
    obtener_cliente,
    obtener_proceso_detalle,
    revisar_solicitud_edicion_perfil,
    restaurar_proceso,
    retirar_colaborador_proceso,
    solicitar_edicion_perfil_cliente,
)
from app.routers.tareas import (
    actualizar_subtarea,
    crear_subtarea,
    listar_tareas,
    obtener_tarea,
    obtener_tarea_usuario,
    require_task_manager,
    validar_actualizacion_tarea,
)
from app.firm_access import require_roles


def test_radicados_migration_api_routes_are_registered_in_admin_router():
    route_methods = {
        (route.path, method)
        for route in admin_router.router.routes
        for method in getattr(route, "methods", set())
    }

    assert ("/api/admin/migraciones/radicados/preview", "GET") in route_methods
    assert ("/api/admin/migraciones/radicados/aplicar", "POST") in route_methods


def test_radicados_migration_api_apply_is_disabled_unless_explicitly_enabled(monkeypatch):
    monkeypatch.delenv("RADICADO_MIGRATION_API_ENABLED", raising=False)
    admin = models.Usuario(
        id=1,
        email="migration-admin@example.test",
        password_hash="hash",
        nombre_completo="Migration admin",
        whatsapp_numero="0000000001",
        rol=models.RolUsuario.ADMIN,
        estado=models.EstadoUsuario.ACTIVO,
    )

    with pytest.raises(HTTPException) as error:
        aplicar_migracion_radicados_admin(
            schemas.AplicarMigracionRadicados(
                confirmacion="CONFIRMO_BACKUP_VERIFICADO"
            ),
            admin=admin,
        )

    assert error.value.status_code == 404


def test_process_associations_cannot_cross_saas_or_firm_boundary():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        external_owner = models.Usuario(
            email="external-owner@example.test",
            password_hash="hash",
            nombre_completo="External owner",
            whatsapp_numero="0000000101",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        other_external_owner = models.Usuario(
            email="other-external@example.test",
            password_hash="hash",
            nombre_completo="Other external",
            whatsapp_numero="0000000102",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        firm_owner = models.Usuario(
            email="firm-owner@example.test",
            password_hash="hash",
            nombre_completo="Firm owner",
            whatsapp_numero="0000000103",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        other_firm_owner = models.Usuario(
            email="other-firm@example.test",
            password_hash="hash",
            nombre_completo="Other firm lawyer",
            whatsapp_numero="0000000104",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([external_owner, other_external_owner, firm_owner, other_firm_owner])
        db.flush()

        external_client = models.Usuario(
            email="other-external-client@example.test",
            password_hash="hash",
            nombre_completo="External client",
            whatsapp_numero="0000000105",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=other_external_owner.id,
        )
        firm_client = models.Usuario(
            email="firm-client@example.test",
            password_hash="hash",
            nombre_completo="Firm client",
            whatsapp_numero="0000000106",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=other_firm_owner.id,
        )
        db.add_all([external_client, firm_client])
        db.flush()

        external_process = models.Proceso(abogado_id=external_owner.id, nombre="External process")
        firm_process = models.Proceso(abogado_id=firm_owner.id, nombre="Firm process")
        other_external_radicado = models.Radicado(
            numero="12345678901234567890123", usuario_id=other_external_owner.id
        )
        firm_radicado = models.Radicado(
            numero="22345678901234567890123", usuario_id=other_firm_owner.id
        )
        db.add_all([external_process, firm_process, other_external_radicado, firm_radicado])
        db.flush()

        with pytest.raises(HTTPException) as external_client_error:
            asignar_cliente(external_process.id, external_client.id, db=db, usuario=external_owner)
        assert external_client_error.value.status_code == 404

        with pytest.raises(HTTPException) as firm_client_error:
            asignar_cliente(firm_process.id, external_client.id, db=db, usuario=firm_owner)
        assert firm_client_error.value.status_code == 404

        assert asignar_cliente(
            firm_process.id, firm_client.id, db=db, usuario=firm_owner
        )["mensaje"] == "Cliente asignado al proceso."

        with pytest.raises(HTTPException) as external_error:
            asignar_radicado(
                external_process.id, other_external_radicado.id, db=db, usuario=external_owner
            )
        assert external_error.value.status_code == 404

        with pytest.raises(HTTPException) as firm_radicado_error:
            asignar_radicado(
                external_process.id, firm_radicado.id, db=db, usuario=external_owner
            )
        assert firm_radicado_error.value.status_code == 404

        with pytest.raises(HTTPException) as external_radicado_error:
            asignar_radicado(
                firm_process.id, other_external_radicado.id, db=db, usuario=firm_owner
            )
        assert external_radicado_error.value.status_code == 404

        assert asignar_radicado(
            firm_process.id, firm_radicado.id, db=db, usuario=firm_owner
        )["mensaje"] == "Radicado asignado al proceso."
        assert db.query(models.ProcesoRadicado).filter_by(
            proceso_id=firm_process.id, radicado_id=firm_radicado.id
        ).first()


def test_canonical_radicado_is_shared_in_firm_but_isolated_per_saas_owner():
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
        saas_owner = models.Usuario(
            email="canonical-saas-owner@example.test",
            password_hash="hash",
            nombre_completo="SaaS owner",
            whatsapp_numero="0000000113",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        other_saas_owner = models.Usuario(
            email="canonical-other-saas-owner@example.test",
            password_hash="hash",
            nombre_completo="Other SaaS owner",
            whatsapp_numero="0000000114",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([firm_owner, firm_colleague, saas_owner, other_saas_owner])
        db.flush()

        number = "12345678901234567890123"
        firm_radicado = models.Radicado(numero=number, usuario_id=firm_owner.id)
        saas_radicado = models.Radicado(numero=number, usuario_id=saas_owner.id)
        other_saas_radicado = models.Radicado(numero=number, usuario_id=other_saas_owner.id)
        db.add_all([firm_radicado, saas_radicado, other_saas_radicado])
        db.flush()

        firm_radicado.usuarios_vinculados.append(firm_colleague)
        db.flush()

        assert firm_radicado.ambito_key == "FIRMA"
        assert firm_radicado.numero_normalizado == number
        assert {user.id for user in firm_radicado.usuarios_vinculados} == {
            firm_owner.id,
            firm_colleague.id,
        }
        assert saas_radicado.ambito_key == f"SAAS:{saas_owner.id}"
        assert other_saas_radicado.ambito_key == f"SAAS:{other_saas_owner.id}"

        db.add(models.Radicado(numero=number, usuario_id=saas_owner.id))
        with pytest.raises(IntegrityError):
            db.flush()


def test_obtener_o_vincular_radicado_reuses_only_within_scope():
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
        saas_owner = models.Usuario(
            email="linked-saas-owner@example.test",
            password_hash="hash",
            nombre_completo="SaaS owner",
            whatsapp_numero="0000000123",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([firm_owner, firm_colleague, saas_owner])
        db.flush()

        number = "12345678901234567890123"
        firm_radicado, created = obtener_o_vincular_radicado(db, firm_owner, number)
        same_firm_radicado, created_again = obtener_o_vincular_radicado(
            db, firm_colleague, number
        )
        saas_radicado, created_saas = obtener_o_vincular_radicado(db, saas_owner, number)
        db.commit()

        assert created is True
        assert created_again is False
        assert same_firm_radicado.id == firm_radicado.id
        assert created_saas is True
        assert saas_radicado.id != firm_radicado.id
        assert {user.id for user in firm_radicado.usuarios_vinculados} == {
            firm_owner.id,
            firm_colleague.id,
        }


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
            lambda id_proceso, limite=None: [],
        )

        result = rama_judicial_api.ejecutar_consulta_api_radicado(db, radicado)
        db.refresh(radicado)

        assert result["estado"] == "ok"
        assert radicado.id_proceso_rama == "123"
        assert db.query(models.Radicado).filter_by(id=radicado_id).one().id_proceso_rama == "123"


def test_manual_radicado_retry_reuses_original_arguments_and_consulta_id(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine)
    monkeypatch.setattr(celery_tasks, "SessionLocal", test_session)

    with test_session() as db:
        owner = models.Usuario(
            email="retry-owner@example.test",
            password_hash="hash",
            nombre_completo="Retry owner",
            whatsapp_numero="0000000301",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(owner)
        db.flush()
        radicado = models.Radicado(
            numero="42345678901234567890123", usuario_id=owner.id
        )
        db.add(radicado)
        db.flush()
        consulta = models.ConsultaRadicado(
            radicado_id=radicado.id,
            tipo="MANUAL",
            estado="ENCOLADA",
        )
        db.add(consulta)
        db.commit()
        radicado_id = radicado.id
        consulta_id = consulta.id

    monkeypatch.setattr(
        celery_tasks,
        "ejecutar_consulta_api_radicado",
        lambda db, radicado: {"estado": "error_api: HTTP 503"},
    )
    captured: dict[str, object] = {}

    class RetryRequested(Exception):
        pass

    def capture_retry(**kwargs):
        captured.update(kwargs)
        return RetryRequested()

    monkeypatch.setattr(celery_tasks.tarea_consultar_radicado, "retry", capture_retry)

    with pytest.raises(RetryRequested):
        celery_tasks.tarea_consultar_radicado.run(
            radicado_id, "MANUAL", consulta_id
        )

    assert captured["args"] == (radicado_id, "MANUAL", consulta_id)
    assert captured["kwargs"] == {}
    with test_session() as db:
        retried_consulta = db.query(models.ConsultaRadicado).filter_by(id=consulta_id).one()
        assert retried_consulta.estado == "REINTENTANDO"


def test_archiving_process_preserves_relations_and_restoration_reopens_access():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        lawyer = models.Usuario(
            email="archive-lawyer@example.test",
            password_hash="hash",
            nombre_completo="Firm lawyer",
            whatsapp_numero="0000000201",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(lawyer)
        db.flush()
        client = models.Usuario(
            email="archive-client@example.test",
            password_hash="hash",
            nombre_completo="Firm client",
            whatsapp_numero="0000000202",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=lawyer.id,
        )
        process = models.Proceso(abogado_id=lawyer.id, nombre="Retained process")
        radicado = models.Radicado(
            numero="32345678901234567890123", usuario_id=lawyer.id
        )
        db.add_all([client, process, radicado])
        db.flush()
        db.add_all([
            models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id),
            models.ProcesoRadicado(proceso_id=process.id, radicado_id=radicado.id),
            models.Tarea(
                usuario_id=lawyer.id,
                proceso_id=process.id,
                cliente_id=client.id,
                titulo="Retained task",
                estado=models.EstadoTarea.PENDIENTE,
                prioridad=models.PrioridadTarea.MEDIA,
            ),
        ])
        request = models.SolicitudDocumento(
            proceso_id=process.id, cliente_id=client.id, titulo="Retained document request"
        )
        db.add(request)
        db.flush()
        document = models.DocumentoProceso(
            proceso_id=process.id,
            cliente_id=client.id,
            solicitud_id=request.id,
            nombre_archivo="retained.pdf",
            ruta_archivo="archive-test/retained.pdf",
            mime_type="application/pdf",
        )
        db.add(document)
        db.commit()

        result = eliminar_proceso(process.id, db=db, usuario=lawyer)
        assert "archivado" in result["mensaje"].lower()
        assert listar_procesos(db=db, usuario=lawyer) == []
        assert listar_procesos(db=db, usuario=client) == []
        assert listar_tareas(db=db, usuario_actual=lawyer) == []
        assert listar_tareas(db=db, usuario_actual=client) == []
        assert listar_documentos_despacho(db=db, usuario=lawyer) == {
            "solicitudes": [],
            "documentos": [],
        }
        archived = listar_procesos_archivados(db=db, usuario=lawyer)
        assert len(archived) == 1
        assert archived[0]["id"] == process.id
        assert archived[0]["radicados_count"] == 1
        assert archived[0]["clientes_count"] == 1
        with pytest.raises(HTTPException) as error:
            obtener_proceso_detalle(process.id, db=db, usuario=lawyer)
        assert error.value.status_code == 404
        assert db.query(models.ProcesoRadicado).filter_by(
            proceso_id=process.id, radicado_id=radicado.id
        ).count() == 1
        assert db.query(models.ProcesoCliente).filter_by(
            proceso_id=process.id, cliente_id=client.id
        ).count() == 1
        assert db.query(models.Tarea).filter_by(proceso_id=process.id).count() == 1
        assert db.query(models.DocumentoProceso).filter_by(id=document.id).count() == 1

        restaurar_proceso(process.id, db=db, usuario=lawyer)
        assert [item["id"] for item in listar_procesos(db=db, usuario=lawyer)] == [process.id]
        assert listar_procesos_archivados(db=db, usuario=lawyer) == []
        restored_documents = listar_documentos_despacho(db=db, usuario=lawyer)
        assert len(restored_documents["solicitudes"]) == 1
        assert len(restored_documents["documentos"]) == 1


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

    assert has_firm_wide_access(admin)
    assert not has_firm_wide_access(managing_lawyer)
    assert not has_firm_wide_access(associate)
    assert lawyer_scope_id(managing_lawyer) == 2
    assert lawyer_scope_id(associate) == 3
    require_process_access(admin, 99)
    require_process_access(managing_lawyer, 2)
    require_process_access(associate, 3)
    with pytest.raises(HTTPException):
        require_process_access(associate, 99)


def test_saas_notification_features_require_plan_but_internal_staff_do_not():
    class Plan:
        notificaciones_whatsapp_tareas = True
        notificaciones_whatsapp_procesos = False

    class User:
        def __init__(self, role, plan=None):
            self.rol = role
            self.plan = plan
            self.notificaciones_whatsapp = True
            self.whatsapp_numero = "573000000000"

    external_lawyer = User(models.RolUsuario.ABOGADO, Plan())
    firm_lawyer = User(models.RolUsuario.ABOGADO_ADMIN)
    client = User(models.RolUsuario.CLIENTE)

    assert whatsapp_habilitado(external_lawyer)
    assert plan_whatsapp_habilitado(external_lawyer, "notificaciones_whatsapp_tareas")
    assert not plan_whatsapp_habilitado(external_lawyer, "notificaciones_whatsapp_procesos")
    assert plan_whatsapp_habilitado(firm_lawyer, "notificaciones_whatsapp_tareas")
    assert whatsapp_habilitado(client)


def test_require_roles_rejects_client_from_lawyer_operation():
    class Actor:
        rol = models.RolUsuario.CLIENTE

    with pytest.raises(HTTPException) as error:
        require_roles(Actor(), ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="gestionar radicados")

    assert error.value.status_code == 403


def test_task_manager_must_own_task_unless_admin():
    class Lawyer:
        id = 10
        rol = models.RolUsuario.ABOGADO

    class Task:
        usuario_id = 20

    with pytest.raises(HTTPException):
        require_task_manager(Lawyer(), Task(), action="gestionar recordatorios")

    Task.usuario_id = 10
    require_task_manager(Lawyer(), Task(), action="gestionar recordatorios")


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


def test_client_can_only_mark_own_task_completed():
    class Actor:
        id = 10
        rol = models.RolUsuario.CLIENTE

    class Task:
        cliente_id = 10

    actor = Actor()
    task = Task()

    validar_actualizacion_tarea(
        schemas.TareaUpdate(estado=models.EstadoTarea.COMPLETADA), task, actor
    )
    with pytest.raises(HTTPException):
        validar_actualizacion_tarea(schemas.TareaUpdate(titulo="Edited"), task, actor)
    with pytest.raises(HTTPException):
        validar_actualizacion_tarea(
            schemas.TareaUpdate(estado=models.EstadoTarea.PENDIENTE), task, actor
        )


def test_client_task_lookup_is_scoped_to_assigned_tenant():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        first_lawyer = models.Usuario(
            email="first@example.test",
            password_hash="hash",
            nombre_completo="First Lawyer",
            whatsapp_numero="0000000001",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        second_lawyer = models.Usuario(
            email="second@example.test",
            password_hash="hash",
            nombre_completo="Second Lawyer",
            whatsapp_numero="0000000002",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        admin = models.Usuario(
            email="tenant-admin@example.test",
            password_hash="hash",
            nombre_completo="Platform Admin",
            whatsapp_numero="0000000005",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([first_lawyer, second_lawyer, admin])
        db.flush()
        client = models.Usuario(
            email="client@example.test",
            password_hash="hash",
            nombre_completo="Client",
            whatsapp_numero="0000000003",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=first_lawyer.id,
        )
        other_client = models.Usuario(
            email="other@example.test",
            password_hash="hash",
            nombre_completo="Other Client",
            whatsapp_numero="0000000004",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=second_lawyer.id,
        )
        db.add_all([client, other_client])
        db.flush()
        foreign_process = models.Proceso(abogado_id=second_lawyer.id, nombre="Foreign process")
        foreign_radicado = models.Radicado(
            numero="98765432109876543210987", usuario_id=second_lawyer.id
        )
        db.add_all([foreign_process, foreign_radicado])
        db.flush()
        task = models.Tarea(
            usuario_id=first_lawyer.id,
            cliente_id=client.id,
            titulo="Assigned task",
            estado=models.EstadoTarea.PENDIENTE,
            prioridad=models.PrioridadTarea.MEDIA,
        )
        foreign_task = models.Tarea(
            usuario_id=second_lawyer.id,
            cliente_id=other_client.id,
            titulo="Foreign task",
            estado=models.EstadoTarea.PENDIENTE,
            prioridad=models.PrioridadTarea.MEDIA,
        )
        mismatched_process_task = models.Tarea(
            usuario_id=first_lawyer.id,
            cliente_id=client.id,
            proceso_id=foreign_process.id,
            titulo="Mismatched process task",
            estado=models.EstadoTarea.PENDIENTE,
            prioridad=models.PrioridadTarea.MEDIA,
        )
        mismatched_radicado_task = models.Tarea(
            usuario_id=first_lawyer.id,
            cliente_id=client.id,
            radicado_id=foreign_radicado.id,
            titulo="Mismatched radicado task",
            estado=models.EstadoTarea.PENDIENTE,
            prioridad=models.PrioridadTarea.MEDIA,
        )
        db.add_all([task, foreign_task, mismatched_process_task, mismatched_radicado_task])
        db.commit()

        assert obtener_tarea_usuario(task.id, client, db).id == task.id
        assert [item["id"] for item in listar_tareas(db=db, usuario_actual=client)] == [task.id]
        with pytest.raises(HTTPException) as error:
            obtener_tarea_usuario(foreign_task.id, client, db)
        assert error.value.status_code == 404
        for task_id in [mismatched_process_task.id, mismatched_radicado_task.id]:
            with pytest.raises(HTTPException) as error:
                obtener_tarea_usuario(task_id, client, db)
            assert error.value.status_code == 404
        assert {item.id for item in listar_tareas(db=db, usuario_actual=admin)} == {
            task.id,
            foreign_task.id,
            mismatched_process_task.id,
            mismatched_radicado_task.id,
        }


def test_client_process_list_checks_assignment_and_tenant_owner():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        first_lawyer = models.Usuario(
            email="process-first@example.test",
            password_hash="hash",
            nombre_completo="First Lawyer",
            whatsapp_numero="0000000011",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        second_lawyer = models.Usuario(
            email="process-second@example.test",
            password_hash="hash",
            nombre_completo="Second Lawyer",
            whatsapp_numero="0000000012",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([first_lawyer, second_lawyer])
        db.flush()
        client = models.Usuario(
            email="process-client@example.test",
            password_hash="hash",
            nombre_completo="Client",
            whatsapp_numero="0000000013",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=first_lawyer.id,
        )
        own_process = models.Proceso(abogado_id=first_lawyer.id, nombre="Own")
        foreign_process = models.Proceso(abogado_id=second_lawyer.id, nombre="Foreign")
        unassigned_process = models.Proceso(abogado_id=second_lawyer.id, nombre="Unassigned")
        db.add_all([client, own_process, foreign_process, unassigned_process])
        db.flush()
        db.add_all([
            models.ProcesoCliente(proceso_id=own_process.id, cliente_id=client.id),
            models.ProcesoCliente(proceso_id=foreign_process.id, cliente_id=client.id),
            models.Tarea(
                usuario_id=second_lawyer.id, cliente_id=client.id,
                proceso_id=own_process.id, titulo="Foreign linked task",
                estado=models.EstadoTarea.PENDIENTE,
                prioridad=models.PrioridadTarea.MEDIA,
            ),
        ])
        foreign_radicado = models.Radicado(
            numero="12345678901234567890123", usuario_id=second_lawyer.id
        )
        db.add(foreign_radicado)
        db.flush()
        db.add(models.ProcesoRadicado(proceso_id=own_process.id, radicado_id=foreign_radicado.id))
        db.add(models.Actuacion(
            radicado_id=foreign_radicado.id,
            orden=1,
            fecha_actuacion="2026-09-01",
            actuacion="Actuación visible",
            anotacion="Nota interna reservada",
        ))
        db.commit()

        result = listar_procesos(db=db, usuario=client)
        detail = obtener_proceso_detalle(own_process.id, db=db, usuario=first_lawyer)

        assert [process["id"] for process in result] == [own_process.id, foreign_process.id]
        assert [radicado["id"] for process in result for radicado in process["radicados"]] == [foreign_radicado.id]
        client_radicado = result[0]["radicados"][0]
        assert client_radicado["actuaciones"][0]["actuacion"] == "Actuación visible"
        assert "anotacion" not in client_radicado["actuaciones"][0]
        assert unassigned_process.id not in {process["id"] for process in result}
        assert [radicado["id"] for radicado in detail["radicados"]] == [foreign_radicado.id]
        assert detail["radicados"][0]["actuaciones"][0]["anotacion"] == "Nota interna reservada"
        assert [task["titulo"] for task in detail["tareas"]] == ["Foreign linked task"]


def test_lawyer_client_detail_and_document_list_are_tenant_scoped():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="owner@example.test",
            password_hash="hash",
            nombre_completo="Owner",
            whatsapp_numero="0000000021",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        foreign_owner = models.Usuario(
            email="foreign-owner@example.test",
            password_hash="hash",
            nombre_completo="Foreign Owner",
            whatsapp_numero="0000000022",
            rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([owner, foreign_owner])
        db.flush()
        client = models.Usuario(
            email="owned-client@example.test",
            password_hash="hash",
            nombre_completo="Owned Client",
            whatsapp_numero="0000000023",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=owner.id,
        )
        own_process = models.Proceso(abogado_id=owner.id, nombre="Own process")
        foreign_process = models.Proceso(abogado_id=foreign_owner.id, nombre="Foreign process")
        db.add_all([client, own_process, foreign_process])
        db.flush()
        own_request = models.SolicitudDocumento(
            proceso_id=own_process.id, cliente_id=client.id, titulo="Own request"
        )
        foreign_request = models.SolicitudDocumento(
            proceso_id=foreign_process.id, cliente_id=client.id, titulo="Foreign request"
        )
        db.add_all([own_request, foreign_request])
        db.flush()
        db.add_all([
            models.ProcesoCliente(proceso_id=own_process.id, cliente_id=client.id),
            models.ProcesoCliente(proceso_id=foreign_process.id, cliente_id=client.id),
            models.Tarea(
                usuario_id=owner.id, cliente_id=client.id, proceso_id=own_process.id,
                titulo="Own task", estado=models.EstadoTarea.PENDIENTE,
                prioridad=models.PrioridadTarea.MEDIA,
            ),
            models.Tarea(
                usuario_id=foreign_owner.id, cliente_id=client.id, proceso_id=foreign_process.id,
                titulo="Foreign task", estado=models.EstadoTarea.PENDIENTE,
                prioridad=models.PrioridadTarea.MEDIA,
            ),
            models.DocumentoProceso(
                proceso_id=own_process.id, cliente_id=client.id,
                solicitud_id=own_request.id, nombre_archivo="own.pdf",
                ruta_archivo="own/key", mime_type="application/pdf",
            ),
            models.DocumentoProceso(
                proceso_id=foreign_process.id, cliente_id=client.id,
                solicitud_id=foreign_request.id, nombre_archivo="foreign.pdf",
                ruta_archivo="foreign/key", mime_type="application/pdf",
            ),
        ])
        db.commit()

        detail = obtener_cliente(client.id, db=db, usuario=owner)
        documents = listar_documentos_despacho(db=db, usuario=owner)
        client_documents = listar_documentos_despacho(db=db, usuario=client)

        assert [process["id"] for process in detail["procesos"]] == [own_process.id]
        assert [task["titulo"] for task in detail["tareas"]] == ["Own task"]
        assert [request["titulo"] for request in detail["solicitudes_documento"]] == ["Own request"]
        assert [document["nombre_archivo"] for document in documents["documentos"]] == ["own.pdf"]
        assert [request["titulo"] for request in documents["solicitudes"]] == ["Own request"]
        assert {document["nombre_archivo"] for document in client_documents["documentos"]} == {"own.pdf", "foreign.pdf"}
        assert {request["titulo"] for request in client_documents["solicitudes"]} == {"Own request", "Foreign request"}

        foreign_detail = obtener_cliente(client.id, db=db, usuario=foreign_owner)
        foreign_documents = listar_documentos_despacho(db=db, usuario=foreign_owner)
        assert [process["id"] for process in foreign_detail["procesos"]] == [foreign_process.id]
        assert [task["titulo"] for task in foreign_detail["tareas"]] == ["Foreign task"]
        assert [request["titulo"] for request in foreign_detail["solicitudes_documento"]] == ["Foreign request"]
        assert [document["nombre_archivo"] for document in foreign_documents["documentos"]] == ["foreign.pdf"]


def test_document_download_is_limited_to_assigned_active_processes(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="download-owner@example.test", password_hash="hash",
            nombre_completo="Owner", whatsapp_numero="0000000401",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        outsider = models.Usuario(
            email="download-outsider@example.test", password_hash="hash",
            nombre_completo="Outsider", whatsapp_numero="0000000402",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([owner, outsider])
        db.flush()
        client = models.Usuario(
            email="download-client@example.test", password_hash="hash",
            nombre_completo="Client", whatsapp_numero="0000000403",
            rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=owner.id,
        )
        assigned_process = models.Proceso(abogado_id=owner.id, nombre="Assigned")
        unassigned_process = models.Proceso(abogado_id=owner.id, nombre="Unassigned")
        db.add_all([client, assigned_process, unassigned_process])
        db.flush()
        db.add(models.ProcesoCliente(proceso_id=assigned_process.id, cliente_id=client.id))
        assigned_request = models.SolicitudDocumento(
            proceso_id=assigned_process.id, cliente_id=client.id, titulo="Assigned request"
        )
        unassigned_request = models.SolicitudDocumento(
            proceso_id=unassigned_process.id, cliente_id=client.id, titulo="Unassigned request"
        )
        db.add_all([assigned_request, unassigned_request])
        db.flush()
        assigned_document = models.DocumentoProceso(
            proceso_id=assigned_process.id, cliente_id=client.id,
            solicitud_id=assigned_request.id, nombre_archivo="assigned.pdf",
            ruta_archivo="process/assigned.pdf", mime_type="application/pdf",
        )
        unassigned_document = models.DocumentoProceso(
            proceso_id=unassigned_process.id, cliente_id=client.id,
            solicitud_id=unassigned_request.id, nombre_archivo="unassigned.pdf",
            ruta_archivo="process/unassigned.pdf", mime_type="application/pdf",
        )
        db.add_all([assigned_document, unassigned_document])
        db.commit()

        requested_keys: list[str] = []

        class FakeR2Client:
            def get_object(self, *, Bucket, Key):
                requested_keys.append(Key)
                return {"Body": BytesIO(b"document bytes")}

        monkeypatch.setattr("app.routers.expedientes.storage.get_r2_client", lambda: FakeR2Client())
        monkeypatch.setattr("app.routers.expedientes.storage.get_r2_bucket", lambda: "test-bucket")

        response = descargar_documento(assigned_document.id, db=db, usuario=client)
        assert response.media_type == "application/pdf"
        assert response.headers["cache-control"] == "private, no-store"
        assert requested_keys == ["process/assigned.pdf"]

        for actor, document_id in [
            (client, unassigned_document.id),
            (outsider, assigned_document.id),
        ]:
            with pytest.raises(HTTPException) as error:
                descargar_documento(document_id, db=db, usuario=actor)
            assert error.value.status_code == 404
        assert requested_keys == ["process/assigned.pdf"]


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


@pytest.mark.parametrize(
    ("fail_commit", "fail_cleanup"),
    [(False, False), (True, False), (True, True)],
)
def test_document_upload_compensates_only_when_database_commit_fails(
    monkeypatch, fail_commit, fail_cleanup
):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="upload-owner@example.test",
            password_hash="hash",
            nombre_completo="Owner",
            whatsapp_numero="0000000701",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        client = models.Usuario(
            email="upload-client@example.test",
            password_hash="hash",
            nombre_completo="Client",
            whatsapp_numero="0000000702",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([owner, client])
        db.flush()
        process = models.Proceso(abogado_id=owner.id, nombre="Upload process")
        db.add(process)
        db.flush()
        request = models.SolicitudDocumento(
            proceso_id=process.id,
            cliente_id=client.id,
            titulo="Signed document",
        )
        db.add_all([
            request,
            models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id),
        ])
        db.commit()

        uploaded_keys = []
        deleted_keys = []

        class FakeR2Client:
            def put_object(self, *, Bucket, Key, Body, ContentType):
                uploaded_keys.append(Key)

            def delete_object(self, *, Bucket, Key):
                deleted_keys.append(Key)
                if fail_cleanup:
                    raise RuntimeError("storage unavailable")

        monkeypatch.setattr(
            "app.routers.expedientes.storage.get_r2_client",
            lambda: FakeR2Client(),
        )
        monkeypatch.setattr(
            "app.routers.expedientes.storage.get_r2_bucket",
            lambda: "test-bucket",
        )

        if fail_commit:
            def reject_commit():
                raise RuntimeError("database unavailable")

            monkeypatch.setattr(db, "commit", reject_commit)
        upload = UploadFile(
            filename="signed.pdf",
            file=BytesIO(b"%PDF-1.7"),
            headers=Headers({"content-type": "application/pdf"}),
        )

        if fail_commit:
            with pytest.raises(RuntimeError, match="database unavailable"):
                cargar_documento_cliente(
                    request.id,
                    archivo=upload,
                    db=db,
                    usuario=client,
                )
            assert deleted_keys == uploaded_keys
            assert db.query(models.DocumentoProceso).count() == 0
        else:
            result = cargar_documento_cliente(
                request.id,
                archivo=upload,
                db=db,
                usuario=client,
            )
            assert result["nombre_archivo"] == "signed.pdf"
            assert deleted_keys == []
            assert db.query(models.DocumentoProceso).count() == 1
        assert len(uploaded_keys) == 1


def test_admin_public_page_content_can_be_saved_listed_and_restored():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        admin = models.Usuario(
            email="cms-admin@example.test",
            password_hash="hash",
            nombre_completo="CMS administrator",
            whatsapp_numero="0000000501",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(admin)
        db.flush()

        content = {"title": "Título editable", "sections": [{"title": "Área", "items": ["Servicio"]}]}
        saved = guardar_contenido_publico_admin(
            "inicio", schemas.ContenidoPaginaUpdate(contenido=content), db=db, admin=admin
        )
        assert saved["contenido"] == content
        listed = listar_contenido_publico_admin(db=db, admin=admin)
        home_page = next(page for page in listed if page["slug"] == "inicio")
        assert home_page["contenido"] == content

        result = restaurar_contenido_publico_admin("inicio", db=db, admin=admin)
        assert "restaurará" in result["mensaje"]
        restored = listar_contenido_publico_admin(db=db, admin=admin)
        assert next(page for page in restored if page["slug"] == "inicio")["contenido"] is None

        with pytest.raises(HTTPException) as error:
            guardar_contenido_publico_admin(
                "unknown", schemas.ContenidoPaginaUpdate(contenido=content), db=db, admin=admin
            )
        assert error.value.status_code == 404


def test_admin_inventory_sector_filter_keeps_firm_and_saas_separate():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        admin = models.Usuario(
            email="scope-admin@example.test", password_hash="hash",
            nombre_completo="Admin", whatsapp_numero="0000000601",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        firm_lawyer = models.Usuario(
            email="scope-firm@example.test", password_hash="hash",
            nombre_completo="Firm lawyer", whatsapp_numero="0000000602",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        saas_lawyer = models.Usuario(
            email="scope-saas@example.test", password_hash="hash",
            nombre_completo="SaaS lawyer", whatsapp_numero="0000000603",
            rol=models.RolUsuario.ABOGADO, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, firm_lawyer, saas_lawyer])
        db.flush()
        db.add_all([
            models.Proceso(abogado_id=firm_lawyer.id, nombre="Firm case"),
            models.Proceso(abogado_id=saas_lawyer.id, nombre="SaaS case"),
            models.Tarea(usuario_id=firm_lawyer.id, titulo="Firm task"),
            models.Tarea(usuario_id=saas_lawyer.id, titulo="SaaS task"),
        ])
        db.commit()

        firm_cases = listar_inventario_global("procesos", sector="FIRMA", db=db, admin=admin)
        saas_cases = listar_inventario_global("procesos", sector="SAAS", db=db, admin=admin)
        all_cases = listar_inventario_global("procesos", sector="GLOBAL", db=db, admin=admin)
        firm_tasks = listar_inventario_global("tareas", sector="FIRMA", db=db, admin=admin)
        saas_tasks = listar_inventario_global("tareas", sector="SAAS", db=db, admin=admin)

        assert [item["nombre"] for item in firm_cases] == ["Firm case"]
        assert [item["nombre"] for item in saas_cases] == ["SaaS case"]
        assert {item["nombre"] for item in all_cases} == {"Firm case", "SaaS case"}
        assert [item["titulo"] for item in firm_tasks] == ["Firm task"]
        assert [item["titulo"] for item in saas_tasks] == ["SaaS task"]


def test_admin_resource_crud_respects_sector_and_archives_processes():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        admin = models.Usuario(
            email="crud-admin@example.test", password_hash="hash",
            nombre_completo="Admin", whatsapp_numero="0000000701",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        firm_owner = models.Usuario(
            email="crud-firm@example.test", password_hash="hash",
            nombre_completo="Firm lawyer", whatsapp_numero="0000000702",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        second_firm_owner = models.Usuario(
            email="crud-firm-second@example.test", password_hash="hash",
            nombre_completo="Second firm lawyer", whatsapp_numero="0000000704",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        saas_owner = models.Usuario(
            email="crud-saas@example.test", password_hash="hash",
            nombre_completo="SaaS lawyer", whatsapp_numero="0000000703",
            rol=models.RolUsuario.ABOGADO, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, firm_owner, second_firm_owner, saas_owner])
        db.flush()

        firm_result = crear_recurso_admin(
            "procesos",
            schemas.AdminResourceCreate(owner_id=firm_owner.id, nombre="Firm process"),
            sector="FIRMA", db=db, admin=admin,
        )
        saas_result = crear_recurso_admin(
            "procesos",
            schemas.AdminResourceCreate(owner_id=saas_owner.id, nombre="SaaS process"),
            sector="SAAS", db=db, admin=admin,
        )
        assert [item["nombre"] for item in listar_inventario_global("procesos", sector="FIRMA", db=db, admin=admin)] == ["Firm process"]
        assert [item["nombre"] for item in listar_inventario_global("procesos", sector="SAAS", db=db, admin=admin)] == ["SaaS process"]

        with pytest.raises(HTTPException) as scope_error:
            actualizar_recurso_admin(
                "procesos", firm_result["id"],
                schemas.AdminResourceUpdate(nombre="Cross-scope edit"),
                sector="SAAS", db=db, admin=admin,
            )
        assert scope_error.value.status_code == 404

        with pytest.raises(HTTPException) as cross_sector_owner_error:
            actualizar_recurso_admin(
                "procesos", firm_result["id"],
                schemas.AdminResourceUpdate(owner_id=saas_owner.id),
                sector="FIRMA", db=db, admin=admin,
            )
        assert cross_sector_owner_error.value.status_code == 400

        actualizar_recurso_admin(
            "procesos", firm_result["id"],
            schemas.AdminResourceUpdate(nombre="Updated firm process"),
            sector="FIRMA", db=db, admin=admin,
        )
        firm_process = db.query(models.Proceso).filter_by(id=firm_result["id"]).one()
        assert firm_process.nombre == "Updated firm process"

        radicado_result = crear_recurso_admin(
            "radicados",
            schemas.AdminResourceCreate(owner_id=firm_owner.id, numero="52345678901234567890123"),
            sector="FIRMA", db=db, admin=admin,
        )
        db.add_all([
            models.ProcesoRadicado(proceso_id=firm_process.id, radicado_id=radicado_result["id"]),
            models.Actuacion(radicado_id=radicado_result["id"], orden=1),
            models.ConsultaRadicado(radicado_id=radicado_result["id"], tipo="MANUAL", estado="COMPLETADA"),
            models.Tarea(usuario_id=firm_owner.id, radicado_id=radicado_result["id"], titulo="Linked task"),
        ])
        db.commit()
        deleted_radicado = eliminar_recurso_admin(
            "radicados", radicado_result["id"], sector="FIRMA", db=db, admin=admin
        )
        assert "eliminado" in deleted_radicado["mensaje"].lower()
        assert db.query(models.Radicado).filter_by(id=radicado_result["id"]).first() is None
        assert db.query(models.ProcesoRadicado).filter_by(radicado_id=radicado_result["id"]).first() is None
        assert db.query(models.Actuacion).filter_by(radicado_id=radicado_result["id"]).count() == 0
        assert db.query(models.ConsultaRadicado).filter_by(radicado_id=radicado_result["id"]).count() == 0
        assert db.query(models.Tarea).filter_by(titulo="Linked task").count() == 0
        assert db.query(models.Proceso).filter_by(id=firm_process.id).one().nombre == "Updated firm process"

        archived = eliminar_recurso_admin("procesos", firm_process.id, sector="FIRMA", db=db, admin=admin)
        assert "archivado" in archived["mensaje"].lower()
        assert db.query(models.Proceso).filter_by(id=firm_process.id).one().archivado_en is not None
        restaurar_proceso_admin(firm_process.id, sector="FIRMA", db=db, admin=admin)
        assert db.query(models.Proceso).filter_by(id=firm_process.id).one().archivado_en is None
        actualizar_recurso_admin(
            "procesos", firm_process.id,
            schemas.AdminResourceUpdate(owner_id=second_firm_owner.id),
            sector="FIRMA", db=db, admin=admin,
        )
        assert db.query(models.Proceso).filter_by(id=firm_process.id).one().abogado_id == second_firm_owner.id
        assert db.query(models.EventoAuditoria).filter(models.EventoAuditoria.actor_id == admin.id).count() >= 5


def test_admin_can_queue_individual_and_sector_radicado_consultations(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    queued_tasks = []

    class FakeTask:
        id = "task-admin-test"

    def enqueue(radicado_id, tipo, consulta_id):
        queued_tasks.append((radicado_id, tipo, consulta_id))
        return FakeTask()

    monkeypatch.setattr("app.routers.admin.tarea_consultar_radicado.delay", enqueue)

    with Session(engine) as db:
        admin = models.Usuario(
            email="query-admin@example.test", password_hash="hash",
            nombre_completo="Admin", whatsapp_numero="0000000901",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        firm_owner = models.Usuario(
            email="query-firm@example.test", password_hash="hash",
            nombre_completo="Firm lawyer", whatsapp_numero="0000000902",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        saas_owner = models.Usuario(
            email="query-saas@example.test", password_hash="hash",
            nombre_completo="SaaS lawyer", whatsapp_numero="0000000903",
            rol=models.RolUsuario.ABOGADO, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, firm_owner, saas_owner])
        db.flush()
        firm_radicado = models.Radicado(numero="62345678901234567890123", usuario_id=firm_owner.id)
        saas_radicado = models.Radicado(numero="72345678901234567890123", usuario_id=saas_owner.id)
        db.add_all([firm_radicado, saas_radicado])
        db.commit()

        result = consultar_todos_radicados_admin(sector="FIRMA", db=db, admin=admin)
        assert result["total"] == 1
        assert result["encoladas"] == 1
        assert queued_tasks[0][0] == firm_radicado.id

        individual = consultar_radicado_admin(
            saas_radicado.id, sector="SAAS", db=db, admin=admin
        )
        assert "encolada" in individual["mensaje"].lower()
        with pytest.raises(HTTPException) as scope_error:
            consultar_radicado_admin(
                firm_radicado.id, sector="SAAS", db=db, admin=admin
            )
        assert scope_error.value.status_code == 404
        assert db.query(models.ConsultaRadicado).count() == 2
        assert db.query(models.EventoAuditoria).filter_by(actor_id=admin.id).count() == 2


def test_firm_process_collaborators_get_scoped_case_access_but_not_team_control():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="team-owner@example.test", password_hash="hash",
            nombre_completo="Matter lead", whatsapp_numero="0000000911",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        colleague = models.Usuario(
            email="team-colleague@example.test", password_hash="hash",
            nombre_completo="Internal colleague", whatsapp_numero="0000000912",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        outsider = models.Usuario(
            email="team-outsider@example.test", password_hash="hash",
            nombre_completo="Unassigned lawyer", whatsapp_numero="0000000913",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        admin = models.Usuario(
            email="team-admin@example.test", password_hash="hash",
            nombre_completo="Platform admin", whatsapp_numero="0000000914",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        saas = models.Usuario(
            email="team-saas@example.test", password_hash="hash",
            nombre_completo="External SaaS lawyer", whatsapp_numero="0000000915",
            rol=models.RolUsuario.ABOGADO, estado=models.EstadoUsuario.ACTIVO,
        )
        client = models.Usuario(
            email="team-client@example.test", password_hash="hash",
            nombre_completo="Assigned client", whatsapp_numero="0000000916",
            rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=owner.id,
        )
        db.add_all([owner, colleague, outsider, admin, saas, client])
        db.flush()
        process = models.Proceso(abogado_id=owner.id, nombre="Firm collaborative matter")
        saas_process = models.Proceso(abogado_id=saas.id, nombre="Private SaaS matter")
        db.add_all([process, saas_process])
        db.flush()
        radicado = models.Radicado(numero="82345678901234567890123", usuario_id=owner.id)
        db.add(radicado)
        db.flush()
        db.add_all([
            models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id),
            models.ProcesoRadicado(proceso_id=process.id, radicado_id=radicado.id),
            models.Actuacion(radicado_id=radicado.id, orden=1, anotacion="Internal-only note"),
            models.Tarea(usuario_id=owner.id, proceso_id=process.id, titulo="Shared case task"),
        ])
        db.commit()

        assignment = asignar_colaborador_proceso(
            process.id,
            schemas.ProcesoColaboradorCreate(abogado_id=colleague.id),
            db=db,
            usuario=owner,
        )
        assert "assigned" not in assignment["mensaje"]
        colleague_processes = listar_procesos(db=db, usuario=colleague)
        assert [item["id"] for item in colleague_processes] == [process.id]
        assert colleague_processes[0]["soy_responsable"] is False
        assert colleague_processes[0]["colaboradores"][0]["id"] == colleague.id

        detail = obtener_proceso_detalle(process.id, db=db, usuario=colleague)
        assert detail["puede_gestionar_equipo"] is False
        assert detail["tareas"][0]["titulo"] == "Shared case task"
        assert [item.id for item in listar_tareas(db=db, usuario_actual=colleague)] == [
            db.query(models.Tarea.id).filter_by(titulo="Shared case task").scalar()
        ]
        client_process = listar_procesos(db=db, usuario=client)[0]
        assert client_process["responsable"]["nombre_completo"] == owner.nombre_completo
        assert client_process["colaboradores"][0]["nombre_completo"] == colleague.nombre_completo
        assert "anotacion" not in client_process["radicados"][0]["actuaciones"][0]

        with pytest.raises(HTTPException) as outsider_error:
            obtener_proceso_detalle(process.id, db=db, usuario=outsider)
        assert outsider_error.value.status_code == 404
        with pytest.raises(HTTPException) as team_control_error:
            asignar_colaborador_proceso(
                process.id,
                schemas.ProcesoColaboradorCreate(abogado_id=outsider.id),
                db=db,
                usuario=colleague,
            )
        assert team_control_error.value.status_code == 403
        with pytest.raises(HTTPException) as saas_assignment_error:
            asignar_colaborador_proceso(
                saas_process.id,
                schemas.ProcesoColaboradorCreate(abogado_id=colleague.id),
                db=db,
                usuario=saas,
            )
        assert saas_assignment_error.value.status_code == 400

        retirar_colaborador_proceso(process.id, colleague.id, db=db, usuario=owner)
        with pytest.raises(HTTPException) as removed_error:
            obtener_proceso_detalle(process.id, db=db, usuario=colleague)
        assert removed_error.value.status_code == 404


def test_client_profile_edits_require_scoped_lawyer_or_admin_approval():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="profile-owner@example.com", password_hash="hash",
            nombre_completo="Client lawyer", whatsapp_numero="0000000921",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        outsider = models.Usuario(
            email="profile-outsider@example.com", password_hash="hash",
            nombre_completo="Other lawyer", whatsapp_numero="0000000922",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        admin = models.Usuario(
            email="profile-admin@example.com", password_hash="hash",
            nombre_completo="Admin", whatsapp_numero="0000000923",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([owner, outsider, admin])
        db.flush()
        client = models.Usuario(
            email="client-before@example.com", password_hash="hash",
            nombre_completo="Client before", whatsapp_numero="0000000924",
            rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=owner.id,
        )
        db.add(client)
        db.commit()

        solicitud = solicitar_edicion_perfil_cliente(
            schemas.SolicitudEdicionPerfilClienteCreate(
                email="client-after@example.com",
                nombre_completo="Client after",
                whatsapp_numero="573000000924",
            ),
            db=db,
            usuario=client,
        )
        assert solicitud["estado"] == "PENDIENTE"
        assert client.email == "client-before@example.com"
        assert len(listar_mis_solicitudes_edicion_perfil(db=db, usuario=client)) == 1
        assert len(listar_solicitudes_edicion_perfil_pendientes(db=db, usuario=owner)) == 1
        assert listar_solicitudes_edicion_perfil_pendientes(db=db, usuario=outsider) == []

        with pytest.raises(HTTPException) as duplicate_pending:
            solicitar_edicion_perfil_cliente(
                schemas.SolicitudEdicionPerfilClienteCreate(
                    email="another@example.com",
                    nombre_completo="Another name",
                    whatsapp_numero="573000000925",
                ),
                db=db,
                usuario=client,
            )
        assert duplicate_pending.value.status_code == 409

        with pytest.raises(HTTPException) as unauthorized_review:
            revisar_solicitud_edicion_perfil(
                solicitud["id"],
                schemas.SolicitudEdicionPerfilClienteRevision(decision="APROBAR"),
                db=db,
                usuario=outsider,
            )
        assert unauthorized_review.value.status_code == 404

        approved = revisar_solicitud_edicion_perfil(
            solicitud["id"],
            schemas.SolicitudEdicionPerfilClienteRevision(decision="APROBAR"),
            db=db,
            usuario=owner,
        )
        assert approved["solicitud"]["estado"] == "APROBADA"
        assert client.email == "client-after@example.com"
        assert client.nombre_completo == "Client after"
        assert client.whatsapp_numero == "573000000924"

        second_request = solicitar_edicion_perfil_cliente(
            schemas.SolicitudEdicionPerfilClienteCreate(
                email="client-after@example.com",
                nombre_completo="Rejected change",
                whatsapp_numero="573000000926",
            ),
            db=db,
            usuario=client,
        )
        rejected = revisar_solicitud_edicion_perfil(
            second_request["id"],
            schemas.SolicitudEdicionPerfilClienteRevision(
                decision="RECHAZAR", comentario="No se puede verificar el cambio."
            ),
            db=db,
            usuario=admin,
        )
        assert rejected["solicitud"]["estado"] == "RECHAZADA"
        assert client.nombre_completo == "Client after"
        assert db.query(models.EventoAuditoria).filter(
            models.EventoAuditoria.accion.in_(
                ["cliente.solicitud_perfil.crear", "cliente.solicitud_perfil.aprobar", "cliente.solicitud_perfil.rechazar"]
            )
        ).count() == 4


def test_reminder_datetimes_are_serialized_with_utc_offset():
    reminder = schemas.RecordatorioTareaOut(
        id=1,
        tarea_id=1,
        canal=models.CanalRecordatorio.WHATSAPP,
        activo=True,
        fecha_hora=datetime(2026, 9, 29, 4, 10),
    )

    serialized = reminder.model_dump(mode="json")
    assert serialized["fecha_hora"] in {
        "2026-09-29T04:10:00+00:00",
        "2026-09-29T04:10:00Z",
    }


def test_due_reminders_send_directly_without_celery_and_only_once(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine)
    monkeypatch.setattr(celery_tasks, "SessionLocal", test_session)
    monkeypatch.setattr(celery_tasks, "whatsapp_habilitado", lambda user: True)
    monkeypatch.setattr(celery_tasks, "plan_whatsapp_habilitado", lambda user, feature: True)
    sent = []
    monkeypatch.setattr(
        celery_tasks,
        "enviar_mensaje_whatsapp",
        lambda numero, mensaje: sent.append((numero, mensaje)) or True,
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

    result = celery_tasks.procesar_recordatorios_tareas()
    assert result["recordatorios_enviados"] == 1
    assert result["errores"] == 0
    assert len(sent) == 1
    with Session(engine) as db:
        assert db.query(models.RecordatorioTarea).filter_by(id=reminder_id).one().enviado_en is not None

    repeated = celery_tasks.procesar_recordatorios_tareas()
    assert repeated["recordatorios_enviados"] == 0
    assert len(sent) == 1


def test_qstash_reminder_endpoint_verifies_signature_and_endpoint(monkeypatch):
    import asyncio

    from starlette.requests import Request

    from app import database

    monkeypatch.setattr(database, "engine", create_engine("sqlite:///:memory:"))
    main = importlib.import_module("app.main")
    monkeypatch.setenv("QSTASH_CURRENT_SIGNING_KEY", "current-test-key")
    monkeypatch.setenv("QSTASH_NEXT_SIGNING_KEY", "next-test-key")
    monkeypatch.setenv("QSTASH_ENDPOINT_URL", "https://example.test/api/cron/recordatorios-tareas")

    verified = {}
    class FakeReceiver:
        def __init__(self, *, current_signing_key, next_signing_key):
            verified["keys"] = (current_signing_key, next_signing_key)

        def verify(self, *, signature, body, url):
            if signature != "valid-test-signature":
                raise ValueError("invalid signature")
            verified["request"] = (signature, body, url)

    monkeypatch.setattr(main, "QStashReceiver", FakeReceiver)
    processed = []

    def process_reminders():
        processed.append(True)
        return {"recordatorios_enviados": 1}

    monkeypatch.setattr(main, "procesar_recordatorios_tareas", process_reminders)

    async def receive():
        return {"type": "http.request", "body": b"{}", "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/cron/recordatorios-tareas",
            "headers": [(b"upstash-signature", b"valid-test-signature")],
            "query_string": b"",
            "server": ("example.test", 443),
            "client": ("127.0.0.1", 12345),
        },
        receive=receive,
    )

    result = asyncio.run(main.ejecutar_recordatorios_qstash(request))

    assert result == {"recordatorios_enviados": 1}
    assert verified["keys"] == ("current-test-key", "next-test-key")
    assert verified["request"] == (
        "valid-test-signature",
        "{}",
        "https://example.test/api/cron/recordatorios-tareas",
    )

    invalid_request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/cron/recordatorios-tareas",
            "headers": [(b"upstash-signature", b"invalid-test-signature")],
            "query_string": b"",
            "server": ("example.test", 443),
            "client": ("127.0.0.1", 12345),
        },
        receive=receive,
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.ejecutar_recordatorios_qstash(invalid_request))
    assert error.value.status_code == 401
    assert processed == [True]


def test_subtask_inherits_scope_and_configures_client_notifications(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    notifications = {"email": 0, "whatsapp": 0}
    monkeypatch.setattr("app.routers.tareas.tarea_enviar_email", type("Task", (), {"delay": staticmethod(lambda *args: notifications.__setitem__("email", notifications["email"] + 1))})())
    monkeypatch.setattr("app.routers.tareas.tarea_enviar_whatsapp", type("Task", (), {"delay": staticmethod(lambda *args: notifications.__setitem__("whatsapp", notifications["whatsapp"] + 1))})())

    with Session(engine) as db:
        owner = models.Usuario(
            email="subtask-owner@example.com", password_hash="hash",
            nombre_completo="Firm lawyer", whatsapp_numero="573000000031",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        client = models.Usuario(
            email="subtask-client@example.com", password_hash="hash",
            nombre_completo="Firm client", whatsapp_numero="573000000032",
            rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
            notificaciones_email=True, notificaciones_whatsapp=True,
        )
        db.add_all([owner, client])
        db.flush()
        process = models.Proceso(abogado_id=owner.id, nombre="Subtask scope process")
        db.add(process)
        db.flush()
        radicado = models.Radicado(numero="92345678901234567890123", usuario_id=owner.id)
        db.add(radicado)
        db.flush()
        actuation = models.Actuacion(radicado_id=radicado.id, orden=1)
        db.add(actuation)
        db.flush()
        db.add_all([
            models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id),
            models.ProcesoRadicado(proceso_id=process.id, radicado_id=radicado.id),
        ])
        parent_task = models.Tarea(
            usuario_id=owner.id,
            titulo="Parent task",
            proceso_id=process.id,
            radicado_id=radicado.id,
            actuacion_id=actuation.id,
            cliente_id=client.id,
        )
        other_radicado = models.Radicado(numero="92345678901234567890124", usuario_id=owner.id)
        db.add_all([parent_task, other_radicado])
        db.commit()

        subtask = crear_subtarea(
            parent_task.id,
            schemas.SubtareaCreate(
                titulo="Client action",
                orden=0,
                asignada_cliente=True,
                cliente_id=client.id,
                notificar_email=False,
                notificar_whatsapp=True,
            ),
            db=db,
            usuario_actual=owner,
        )
        assert subtask.proceso_id == process.id
        assert subtask.radicado_id == radicado.id
        assert subtask.actuacion_id == actuation.id
        assert subtask.asignada_cliente is True
        assert subtask.notificar_email is False
        assert subtask.notificar_whatsapp is True
        assert notifications == {"email": 0, "whatsapp": 1}

        internal_subtask = crear_subtarea(
            parent_task.id,
            schemas.SubtareaCreate(titulo="Internal-only subtask", orden=1),
            db=db,
            usuario_actual=owner,
        )
        client_task = obtener_tarea(parent_task.id, db=db, usuario_actual=client)
        assert [item["id"] for item in client_task["subtareas"]] == [subtask.id]
        assert internal_subtask.id not in [item["id"] for item in client_task["subtareas"]]

        updated = actualizar_subtarea(
            parent_task.id,
            subtask.id,
            schemas.SubtareaUpdate(titulo="Renamed client action"),
            db=db,
            usuario_actual=owner,
        )
        assert updated.proceso_id == process.id
        assert updated.radicado_id == radicado.id
        assert updated.actuacion_id == actuation.id
        assert updated.notificar_whatsapp is True
        assert notifications == {"email": 0, "whatsapp": 1}

        with pytest.raises(HTTPException) as scope_error:
            actualizar_subtarea(
                parent_task.id,
                subtask.id,
                schemas.SubtareaUpdate(radicado_id=other_radicado.id),
                db=db,
                usuario_actual=owner,
            )
        assert scope_error.value.status_code == 400


def test_admin_document_upload_is_sector_scoped_and_audited(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    class FakeR2Client:
        def __init__(self):
            self.upload = None

        def put_object(self, **kwargs):
            self.upload = kwargs

    fake_r2 = FakeR2Client()
    monkeypatch.setattr("app.routers.admin.storage.get_r2_client", lambda: fake_r2)
    monkeypatch.setattr("app.routers.admin.storage.get_r2_bucket", lambda: "test-bucket")

    with Session(engine) as db:
        admin = models.Usuario(
            email="document-admin@example.test", password_hash="hash",
            nombre_completo="Admin", whatsapp_numero="0000000801",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        owner = models.Usuario(
            email="document-owner@example.test", password_hash="hash",
            nombre_completo="Firm lawyer", whatsapp_numero="0000000802",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, owner])
        db.flush()
        client = models.Usuario(
            email="document-client@example.test", password_hash="hash",
            nombre_completo="Client", whatsapp_numero="0000000803",
            rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=owner.id,
        )
        process = models.Proceso(abogado_id=owner.id, nombre="Firm process")
        db.add_all([client, process])
        db.flush()

        result = cargar_documento_admin(
            sector="FIRMA",
            owner_id=owner.id,
            proceso_id=process.id,
            cliente_id=client.id,
            archivo=UploadFile(
                filename="evidence.pdf",
                file=BytesIO(b"%PDF-1.7 test"),
                headers=Headers({"content-type": "application/pdf"}),
            ),
            db=db,
            admin=admin,
        )

        document = db.query(models.DocumentoProceso).filter_by(id=result["id"]).one()
        assert document.nombre_archivo == "evidence.pdf"
        assert document.proceso_id == process.id
        assert document.cliente_id == client.id
        assert fake_r2.upload["Bucket"] == "test-bucket"
        assert fake_r2.upload["Body"] == b"%PDF-1.7 test"
        assert db.query(models.EventoAuditoria).filter_by(
            actor_id=admin.id, accion="admin.inventario.firma.crear_documento"
        ).count() == 1

        with pytest.raises(HTTPException) as scope_error:
            cargar_documento_admin(
                sector="SAAS",
                owner_id=owner.id,
                proceso_id=process.id,
                cliente_id=client.id,
                archivo=UploadFile(
                    filename="cross-scope.pdf",
                    file=BytesIO(b"%PDF-1.7 test"),
                    headers=Headers({"content-type": "application/pdf"}),
                ),
                db=db,
                admin=admin,
            )
        assert scope_error.value.status_code == 400


def test_admin_temporary_document_url_is_short_lived_scoped_and_audited(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    class FakeR2Client:
        def __init__(self):
            self.head = None
            self.presign = None

        def head_object(self, **kwargs):
            self.head = kwargs

        def generate_presigned_url(self, operation, Params, ExpiresIn):
            self.presign = (operation, Params, ExpiresIn)
            return "https://r2.example.test/object?signature=temporary"

    fake_r2 = FakeR2Client()
    monkeypatch.setattr("app.routers.admin.storage.get_r2_client", lambda: fake_r2)
    monkeypatch.setattr("app.routers.admin.storage.get_r2_bucket", lambda: "test-bucket")

    with Session(engine) as db:
        admin = models.Usuario(
            email="presign-admin@example.test", password_hash="hash",
            nombre_completo="Admin", whatsapp_numero="0000000811",
            rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        owner = models.Usuario(
            email="presign-owner@example.test", password_hash="hash",
            nombre_completo="Firm lawyer", whatsapp_numero="0000000812",
            rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        client = models.Usuario(
            email="presign-client@example.test", password_hash="hash",
            nombre_completo="Client", whatsapp_numero="0000000813",
            rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, owner, client])
        db.flush()
        process = models.Proceso(abogado_id=owner.id, nombre="Firm process")
        db.add(process)
        db.flush()
        request = models.SolicitudDocumento(
            proceso_id=process.id,
            cliente_id=client.id,
            titulo="Uploaded test file",
        )
        db.add(request)
        db.flush()
        document = models.DocumentoProceso(
            proceso_id=process.id,
            cliente_id=client.id,
            solicitud_id=request.id,
            nombre_archivo="test.pdf",
            ruta_archivo="procesos/test/clientes/test.pdf",
            mime_type="application/pdf",
        )
        db.add(document)
        db.commit()

        result = emitir_url_temporal_documento_admin(
            document.id, sector="FIRMA", db=db, admin=admin
        )
        assert result["url"] == "https://r2.example.test/object?signature=temporary"
        assert result["expires_in"] == 900
        assert fake_r2.head == {
            "Bucket": "test-bucket",
            "Key": document.ruta_archivo,
        }
        assert fake_r2.presign == (
            "get_object",
            {"Bucket": "test-bucket", "Key": document.ruta_archivo},
            900,
        )
        assert db.query(models.EventoAuditoria).filter_by(
            actor_id=admin.id,
            accion="admin.inventario.firma.emitir_url_temporal",
        ).count() == 1

        with pytest.raises(HTTPException) as scope_error:
            emitir_url_temporal_documento_admin(
                document.id, sector="SAAS", db=db, admin=admin
            )
        assert scope_error.value.status_code == 404


def test_transactional_email_preserves_utf8_accents(monkeypatch):
    from email import policy
    from email.parser import BytesParser

    from app import email_service

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "sender@example.test")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "sender@example.test")
    monkeypatch.setenv("SMTP_PASSWORD", "test-password")
    monkeypatch.setenv("SMTP_STARTTLS", "true")
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
    assert parsed.get_content_charset() == "utf-8"
    assert parsed.get_content().rstrip("\r\n") == body
    assert str(parsed["Subject"]) == "Prueba UTF-8: revisión"


def test_process_can_use_an_assigned_client_created_by_another_lawyer():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)

    with Session(engine) as db:
        owner = models.Usuario(
            email="notify-owner@example.test",
            password_hash="hash",
            nombre_completo="Owner",
            whatsapp_numero="0000000031",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        foreign_owner = models.Usuario(
            email="notify-foreign@example.test",
            password_hash="hash",
            nombre_completo="Foreign Owner",
            whatsapp_numero="0000000032",
            rol=models.RolUsuario.ABOGADO_ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([owner, foreign_owner])
        db.flush()
        foreign_client = models.Usuario(
            email="notify-client@example.test",
            password_hash="hash",
            nombre_completo="Foreign Client",
            whatsapp_numero="0000000033",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado_id=foreign_owner.id,
        )
        process = models.Proceso(abogado_id=owner.id, nombre="Owner process")
        db.add_all([foreign_client, process])
        db.flush()
        db.add(models.ProcesoCliente(proceso_id=process.id, cliente_id=foreign_client.id))
        db.commit()

        assert _cliente_asignado(process, foreign_client.id, db).id == foreign_client.id


def test_whatsapp_api_skips_unconfigured_transport_without_printing_message(monkeypatch, capsys):
    monkeypatch.setattr(whatsapp, "WHATSAPP_API_URL", "")
    monkeypatch.setattr(whatsapp, "WHATSAPP_TOKEN", "")

    assert whatsapp.enviar_mensaje_whatsapp("3001234567", "private message") is False
    assert "private message" not in capsys.readouterr().out


def test_whatsapp_api_uses_configured_http_transport(monkeypatch):
    class Response:
        status_code = 200

    calls = []
    monkeypatch.setattr(whatsapp, "WHATSAPP_API_URL", "https://whatsapp.example.test/send")
    monkeypatch.setattr(whatsapp, "WHATSAPP_TOKEN", "test-token")
    monkeypatch.setattr(
        whatsapp.requests,
        "post",
        lambda url, **kwargs: calls.append((url, kwargs)) or Response(),
    )

    assert whatsapp.enviar_mensaje_whatsapp("3001234567", "hello") is True
    assert calls[0][0] == "https://whatsapp.example.test/send"
    assert calls[0][1]["timeout"] == 10
