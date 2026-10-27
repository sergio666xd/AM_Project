"""Logo propio para el encabezado de los correos de la firma.

`logo_url` sigue siendo el logo general (por ejemplo, el ícono de las
notificaciones Push). La columna nueva queda vacía y los correos usan
`logo_url` mientras no se configure.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA = "configuracion_firma"
COLUMNA = "logo_correo_url"


def upgrade() -> None:
    # Una base anterior a Alembic ya puede tenerla por Base.metadata.create_all.
    columnas = {columna["name"] for columna in sa.inspect(op.get_bind()).get_columns(TABLA)}
    if COLUMNA in columnas:
        return
    op.add_column(TABLA, sa.Column(COLUMNA, sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column(TABLA, COLUMNA)
