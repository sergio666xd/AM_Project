import os
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY o SECRET_KEY no está configurada en el entorno.")
    return secret


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, get_jwt_secret(), algorithm=ALGORITHM)


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
        if usuario_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    usuario = db.query(models.Usuario).filter(models.Usuario.id == int(usuario_id)).first()
    if usuario is None:
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
