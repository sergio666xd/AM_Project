"""Cierre de sesión en todos los dispositivos.

`usuarios.sesiones_cerradas_en` guarda el último cierre global; los tokens
emitidos antes de ese instante dejan de valer. Queda vacía para todos.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA = "usuarios"
COLUMNA = "sesiones_cerradas_en"


def upgrade() -> None:
    columnas = {columna["name"] for columna in sa.inspect(op.get_bind()).get_columns(TABLA)}
    if COLUMNA in columnas:
        return
    op.add_column(TABLA, sa.Column(COLUMNA, sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column(TABLA, COLUMNA)
