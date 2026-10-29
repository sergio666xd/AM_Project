"""Plantillas de etapas.

Hasta ahora todos los procesos tenían las mismas cinco etapas fijas
(demanda, admisión, pruebas, audiencia, sentencia) guardadas como texto.
Ahora la firma arma plantillas con sus propias etapas, cada una con una
explicación en palabras sencillas para el cliente.

- `plantillas_etapas` y `etapas_plantilla` guardan las plantillas.
- Se siembra «General», predeterminada, con las cinco etapas de siempre.
- Todos los procesos pasan a «General»; `procesos.etapa` y
  `etapas_proceso.etapa` (texto) se reemplazan por `etapa_id`.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015"
down_revision: Union[str, Sequence[str], None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (clave anterior, nombre, explicación); el orden es el de la línea.
ETAPAS = (
    ("demanda", "Demanda", "Se prepara y se presenta la demanda o la solicitud ante el juzgado."),
    ("admision", "Admisión", "El juzgado revisa la demanda y decide si la acepta; después se le avisa a la otra parte."),
    ("pruebas", "Pruebas", "Cada parte presenta sus pruebas, como documentos, testigos o peritajes, para demostrar lo que dice."),
    ("audiencia", "Audiencia", "El juez reúne a las partes para escucharlas, revisar las pruebas y, si se puede, buscar un acuerdo."),
    ("sentencia", "Sentencia", "El juez decide el caso. Si una parte no está de acuerdo, puede apelar en un plazo corto."),
)


def _columnas(inspector, tabla: str) -> set[str]:
    return {columna["name"] for columna in inspector.get_columns(tabla)}


def upgrade() -> None:
    conexion = op.get_bind()
    inspector = sa.inspect(conexion)
    if not inspector.has_table("plantillas_etapas"):
        op.create_table(
            "plantillas_etapas",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("nombre", sa.String(120), nullable=False),
            sa.Column("descripcion", sa.Text(), nullable=True),
            sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("predeterminada", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if not inspector.has_table("etapas_plantilla"):
        op.create_table(
            "etapas_plantilla",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("plantilla_id", sa.Integer(), sa.ForeignKey("plantillas_etapas.id", ondelete="CASCADE"), nullable=False),
            sa.Column("nombre", sa.String(80), nullable=False),
            sa.Column("explicacion", sa.Text(), nullable=True),
            sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
        op.create_index("ix_etapas_plantilla_plantilla_id", "etapas_plantilla", ["plantilla_id"])

    plantillas = sa.table("plantillas_etapas", sa.column("id", sa.Integer()), sa.column("nombre"), sa.column("descripcion"),
                          sa.column("activa"), sa.column("predeterminada"), sa.column("created_at"), sa.column("updated_at"))
    etapas = sa.table("etapas_plantilla", sa.column("id", sa.Integer()), sa.column("plantilla_id"), sa.column("nombre"),
                      sa.column("explicacion"), sa.column("orden"), sa.column("activa"))
    general_id = conexion.scalar(sa.select(plantillas.c.id).where(plantillas.c.predeterminada.is_(True)).limit(1))
    if general_id is None:
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)
        conexion.execute(plantillas.insert().values(
            nombre="General", descripcion="Las cinco etapas de un proceso judicial.", activa=True, predeterminada=True,
            created_at=ahora, updated_at=ahora,
        ))
        general_id = conexion.scalar(sa.select(sa.func.max(plantillas.c.id)))
        conexion.execute(etapas.insert(), [
            {"plantilla_id": general_id, "nombre": nombre, "explicacion": explicacion, "orden": i, "activa": True}
            for i, (_, nombre, explicacion) in enumerate(ETAPAS)
        ])
    por_nombre = dict(conexion.execute(sa.select(etapas.c.nombre, etapas.c.id).where(etapas.c.plantilla_id == general_id)).all())
    por_clave = {clave: por_nombre[nombre] for clave, nombre, _ in ETAPAS if nombre in por_nombre}

    columnas_proceso = _columnas(inspector, "procesos")
    if "plantilla_etapas_id" not in columnas_proceso:
        op.add_column("procesos", sa.Column("plantilla_etapas_id", sa.Integer(), nullable=True))
    if "etapa_id" not in columnas_proceso:
        op.add_column("procesos", sa.Column("etapa_id", sa.Integer(), nullable=True))
    procesos = sa.table("procesos", sa.column("id"), sa.column("etapa"), sa.column("etapa_id"), sa.column("plantilla_etapas_id"))
    conexion.execute(procesos.update().where(procesos.c.plantilla_etapas_id.is_(None)).values(plantilla_etapas_id=general_id))
    if "etapa" in columnas_proceso:
        for clave, etapa_id in por_clave.items():
            conexion.execute(procesos.update().where(procesos.c.etapa == clave).values(etapa_id=etapa_id))
        with op.batch_alter_table("procesos") as tabla:
            tabla.drop_column("etapa")
    if conexion.dialect.name == "postgresql":
        existentes = {fk["name"] for fk in inspector.get_foreign_keys("procesos")}
        if "fk_procesos_plantilla_etapas" not in existentes:
            op.create_foreign_key("fk_procesos_plantilla_etapas", "procesos", "plantillas_etapas",
                                  ["plantilla_etapas_id"], ["id"], ondelete="SET NULL")
        if "fk_procesos_etapa" not in existentes:
            op.create_foreign_key("fk_procesos_etapa", "procesos", "etapas_plantilla", ["etapa_id"], ["id"], ondelete="SET NULL")

    columnas_historial = _columnas(inspector, "etapas_proceso")
    if "etapa" in columnas_historial:
        if "etapa_id" not in columnas_historial:
            op.add_column("etapas_proceso", sa.Column("etapa_id", sa.Integer(), nullable=True))
        historial = sa.table("etapas_proceso", sa.column("etapa"), sa.column("etapa_id"))
        for clave, etapa_id in por_clave.items():
            conexion.execute(historial.update().where(historial.c.etapa == clave).values(etapa_id=etapa_id))
        # Un valor que no era ninguna de las cinco etapas no tiene a qué etapa pasar.
        conexion.execute(historial.delete().where(historial.c.etapa_id.is_(None)))
        with op.batch_alter_table("etapas_proceso") as tabla:
            tabla.drop_column("etapa")
            tabla.alter_column("etapa_id", existing_type=sa.Integer(), nullable=False)
            tabla.create_foreign_key("fk_etapas_proceso_etapa", "etapas_plantilla", ["etapa_id"], ["id"])


def downgrade() -> None:
    conexion = op.get_bind()
    nombre_a_clave = {nombre: clave for clave, nombre, _ in ETAPAS}
    etapas = dict(conexion.execute(sa.text("SELECT id, nombre FROM etapas_plantilla")).all())
    op.add_column("procesos", sa.Column("etapa", sa.String(16), nullable=True))
    op.add_column("etapas_proceso", sa.Column("etapa", sa.String(16), nullable=True))
    for etapa_id, nombre in etapas.items():
        clave = nombre_a_clave.get(nombre)
        if clave:
            conexion.execute(sa.text("UPDATE procesos SET etapa = :c WHERE etapa_id = :i"), {"c": clave, "i": etapa_id})
            conexion.execute(sa.text("UPDATE etapas_proceso SET etapa = :c WHERE etapa_id = :i"), {"c": clave, "i": etapa_id})
    conexion.execute(sa.text("DELETE FROM etapas_proceso WHERE etapa IS NULL"))
    with op.batch_alter_table("etapas_proceso") as tabla:
        tabla.drop_constraint("fk_etapas_proceso_etapa", type_="foreignkey")
        tabla.drop_column("etapa_id")
        tabla.alter_column("etapa", existing_type=sa.String(16), nullable=False)
    with op.batch_alter_table("procesos") as tabla:
        if conexion.dialect.name == "postgresql":
            tabla.drop_constraint("fk_procesos_etapa", type_="foreignkey")
            tabla.drop_constraint("fk_procesos_plantilla_etapas", type_="foreignkey")
        tabla.drop_column("etapa_id")
        tabla.drop_column("plantilla_etapas_id")
    op.drop_table("etapas_plantilla")
    op.drop_table("plantillas_etapas")
