"""Actuaciones nuevas pendientes de revisión por usuario y radicado.

Cada consulta que encuentra actuaciones nuevas suma una fila por abogado; la
fila se borra cuando ese abogado abre el detalle del radicado.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA = "novedades_radicado_usuario"


def upgrade() -> None:
    # Una base anterior a Alembic ya puede tenerla por Base.metadata.create_all.
    if sa.inspect(op.get_bind()).has_table(TABLA):
        return
    op.create_table(
        TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("radicado_id", sa.Integer(), sa.ForeignKey("radicados.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actuaciones_nuevas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("desde", sa.DateTime(), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("usuario_id", "radicado_id", name="uq_novedad_radicado_usuario"),
    )
    op.create_index(f"ix_{TABLA}_id", TABLA, ["id"])
    op.create_index(f"ix_{TABLA}_usuario_id", TABLA, ["usuario_id"])
    op.create_index(f"ix_{TABLA}_radicado_id", TABLA, ["radicado_id"])


def downgrade() -> None:
    op.drop_table(TABLA)
