"""Borradores de las páginas del sitio.

La administración puede guardar los cambios de una página sin publicarlos:
`contenido_paginas.borrador` guarda esos cambios y `borrador_en` cuándo se
guardaron. `contenido` pasa a admitir null para las páginas que solo tienen
borrador (el sitio sigue con su texto base).

No cambia ningún dato.

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0019"
down_revision: Union[str, Sequence[str], None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columnas = {columna["name"] for columna in sa.inspect(op.get_bind()).get_columns("contenido_paginas")}
    if "borrador" in columnas:
        return
    with op.batch_alter_table("contenido_paginas") as tabla:
        tabla.add_column(sa.Column("borrador", sa.JSON(), nullable=True))
        tabla.add_column(sa.Column("borrador_en", sa.DateTime(), nullable=True))
        tabla.alter_column("contenido", existing_type=sa.JSON(), nullable=True)


def downgrade() -> None:
    # Las páginas que solo tenían borrador vuelven a su texto base; los borradores se pierden.
    op.execute("DELETE FROM contenido_paginas WHERE contenido IS NULL")
    with op.batch_alter_table("contenido_paginas") as tabla:
        tabla.alter_column("contenido", existing_type=sa.JSON(), nullable=False)
        tabla.drop_column("borrador_en")
        tabla.drop_column("borrador")
