import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.routers.admin import router
from app.routers.admin.usuarios import cambiar_estado_usuario, eliminar_usuario_admin


def test_static_mass_status_route_precedes_dynamic_user_route():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.routers.admin.comun import verificar_admin

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[verificar_admin] = lambda: models.Usuario(id=1, rol=models.RolUsuario.ADMIN)
    response = TestClient(app).patch("/api/admin/usuarios/estado-masivo", json={})

    # Si la ruta con {usuario_id} atendiera la petición, el error sería por el parámetro de ruta.
    assert response.status_code == 422
    assert all(error["loc"][0] != "path" for error in response.json()["detail"])


def test_admin_can_suspend_reactivate_and_safely_delete_users():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = models.Usuario(
            email="actions-admin@example.com", password_hash="hash", nombre_completo="Admin",
            whatsapp_numero="3000000055", rol=models.RolUsuario.ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        suspendable = models.Usuario(
            email="suspendable@example.com", password_hash="hash", nombre_completo="Cuenta sin historial",
            whatsapp_numero="3000000056", rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO,
        )
        linked = models.Usuario(
            email="linked@example.com", password_hash="hash", nombre_completo="Cuenta con proceso",
            whatsapp_numero="3000000057", rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO,
        )
        db.add_all([admin, suspendable, linked])
        db.flush()
        db.add(models.Proceso(abogado_id=linked.id, nombre="Historial que debe conservarse"))
        db.commit()

        suspended = cambiar_estado_usuario(
            suspendable.id, models.EstadoUsuario.SUSPENDIDO, admin, db,
        )
        assert suspended["estado"] == "SUSPENDIDO"
        reactivated = cambiar_estado_usuario(
            suspendable.id, models.EstadoUsuario.ACTIVO, admin, db,
        )
        assert reactivated["estado"] == "ACTIVO"

        deleted_linked = eliminar_usuario_admin(linked.id, admin, db)
        assert "eliminada" in deleted_linked["mensaje"]
        assert db.query(models.Usuario).filter_by(id=linked.id).first() is None

        deleted = eliminar_usuario_admin(suspendable.id, admin, db)
        assert "eliminada" in deleted["mensaje"]
        assert db.query(models.Usuario).filter_by(id=suspendable.id).first() is None

        with pytest.raises(HTTPException) as protected_admin:
            eliminar_usuario_admin(admin.id, linked, db)
        assert protected_admin.value.status_code == 403
    finally:
        db.close()
        engine.dispose()
