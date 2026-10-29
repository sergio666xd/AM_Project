"""Mensajes del formulario de contacto del sitio público.

Hasta ahora el formulario solo armaba un mensaje de WhatsApp y no guardaba
nada. La tabla `solicitudes_contacto` guarda cada mensaje con su estado
(nueva, atendida, descartada) y si el aviso por correo a la firma salió.

Dos plantillas, con las marcas de línea de `app/email_service.py` (skill
`correos-despacho-am`): `SITIO_SOLICITUD_FIRMA` avisa a la firma y
`SITIO_SOLICITUD_ACUSE` le confirma a la persona que su mensaje llegó.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0014"
down_revision: Union[str, Sequence[str], None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADMIN = "https://admin.alejandramunozabogada.com"

PLANTILLAS = [
    {
        "clave": "SITIO_SOLICITUD_FIRMA",
        "nombre": "Mensaje nuevo del sitio web",
        "asunto_email": "{{nombre}} escribió desde el sitio web",
        "cuerpo_email": (
            "# {{nombre}} escribió desde el sitio web\n"
            "Llegó un mensaje nuevo por el formulario de contacto. Es sobre {{area}}.\n"
            "{{mensaje}}\n"
            "! {{accion}}\n"
            "Abrir enlace: {{boton}} | {{enlace}}\n"
            "Abrir enlace: Ver el mensaje en el panel | {{panel}}\n"
            "Nombre: {{nombre}}\n"
            "WhatsApp o teléfono: {{telefono}}\n"
            "Correo: {{correo}}\n"
            "Recibido: {{fecha}}\n"
            "? Cuando le responda, márquelo como atendido en el panel para que no quede pendiente."
        ),
        "cuerpo_whatsapp": (
            "{{nombre}} escribió desde el sitio web sobre {{area}}.\n"
            "{{accion}}\n"
            "Abrir enlace: Ver el mensaje en el panel | {{enlace}}"
        ),
        "titulo_push": "Mensaje nuevo del sitio web",
        "cuerpo_push": "{{nombre}} escribió sobre {{area}}.",
        "variables_ejemplo": {
            "nombre": "Carlos Andrés Mejía", "area": "familia o herencias",
            "mensaje": "«Mi papá falleció en agosto y somos tres hermanos. Queremos saber cómo hacer la sucesión de la casa.»",
            "accion": "Escríbale por WhatsApp al 315 222 3344 o responda este correo: la respuesta le llega directamente.",
            "boton": "Escribirle por WhatsApp", "telefono": "315 222 3344", "correo": "carlos.mejia@correo.co",
            "fecha": "jueves 29 de octubre de 2026, 4:30 p. m.", "panel": f"{ADMIN}/sitio/mensajes?mensaje=12",
        },
        "enlace_ejemplo": "https://wa.me/573152223344",
    },
    {
        "clave": "SITIO_SOLICITUD_ACUSE",
        "nombre": "Confirmación de mensaje recibido en el sitio",
        "asunto_email": "Recibimos su mensaje",
        "cuerpo_email": (
            "# Recibimos su mensaje\n"
            "Hola, {{primer_nombre}}:\n"
            "Gracias por escribirnos. Su mensaje sobre {{area}} ya le llegó a la firma.\n"
            "No tiene que hacer nada más. Le responderemos {{medio}}.\n"
            "Asunto: {{area}}\n"
            "Enviado el: {{fecha}}\n"
            "? {{ayuda}}"
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Recibimos su mensaje sobre {{area}}. Le responderemos {{medio}}."
        ),
        "titulo_push": None,
        "cuerpo_push": None,
        "variables_ejemplo": {
            "nombre": "Carlos Andrés Mejía", "area": "familia o herencias", "medio": "por WhatsApp al 315 222 3344",
            "fecha": "jueves 29 de octubre de 2026, 4:30 p. m.",
            "ayuda": "Si quiere agregar algo, responda este correo o escríbanos por WhatsApp al 350 880 9878.",
        },
        "enlace_ejemplo": "",
    },
]


def upgrade() -> None:
    conexion = op.get_bind()
    inspector = sa.inspect(conexion)
    if not inspector.has_table("solicitudes_contacto"):
        op.create_table(
            "solicitudes_contacto",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("nombre", sa.String(150), nullable=False),
            sa.Column("telefono", sa.String(40), nullable=True),
            sa.Column("correo", sa.String(320), nullable=True),
            sa.Column("area", sa.String(32), nullable=False),
            sa.Column("mensaje", sa.Text(), nullable=False),
            sa.Column("autorizo_datos_en", sa.DateTime(), nullable=False),
            sa.Column("estado", sa.String(16), nullable=False, server_default="NUEVA"),
            sa.Column("nota", sa.Text(), nullable=True),
            sa.Column("aviso_firma", sa.String(16), nullable=False, server_default="PENDIENTE"),
            sa.Column("aviso_error", sa.Text(), nullable=True),
            sa.Column("atendida_por_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
            sa.Column("atendida_en", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("estado IN ('NUEVA', 'ATENDIDA', 'DESCARTADA')", name="ck_solicitud_contacto_estado"),
        )
        op.create_index("ix_solicitud_contacto_estado_fecha", "solicitudes_contacto", ["estado", "created_at"])
    if inspector.has_table("plantillas_mensaje"):
        tabla = sa.table(
            "plantillas_mensaje",
            *(sa.column(nombre) for nombre in ("clave", "nombre", "asunto_email", "cuerpo_email", "cuerpo_whatsapp",
                                               "titulo_push", "cuerpo_push", "enlace_ejemplo", "activo", "updated_at")),
            sa.column("variables_ejemplo", sa.JSON()),
        )
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)
        for plantilla in PLANTILLAS:
            existe = conexion.execute(sa.text("SELECT 1 FROM plantillas_mensaje WHERE clave = :clave"), {"clave": plantilla["clave"]}).first()
            if existe is None:
                op.bulk_insert(tabla, [{**plantilla, "activo": True, "updated_at": ahora}])


def downgrade() -> None:
    for plantilla in PLANTILLAS:
        op.execute(sa.text("DELETE FROM plantillas_mensaje WHERE clave = :clave").bindparams(clave=plantilla["clave"]))
    op.drop_index("ix_solicitud_contacto_estado_fecha", table_name="solicitudes_contacto")
    op.drop_table("solicitudes_contacto")
