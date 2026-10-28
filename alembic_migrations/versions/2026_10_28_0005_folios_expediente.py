"""Folios del expediente.

Cada registro de un proceso (actuación, documento, mensaje, tarea, aviso,
contrato...) recibe un número de folio estable dentro de su expediente. La
tabla empieza vacía: cada proceso se folia la primera vez que se consulta, y
`procesos.foliado_en` guarda ese momento (lo anterior entra revisado).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLA = "folios_expediente"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "foliado_en" not in {columna["name"] for columna in inspector.get_columns("procesos")}:
        op.add_column("procesos", sa.Column("foliado_en", sa.DateTime(), nullable=True))
    # Una base anterior a Alembic ya puede tenerla por Base.metadata.create_all.
    if inspector.has_table(TABLA):
        return
    op.create_table(
        TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("proceso_id", sa.Integer(), sa.ForeignKey("procesos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(16), nullable=False),
        sa.Column("origen_id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.DateTime(), nullable=False),
        sa.Column("creado_en", sa.DateTime(), nullable=False),
        sa.Column("revisado_en", sa.DateTime(), nullable=True),
        sa.Column("revisado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("proceso_id", "numero", name="uq_folio_proceso_numero"),
        sa.UniqueConstraint("proceso_id", "tipo", "origen_id", name="uq_folio_proceso_origen"),
    )
    op.create_index(f"ix_{TABLA}_proceso_id", TABLA, ["proceso_id"])
    op.create_index(f"ix_{TABLA}_revisado_en", TABLA, ["revisado_en"])


def downgrade() -> None:
    op.drop_table(TABLA)
    op.drop_column("procesos", "foliado_en")
