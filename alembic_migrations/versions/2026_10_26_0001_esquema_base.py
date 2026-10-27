"""Esquema base: el estado de la base al adoptar Alembic.

Hasta aquí el esquema se creaba con `Base.metadata.create_all`, las sentencias
de `actualizar_esquema_planes()` y los archivos de `migrations/*.sql`. Esta
revisión no cambia nada: solo marca ese punto de partida. Los cambios de
esquema posteriores van en revisiones nuevas de esta carpeta.

Revision ID: 0001
Revises:
Create Date: 2026-10-26
"""
from typing import Sequence, Union

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
