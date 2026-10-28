"""Etapas del proceso.

`procesos.etapa` guarda la etapa actual (demanda, admisión, pruebas, audiencia,
sentencia) y `etapas_proceso` el historial de cambios. Los procesos existentes
quedan sin etapa hasta que alguien de la firma la fije.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA = "etapas_proceso"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "etapa" not in {columna["name"] for columna in inspector.get_columns("procesos")}:
        op.add_column("procesos", sa.Column("etapa", sa.String(16), nullable=True))
    # Una base anterior a Alembic ya puede tenerla por Base.metadata.create_all.
    if inspector.has_table(TABLA):
        return
    op.create_table(
        TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("proceso_id", sa.Integer(), sa.ForeignKey("procesos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("etapa", sa.String(16), nullable=False),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("fecha", sa.DateTime(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index(f"ix_{TABLA}_proceso_id", TABLA, ["proceso_id"])


def downgrade() -> None:
    op.drop_table(TABLA)
    op.drop_column("procesos", "etapa")
