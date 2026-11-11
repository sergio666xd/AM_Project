"""Estado de las plantillas de WhatsApp en Meta.

`plantillas_whatsapp_meta` guarda el último estado que Meta informó de cada
plantilla (aprobada, en revisión, rechazada...) y el motivo, para mostrarlo en
Admin > Plantillas. Lo llena el webhook `message_template_status_update`.

No cambia ningún dato.

Revision ID: 0021
Revises: 0020
Create Date: 2026-11-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0021"
down_revision: Union[str, Sequence[str], None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("plantillas_whatsapp_meta"):
        return
    op.create_table(
        "plantillas_whatsapp_meta",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(512), nullable=False),
        sa.Column("idioma", sa.String(16), nullable=False),
        sa.Column("estado", sa.String(32), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("nombre", "idioma", name="uq_plantilla_whatsapp_meta"),
    )


def downgrade() -> None:
    op.drop_table("plantillas_whatsapp_meta")
