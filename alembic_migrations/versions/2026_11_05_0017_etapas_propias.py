"""Etapas propias de cada proceso.

Hasta ahora un proceso solo podía seguir una plantilla de etapas compartida.
Ahora el abogado puede ajustar las etapas de un proceso (agregar, renombrar,
reordenar o quitar): el proceso pasa a tener su línea propia, que se guarda
como una copia de la plantilla con `plantillas_etapas.proceso_id`.

No cambia ningún dato: los procesos siguen con su plantilla hasta que alguien
ajuste sus etapas.

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0017"
down_revision: Union[str, Sequence[str], None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columnas = {columna["name"] for columna in sa.inspect(op.get_bind()).get_columns("plantillas_etapas")}
    if "proceso_id" in columnas:
        return
    with op.batch_alter_table("plantillas_etapas") as tabla:
        tabla.add_column(sa.Column("proceso_id", sa.Integer(), nullable=True))
        tabla.create_unique_constraint("uq_plantillas_etapas_proceso", ["proceso_id"])
        tabla.create_foreign_key(
            "fk_plantillas_etapas_proceso", "procesos", ["proceso_id"], ["id"], ondelete="CASCADE",
        )


def downgrade() -> None:
    conexion = op.get_bind()
    # Los procesos con etapas propias vuelven a la plantilla predeterminada; su historial se pierde.
    propias = sa.text("SELECT id FROM plantillas_etapas WHERE proceso_id IS NOT NULL")
    etapas = sa.text(f"SELECT id FROM etapas_plantilla WHERE plantilla_id IN ({propias.text})")
    conexion.execute(sa.text(f"DELETE FROM etapas_proceso WHERE etapa_id IN ({etapas.text})"))
    conexion.execute(sa.text(f"UPDATE procesos SET etapa_id = NULL WHERE etapa_id IN ({etapas.text})"))
    conexion.execute(sa.text(f"UPDATE procesos SET plantilla_etapas_id = NULL WHERE plantilla_etapas_id IN ({propias.text})"))
    conexion.execute(sa.text(f"DELETE FROM etapas_plantilla WHERE plantilla_id IN ({propias.text})"))
    conexion.execute(sa.text("DELETE FROM plantillas_etapas WHERE proceso_id IS NOT NULL"))
    with op.batch_alter_table("plantillas_etapas") as tabla:
        tabla.drop_constraint("fk_plantillas_etapas_proceso", type_="foreignkey")
        tabla.drop_constraint("uq_plantillas_etapas_proceso", type_="unique")
        tabla.drop_column("proceso_id")
