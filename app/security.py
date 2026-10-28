import os
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas
PERSISTENT_TOKEN_EXPIRE_MINUTES = 60 * 24 * 15  # 15 días para sesión persistente

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class _EsquemaSesion(OAuth2PasswordBearer):
    """Token del encabezado `Authorization` o, si no viene, de la cookie de sesión.

    Es el mismo token en los dos casos; la cookie es como lo guarda el
    navegador desde la API v2. Los cambios autenticados con la cookie deben
    traer un encabezado propio (ver `app.nucleo.sesion`).
    """

    async def __call__(self, request: Request) -> str:
        from app.nucleo.sesion import MENSAJE_CSRF, falta_encabezado_csrf_v1, token_de_solicitud

        token, _origen = token_de_solicitud(request)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if falta_encabezado_csrf_v1(request):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=MENSAJE_CSRF)
        return token


oauth2_scheme = _EsquemaSesion(tokenUrl="/api/auth/login")


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY o SECRET_KEY no está configurada en el entorno.")
    return secret


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, *, persistent: bool = False) -> str:
    """Crea un JWT.  Si *persistent* es True usa la expiración de 15 días."""
    to_encode = data.copy()
    expire_minutes = PERSISTENT_TOKEN_EXPIRE_MINUTES if persistent else ACCESS_TOKEN_EXPIRE_MINUTES
    ahora = datetime.now(timezone.utc)
    expire = ahora + timedelta(minutes=expire_minutes)
    # `emitido` (milisegundos) permite invalidar de una vez las sesiones
    # emitidas antes de "cerrar sesión en todos los dispositivos"
    # (Usuario.sesiones_cerradas_en).
    to_encode.update({
        "exp": expire,
        "iat": int(ahora.timestamp()),
        "emitido": int(ahora.timestamp() * 1000),
        "persistent": persistent,
    })
    return jwt.encode(to_encode, get_jwt_secret(), algorithm=ALGORITHM)


def decode_token_payload(token: str) -> dict | None:
    """Decodifica un JWT y devuelve el payload, o None si es inválido/expirado."""
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[ALGORITHM])
    except JWTError:
        return None


def token_vigente(payload: dict, usuario: models.Usuario) -> bool:
    """False si el token se emitió antes del último cierre de todas las sesiones."""
    cerradas_en = getattr(usuario, "sesiones_cerradas_en", None)
    if cerradas_en is None:
        return True
    if cerradas_en.tzinfo is None:
        cerradas_en = cerradas_en.replace(tzinfo=timezone.utc)
    try:
        emitido = int(payload.get("emitido") or int(payload.get("iat") or 0) * 1000)
    except (TypeError, ValueError):
        return False
    return emitido > int(cerradas_en.timestamp() * 1000)


def _decode_password_reset_payload(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "password_reset":
        return None
    return payload


def create_password_reset_token(user_id: int, password_hash: str) -> str:
    fingerprint = hmac.new(
        get_jwt_secret().encode(), password_hash.encode(), hashlib.sha256
    ).hexdigest()
    return jwt.encode(
        {
            "sub": str(user_id),
            "purpose": "password_reset",
            "password_fingerprint": fingerprint,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=20),
        },
        get_jwt_secret(),
        algorithm=ALGORITHM,
    )


def password_reset_token_user_id(token: str) -> int | None:
    payload = _decode_password_reset_payload(token)
    if payload is None:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def verify_password_reset_token(token: str, password_hash: str) -> int | None:
    payload = _decode_password_reset_payload(token)
    if payload is None:
        return None
    expected = hmac.new(
        get_jwt_secret().encode(), password_hash.encode(), hashlib.sha256
    ).hexdigest()
    supplied = payload.get("password_fingerprint")
    if not isinstance(supplied, str) or not hmac.compare_digest(supplied, expected):
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def _obtener_usuario_desde_token(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[ALGORITHM])
        usuario_id: str = payload.get("sub")
        # Un enlace de recuperación de contraseña no sirve como sesión.
        if usuario_id is None or payload.get("purpose"):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    usuario = db.query(models.Usuario).filter(models.Usuario.id == int(usuario_id)).first()
    if usuario is None or not token_vigente(payload, usuario):
        raise credentials_exception
    return usuario


def obtener_usuario_actual(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Usuario:
    usuario = _obtener_usuario_desde_token(token, db)
    if usuario.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La cuenta no está activa.")
    if usuario.debe_cambiar_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Debes cambiar la contraseña temporal antes de continuar.")
    return usuario


def obtener_usuario_para_cambio_password(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Usuario:
    usuario = _obtener_usuario_desde_token(token, db)
    if usuario.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="La cuenta no está activa.")
    return usuario
