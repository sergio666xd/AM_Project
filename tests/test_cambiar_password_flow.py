import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas, security
from app.routers.auth import cambiar_password, obtener_mi_usuario


def test_cambio_password_forzado_permite_acceso_me_y_retorna_nuevo_token():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        # 1. Crear usuario con debe_cambiar_password = True
        user = models.Usuario(
            email="test-forzado@example.com",
            password_hash=security.hash_password("PasswordTemporal123!"),
            nombre_completo="Usuario Prueba",
            whatsapp_numero="3001234567",
            rol=models.RolUsuario.CLIENTE,
            estado=models.EstadoUsuario.ACTIVO,
            debe_cambiar_password=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # 2. Generar token
        token = security.create_access_token({"sub": str(user.id)})

        # 3. `obtener_usuario_actual` debe rechazarlo con 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            security.obtener_usuario_actual(token=token, db=db)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Debes cambiar la contraseña temporal antes de continuar."

        # 4. `obtener_usuario_para_cambio_password` DEBE permitirlo para /api/auth/me
        usuario_me = security.obtener_usuario_para_cambio_password(token=token, db=db)
        assert usuario_me.id == user.id
        assert usuario_me.email == "test-forzado@example.com"
        assert usuario_me.debe_cambiar_password is True

        # Endpoint /api/auth/me usando usuario_me
        perfil = obtener_mi_usuario(usuario_actual=usuario_me)
        assert perfil["email"] == "test-forzado@example.com"
        assert perfil["debe_cambiar_password"] is True

        # 5. Cambiar contraseña mediante /api/auth/cambiar-password
        resultado = cambiar_password(
            datos=schemas.CambiarPasswordIn(
                password_actual="PasswordTemporal123!",
                password_nueva="PasswordNueva456!",
            ),
            usuario_actual=usuario_me,
            token=token,
            db=db,
        )

        assert resultado["mensaje"] == "Contraseña actualizada con éxito."
        assert resultado["access_token"] is not None
        assert resultado["debe_cambiar_password"] is False
        assert resultado["rol"] == "CLIENTE"
        assert resultado["email"] == "test-forzado@example.com"

        # 6. El usuario en la base de datos ya no tiene debe_cambiar_password
        db.refresh(user)
        assert user.debe_cambiar_password is False
        assert security.verify_password("PasswordNueva456!", user.password_hash)

        # 7. Con el nuevo token, `obtener_usuario_actual` ya no lanza 403
        nuevo_token = resultado["access_token"]
        usuario_autenticado = security.obtener_usuario_actual(token=nuevo_token, db=db)
        assert usuario_autenticado.id == user.id
        assert usuario_autenticado.debe_cambiar_password is False
