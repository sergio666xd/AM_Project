from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.routers.admin.usuarios import (
    actualizar_usuario_admin,
    listar_usuarios,
    obtener_usuario_admin,
)


def test_admin_user_list_separates_platform_admins_and_detail_shows_related_data():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = models.Usuario(
            email="users-admin@example.com", password_hash="hash", nombre_completo="Admin Plataforma",
            whatsapp_numero="3000000066", rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        lawyer = models.Usuario(
            email="users-lawyer@example.com", password_hash="hash", nombre_completo="Abogada Firma",
            whatsapp_numero="3000000067", rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        client = models.Usuario(
            email="users-client@example.com", password_hash="hash", nombre_completo="Cliente Detallado",
            whatsapp_numero="3000000068", rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
            creado_por_abogado=lawyer, ultimo_acceso=datetime(2026, 10, 1, 12, 0),
        )
        db.add_all([admin, lawyer, client])
        db.flush()
        process = models.Proceso(abogado_id=lawyer.id, nombre="Proceso del cliente")
        db.add(process)
        db.flush()
        db.add(models.ProcesoCliente(proceso_id=process.id, cliente_id=client.id))
        task = models.Tarea(
            usuario_id=lawyer.id, cliente_id=client.id, proceso_id=process.id,
            titulo="Entregar soporte", estado=models.EstadoTarea.PENDIENTE,
        )
        request = models.SolicitudDocumento(
            proceso_id=process.id, cliente_id=client.id, titulo="Certificado de ingresos",
        )
        db.add_all([task, request])
        db.flush()
        db.add(models.DocumentoProceso(
            proceso_id=process.id, cliente_id=client.id, solicitud_id=request.id,
            nombre_archivo="certificado.pdf", ruta_archivo="docs/certificado.pdf", mime_type="application/pdf",
        ))
        db.add(models.SolicitudEdicionPerfilCliente(
            cliente_id=client.id, email_solicitado="nuevo@example.com",
            nombre_completo_solicitado="Cliente Nuevo", estado="PENDIENTE",
        ))
        db.add(models.EventoAuditoria(
            actor_id=client.id, accion="perfil.actualizar", tipo_recurso="usuario", recurso_id=str(client.id),
        ))
        db.commit()

        listed = listar_usuarios(incluir_administradores=True, db=db, admin=admin)
        assert {user.rol for user in listed} == {
            models.RolUsuario.ADMIN, models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.CLIENTE,
        }

        detail = obtener_usuario_admin(client.id, admin, db)
        assert detail["ultimo_acceso"] == client.ultimo_acceso
        assert detail["responsable"]["nombre"] == lawyer.nombre_completo
        assert [item["id"] for item in detail["procesos"]] == [process.id]
        assert [item["id"] for item in detail["tareas"]] == [task.id]
        assert detail["documentos"][0]["nombre"] == "certificado.pdf"
        assert {item["tipo"] for item in detail["solicitudes"]} >= {"Edición de perfil", "Documento: Certificado de ingresos"}
        assert detail["actividad"][0]["accion"] == "perfil.actualizar"

        with pytest.raises(HTTPException) as error:
            actualizar_usuario_admin(client.id, schemas.UsuarioAdminUpdate(rol=models.RolUsuario.ABOGADO_ADMIN), db, admin)
        assert error.value.status_code == 400

        unlinked = models.Usuario(
            email="unlinked@example.com", password_hash="hash", nombre_completo="Sin vínculos",
            whatsapp_numero="3000000069", rol=models.RolUsuario.ABOGADO,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(unlinked)
        db.commit()
        updated = actualizar_usuario_admin(
            unlinked.id, schemas.UsuarioAdminUpdate(rol=models.RolUsuario.ABOGADO_ADMIN), db, admin,
        )
        assert updated.rol == models.RolUsuario.ABOGADO_ADMIN
    finally:
        db.close()
        engine.dispose()
