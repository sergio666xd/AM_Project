"""Plantillas de contrato.

Hasta ahora había un solo contrato (CPS) con campos fijos. Ahora la firma arma
plantillas en Markdown con sus propios campos y listas de personas, todas sobre
el documento base CPS (encabezado, pie, letra y márgenes fijos).

- `plantillas_contrato` guarda las plantillas; se siembra la de CPS.
- `contratos_servicios.plantilla_id` y `plantilla_copia`: la plantilla de origen
  y la copia con la que se redactó cada contrato nuevo.

Los contratos existentes no cambian: siguen siendo contratos CPS de campos fijos.

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.modulos.contratos.plantilla_cps import sembrar

revision: str = "0018"
down_revision: Union[str, Sequence[str], None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conexion = op.get_bind()
    inspector = sa.inspect(conexion)
    if not inspector.has_table("plantillas_contrato"):
        op.create_table(
            "plantillas_contrato",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("nombre", sa.String(160), nullable=False),
            sa.Column("descripcion", sa.Text(), nullable=True),
            sa.Column("cuerpo", sa.Text(), nullable=False),
            sa.Column("campos", sa.JSON(), nullable=False),
            sa.Column("firmas", sa.JSON(), nullable=False),
            sa.Column("creado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("eliminada_en", sa.DateTime(), nullable=True),
        )
    sembrar(conexion)
    columnas = {columna["name"] for columna in inspector.get_columns("contratos_servicios")}
    if "plantilla_id" not in columnas:
        with op.batch_alter_table("contratos_servicios") as tabla:
            tabla.add_column(sa.Column("plantilla_id", sa.Integer(), nullable=True))
            tabla.add_column(sa.Column("plantilla_copia", sa.JSON(), nullable=True))
            tabla.create_foreign_key(
                "fk_contratos_servicios_plantilla", "plantillas_contrato", ["plantilla_id"], ["id"], ondelete="SET NULL",
            )
            tabla.create_index("ix_contratos_servicios_plantilla_id", ["plantilla_id"])


def downgrade() -> None:
    # Los contratos hechos con plantilla pierden su copia: ya no se podrían imprimir.
    with op.batch_alter_table("contratos_servicios") as tabla:
        tabla.drop_index("ix_contratos_servicios_plantilla_id")
        tabla.drop_constraint("fk_contratos_servicios_plantilla", type_="foreignkey")
        tabla.drop_column("plantilla_copia")
        tabla.drop_column("plantilla_id")
    op.drop_table("plantillas_contrato")
