"""Límites de intentos para endpoints públicos, guardados en la base de datos.

En Vercel cada instancia tiene su propia memoria, así que un contador en un
diccionario de Python no limitaba nada; la tabla `intentos_limitados` es
compartida por todas. Las claves se guardan como hash para no almacenar
correos ni direcciones IP en claro.
"""

import hashlib
import os
from datetime import timedelta
from app.timezone import utc_ahora

from fastapi import Request
from sqlalchemy.orm import Session

from app import models

RETENCION = timedelta(days=1)


def clave_intento(ambito: str, valor: str) -> str:
    return hashlib.sha256(f"{ambito}:{valor.strip().lower()}".encode("utf-8")).hexdigest()


def ip_cliente(request: Request) -> str:
    """IP del visitante; detrás del proxy de Vercel la conexión llega desde la red de Vercel."""
    if os.getenv("VERCEL") == "1":
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip
    return request.client.host if request.client else "unknown"


def limite_excedido(db: Session, limites: list[tuple[str, int]], ventana: timedelta) -> bool:
    """Indica si alguna clave alcanzó su máximo de intentos dentro de la ventana."""
    desde = utc_ahora() - ventana
    for clave, maximo in limites:
        usados = (
            db.query(models.IntentoLimitado)
            .filter(models.IntentoLimitado.clave == clave, models.IntentoLimitado.creado_en > desde)
            .count()
        )
        if usados >= maximo:
            return True
    return False


def registrar_intentos(db: Session, claves: list[str]) -> None:
    """Guarda un intento por clave y descarta los que ya no cuentan para ninguna ventana."""
    ahora = utc_ahora()
    db.query(models.IntentoLimitado).filter(
        models.IntentoLimitado.creado_en < ahora - RETENCION
    ).delete(synchronize_session=False)
    db.add_all(models.IntentoLimitado(clave=clave, creado_en=ahora) for clave in claves)
    db.commit()
