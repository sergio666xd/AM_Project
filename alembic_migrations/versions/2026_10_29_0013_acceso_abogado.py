"""Correo de acceso de abogados con la contraseña temporal.

La administración crea las cuentas del equipo sin escribir una contraseña: se
genera una temporal y llega en el correo `ABOGADO_CREDENCIALES`, como ya pasa
con `CLIENTE_CREDENCIALES`. Por WhatsApp nunca viaja la contraseña.

Solo se reemplaza el texto que sembró la migración 0011; si la administración
ya lo editó, se respeta.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0013"
down_revision: Union[str, Sequence[str], None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CLAVE = "ABOGADO_CREDENCIALES"

ANTERIOR = {
    "cuerpo_email": (
        "# Su acceso al portal está listo\n"
        "Hola, {{primer_nombre}}:\n"
        "Se creó su cuenta de abogado en el portal de gestión de procesos.\n"
        "Usuario: {{correo}}\n"
        "! Entre con la contraseña temporal que le entregaron. La primera vez, el portal le pedirá cambiarla.\n"
        "Abrir enlace: Entrar al portal | {{enlace}}\n"
        "? No comparta su contraseña con nadie."
    ),
    "cuerpo_whatsapp": (
        "Hola, {{primer_nombre}}.\n"
        "Se creó su cuenta de abogado en el portal del despacho.\n"
        "Usuario: {{correo}}\n"
        "Entre con la contraseña temporal que le entregaron y cámbiela al ingresar.\n"
        "Abrir enlace: Entrar al portal | {{enlace}}"
    ),
}

NUEVO = {
    "cuerpo_email": (
        "# Su acceso al portal está listo\n"
        "Hola, {{primer_nombre}}:\n"
        "Se creó su cuenta de abogado en el portal de gestión de procesos del despacho.\n"
        "Usuario: {{correo}}\n"
        "Contraseña temporal: {{password}}\n"
        "! Entre al portal con estos datos. La primera vez, el portal le pedirá crear una contraseña nueva.\n"
        "Abrir enlace: Entrar al portal | {{enlace}}\n"
        "? No comparta su contraseña con nadie. Si no esperaba este correo, avísenos."
    ),
    "cuerpo_whatsapp": (
        "Hola, {{primer_nombre}}.\n"
        "Se creó su cuenta de abogado en el portal del despacho.\n"
        "Le enviamos a {{correo}} su usuario y una contraseña temporal. Al entrar, cree una nueva.\n"
        "Abrir enlace: Entrar al portal | {{enlace}}"
    ),
}

EJEMPLO_ANTERIOR = {"nombre": "Carolina Ríos", "correo": "abogada@example.com"}
EJEMPLO_NUEVO = {"nombre": "Carolina Ríos", "correo": "abogada@example.com", "password": "Kd7mPq3xRt9w"}


def _cambiar(desde: dict, hacia: dict, ejemplo: dict) -> None:
    conexion = op.get_bind()
    if not sa.inspect(conexion).has_table("plantillas_mensaje"):
        return
    fila = conexion.execute(
        sa.text("SELECT cuerpo_email, cuerpo_whatsapp FROM plantillas_mensaje WHERE clave = :clave"), {"clave": CLAVE}
    ).first()
    if fila is None:
        return
    tabla = sa.table(
        "plantillas_mensaje", sa.column("clave"), sa.column("cuerpo_email"), sa.column("cuerpo_whatsapp"),
        sa.column("variables_ejemplo", sa.JSON()), sa.column("updated_at"),
    )
    valores = {campo: hacia[campo] for campo in hacia if getattr(fila, campo) == desde[campo]}
    if not valores:
        return
    valores.update(variables_ejemplo=ejemplo, updated_at=datetime.now(timezone.utc).replace(tzinfo=None))
    conexion.execute(tabla.update().where(tabla.c.clave == CLAVE).values(**valores))


def upgrade() -> None:
    _cambiar(ANTERIOR, NUEVO, EJEMPLO_NUEVO)


def downgrade() -> None:
    _cambiar(NUEVO, ANTERIOR, EJEMPLO_ANTERIOR)
