"""Recordatorios de solicitudes de documentos.

`solicitudes_documento.ultimo_recordatorio_en` guarda cuándo se le recordó al
cliente lo que falta (a mano o por el Cron diario), y la plantilla
`RECORDATORIO_DOCUMENTO` da el texto del aviso, editable en administración.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-28
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CLAVE = "RECORDATORIO_DOCUMENTO"
PLANTILLA = {
    "clave": CLAVE,
    "nombre": "Recordatorio de documentos pendientes",
    "asunto_email": "Recordatorio: {{solicitud}}",
    "cuerpo_email": (
        "Hola {{nombre}},\n\nTe recordamos que la solicitud de documentos {{solicitud}} del proceso {{proceso}} {{cuando}}."
        "\n\nFalta por entregar:\n{{pendientes}}\n\nPuedes subirlos desde el portal."
    ),
    "cuerpo_whatsapp": (
        "Hola {{nombre}} 👋\n\nTe recordamos que la solicitud *{{solicitud}}* del proceso *{{proceso}}* {{cuando}}."
        "\n\nFalta por entregar:\n{{pendientes}}"
    ),
    "titulo_push": "Recordatorio: {{solicitud}}",
    "cuerpo_push": "La solicitud {{cuando}}. Falta por entregar:\n{{pendientes}}",
    "variables_ejemplo": {
        "nombre": "María Pérez", "proceso": "Proceso de ejemplo", "solicitud": "Documentos para la demanda",
        "cuando": "vence mañana, 30 de octubre", "pendientes": "- Copia de la cédula\n- Registro civil",
        "fecha_limite": "30/10/2026",
    },
    "enlace_ejemplo": "https://panel.alejandramunozabogada.com/procesos/1#documentos",
}


def upgrade() -> None:
    conexion = op.get_bind()
    inspector = sa.inspect(conexion)
    columnas = {columna["name"] for columna in inspector.get_columns("solicitudes_documento")}
    if "ultimo_recordatorio_en" not in columnas:
        op.add_column("solicitudes_documento", sa.Column("ultimo_recordatorio_en", sa.DateTime(), nullable=True))
    if inspector.has_table("plantillas_mensaje"):
        existe = conexion.execute(sa.text("SELECT 1 FROM plantillas_mensaje WHERE clave = :clave"), {"clave": CLAVE}).first()
        if existe is None:
            tabla = sa.table(
                "plantillas_mensaje",
                *(sa.column(nombre) for nombre in ("clave", "nombre", "asunto_email", "cuerpo_email", "cuerpo_whatsapp",
                                                   "titulo_push", "cuerpo_push", "enlace_ejemplo", "activo", "updated_at")),
                sa.column("variables_ejemplo", sa.JSON()),
            )
            op.bulk_insert(tabla, [{**PLANTILLA, "activo": True, "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)}])


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM plantillas_mensaje WHERE clave = :clave").bindparams(clave=CLAVE))
    op.drop_column("solicitudes_documento", "ultimo_recordatorio_en")
