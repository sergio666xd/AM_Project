"""WhatsApp Cloud API de Meta.

`entregas_notificacion` guarda la plantilla de Meta con que sale cada aviso
por WhatsApp (`datos_whatsapp`), el id del mensaje en Meta y el último estado
que informó el webhook (enviado, entregado, leído o fallido).
`mensajes_whatsapp_recibidos` guarda lo que las personas escriben al número
del despacho.

No cambia ningún dato.

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0020"
down_revision: Union[str, Sequence[str], None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columnas = {columna["name"] for columna in inspector.get_columns("entregas_notificacion")}
    if "datos_whatsapp" not in columnas:
        with op.batch_alter_table("entregas_notificacion") as tabla:
            tabla.add_column(sa.Column("datos_whatsapp", sa.JSON(), nullable=True))
            tabla.add_column(sa.Column("proveedor_mensaje_id", sa.String(128), nullable=True))
            tabla.add_column(sa.Column("estado_proveedor", sa.String(20), nullable=True))
            tabla.add_column(sa.Column("estado_proveedor_en", sa.DateTime(), nullable=True))
            tabla.create_index("ix_entregas_notificacion_proveedor_mensaje_id", ["proveedor_mensaje_id"])
    if not inspector.has_table("mensajes_whatsapp_recibidos"):
        op.create_table(
            "mensajes_whatsapp_recibidos",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("mensaje_id", sa.String(128), nullable=False),
            sa.Column("telefono", sa.String(32), nullable=False),
            sa.Column("nombre_perfil", sa.String(150), nullable=True),
            sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
            sa.Column("tipo", sa.String(32), nullable=False),
            sa.Column("texto", sa.Text(), nullable=True),
            sa.Column("recibido_en", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("mensaje_id", name="uq_mensaje_whatsapp_recibido"),
        )
        op.create_index("ix_mensaje_whatsapp_recibido_telefono", "mensajes_whatsapp_recibidos", ["telefono", "recibido_en"])
        op.create_index("ix_mensajes_whatsapp_recibidos_usuario_id", "mensajes_whatsapp_recibidos", ["usuario_id"])


def downgrade() -> None:
    op.drop_table("mensajes_whatsapp_recibidos")
    with op.batch_alter_table("entregas_notificacion") as tabla:
        tabla.drop_index("ix_entregas_notificacion_proveedor_mensaje_id")
        tabla.drop_column("estado_proveedor_en")
        tabla.drop_column("estado_proveedor")
        tabla.drop_column("proveedor_mensaje_id")
        tabla.drop_column("datos_whatsapp")
