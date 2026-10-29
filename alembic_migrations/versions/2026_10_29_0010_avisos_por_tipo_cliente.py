"""Avisos del cliente por tipo y canal.

Hasta ahora el cliente elegía solo correo o WhatsApp para todo. Desde el
portal ya puede elegirlos por grupo de avisos; `avisos_por_tipo` marca que esa
elección (guardada en `preferencias_notificacion`) manda sobre los
interruptores generales. Los clientes que no la han hecho siguen igual.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columnas = {columna["name"] for columna in sa.inspect(op.get_bind()).get_columns("usuarios")}
    if "avisos_por_tipo" not in columnas:
        op.add_column("usuarios", sa.Column("avisos_por_tipo", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("usuarios", "avisos_por_tipo")
