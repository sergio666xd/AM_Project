"""Finanzas: datos para pagar, nota de los PDF y plantillas de correo.

`configuracion_correo_financiero` gana `datos_pago` (cuentas bancarias que
salen en la cuenta de cobro) y `nota_documentos` (nota de alcance al pie de
los PDF). Las plantillas `CUENTA_COBRO_EMITIDA` y `RECIBO_PAGO` dan el texto de
los correos que recibe el cliente; se editan en administración.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, Sequence[str], None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PLANTILLAS = [
    {
        "clave": "CUENTA_COBRO_EMITIDA",
        "nombre": "Cuenta de cobro emitida",
        "asunto_email": "Su cuenta de cobro por {{valor}}",
        "cuerpo_email": (
            "Hola, {{nombre}}:\n\nLe enviamos la cuenta de cobro {{numero}} por {{concepto}}.\n\n"
            "Valor a pagar: {{valor}}\n{{plazo}}\n\n{{datos_pago}}\n\n"
            "Adjuntamos el PDF. Cuando pague, envíenos el comprobante por Mensajes en el portal o por WhatsApp."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{nombre}}. Le enviamos la cuenta de cobro {{numero}} por {{concepto}}.\n\n"
            "Valor a pagar: *{{valor}}*\n{{plazo}}\n\nLa encuentra en su correo y en el portal, en Pagos."
        ),
        "titulo_push": "Nueva cuenta de cobro",
        "cuerpo_push": "{{concepto}}: {{valor}}. {{plazo}}",
        "variables_ejemplo": {
            "nombre": "María", "numero": "CC-2026-00012", "concepto": "Honorarios de la sucesión", "valor": "$1.250.000",
            "plazo": "Por favor, págela antes del viernes 20 de noviembre de 2026.", "proceso": "Sucesión de Jorge Pérez",
            "datos_pago": "Puede pagar así:\nBancolombia, cuenta de ahorros 000-000000-00 a nombre de Alejandra Muñoz.",
            "abogado": "Alejandra Muñoz",
        },
        "enlace_ejemplo": "https://panel.alejandramunozabogada.com/pagos#cuenta-12",
    },
    {
        "clave": "RECIBO_PAGO",
        "nombre": "Recibo de pago",
        "asunto_email": "Recibimos su pago de {{valor}}",
        "cuerpo_email": (
            "Hola, {{nombre}}:\n\nRecibimos su pago de {{valor}} del {{fecha}}, por {{metodo}}. Gracias.\n\n"
            "{{abonos}}\n{{saldo}}\n\nAdjuntamos el recibo {{numero_recibo}} en PDF. No tiene que hacer nada más."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{nombre}}. Recibimos su pago de *{{valor}}* del {{fecha}}. Gracias.\n\n{{saldo}}\n\n"
            "El recibo está en su correo y en el portal, en Pagos."
        ),
        "titulo_push": "Recibimos su pago",
        "cuerpo_push": "{{valor}} del {{fecha}}. {{saldo}}",
        "variables_ejemplo": {
            "nombre": "María", "numero_recibo": "RP-2026-00008", "valor": "$500.000", "fecha": "martes 3 de noviembre de 2026",
            "metodo": "transferencia", "abonos": "Lo abonamos a la cuenta de cobro CC-2026-00012 (Honorarios de la sucesión).",
            "saldo": "Su saldo pendiente con nosotros es de $750.000.",
        },
        "enlace_ejemplo": "https://panel.alejandramunozabogada.com/pagos#pago-8",
    },
]


def upgrade() -> None:
    conexion = op.get_bind()
    inspector = sa.inspect(conexion)
    if inspector.has_table("configuracion_correo_financiero"):
        columnas = {c["name"] for c in inspector.get_columns("configuracion_correo_financiero")}
        if "datos_pago" not in columnas:
            op.add_column("configuracion_correo_financiero", sa.Column("datos_pago", sa.Text(), nullable=True))
        if "nota_documentos" not in columnas:
            op.add_column("configuracion_correo_financiero", sa.Column("nota_documentos", sa.Text(), nullable=True))
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
    op.drop_column("configuracion_correo_financiero", "nota_documentos")
    op.drop_column("configuracion_correo_financiero", "datos_pago")
