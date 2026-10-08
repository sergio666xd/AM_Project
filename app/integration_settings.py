"""Resolve integration settings from encrypted database values with env fallback."""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

from app import models
from app.database import SessionLocal


def _fernet() -> Fernet:
    secret = os.getenv("INTEGRATION_CREDENTIALS_KEY") or os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY")
    if not secret:
        raise RuntimeError("INTEGRATION_CREDENTIALS_KEY or JWT_SECRET_KEY must be configured")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def _decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise RuntimeError("Could not decrypt integration credentials; verify the encryption key") from exc


def get_integration_settings() -> dict[str, str | int | bool | None]:
    db = SessionLocal()
    try:
        config = db.query(models.ConfiguracionIntegraciones).filter_by(id=1).first()
        return {
            "smtp_host": config.smtp_host if config and config.smtp_host is not None else os.getenv("SMTP_HOST"),
            "smtp_port": config.smtp_port if config and config.smtp_port is not None else int(os.getenv("SMTP_PORT", "587")),
            "smtp_from": config.smtp_from if config and config.smtp_from is not None else os.getenv("SMTP_FROM"),
            "smtp_starttls": config.smtp_starttls if config and config.smtp_starttls is not None else os.getenv("SMTP_STARTTLS", "true").lower() == "true",
            "smtp_user": config.smtp_user if config and config.smtp_user is not None else os.getenv("SMTP_USER"),
            "smtp_password": _decrypt_secret(config.smtp_password_encrypted) if config and config.smtp_password_encrypted is not None else os.getenv("SMTP_PASSWORD"),
            "whatsapp_api_url": _decrypt_secret(config.whatsapp_api_url_encrypted) if config and config.whatsapp_api_url_encrypted is not None else os.getenv("WHATSAPP_API_URL", ""),
            "whatsapp_token": _decrypt_secret(config.whatsapp_token_encrypted) if config and config.whatsapp_token_encrypted is not None else os.getenv("WHATSAPP_TOKEN", ""),
        }
    finally:
        db.close()


def get_firm_settings() -> dict[str, str | bool]:
    """Return the public brand/contact values configured by ADMIN."""
    db = SessionLocal()
    try:
        config = db.query(models.ConfiguracionFirma).filter_by(id=1).first()
        return {
            "nombre": config.nombre if config else "Alejandra Muñoz Abogada y Asociados",
            "correo_contacto": config.correo_contacto if config else "contacto@alejandramunozabogada.com",
            "correo_pqr": config.correo_pqr if config else "pqr@alejandramunozabogada.com",
            "telefono": config.telefono if config else "3508809878",
            "whatsapp": config.whatsapp if config else "3508809878",
            "direccion": config.direccion if config else "Sabaneta, Antioquia, Colombia",
            "logo_url": config.logo_url if config else "https://www.alejandramunozabogada.com/AM_logo_Recurso%202_Landscape_web.png",
            "sitio_web": config.sitio_web if config else "https://www.alejandramunozabogada.com",
            "mostrar_contacto_publico": config.mostrar_contacto_publico if config else True,
        }
    finally:
        db.close()
