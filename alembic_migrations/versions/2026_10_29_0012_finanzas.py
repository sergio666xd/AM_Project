"""Finanzas: datos para pagar, nota de los PDF y plantillas de correo.

`configuracion_correo_financiero` gana `datos_pago` (cuentas bancarias que
salen en la cuenta de cobro) y `nota_documentos` (nota de alcance al pie de
los PDF). Las plantillas `CUENTA_COBRO_EMITIDA` y `RECIBO_PAGO` dan el texto de
los correos que recibe el cliente, con las marcas de línea de
`app/email_service.py` (skill `correos-despacho-am`); se editan en
administración.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012"
down_revision: Union[str, Sequence[str], None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PANEL = "https://panel.alejandramunozabogada.com"

PLANTILLAS = [
    {
        "clave": "CUENTA_COBRO_EMITIDA",
        "nombre": "Cuenta de cobro emitida",
        "asunto_email": "Su cuenta de cobro por {{valor}}",
        "cuerpo_email": (
            "# Le enviamos una cuenta de cobro\n"
            "Hola, {{primer_nombre}}:\n"
            "Le enviamos la cuenta de cobro por {{concepto}}. La encuentra adjunta en PDF y también en el portal.\n"
            "! {{accion}}\n"
            "Abrir enlace: Ver la cuenta de cobro | {{enlace}}\n"
            "Cuenta de cobro: {{numero}}\n"
            "Concepto: {{concepto}}\n"
            "Proceso: {{proceso}}\n"
            "Valor a pagar: {{valor}}\n"
            "Pagar a más tardar: {{vence}}\n"
            "{{datos_pago}}\n"
            "? Cuando pague, envíenos el comprobante por el chat del portal o por WhatsApp."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Le enviamos la cuenta de cobro {{numero}} por {{concepto}}.\n"
            "Valor a pagar: *{{valor}}*\n"
            "Pagar a más tardar: {{vence}}\n"
            "Abrir enlace: Ver la cuenta de cobro | {{enlace}}"
        ),
        "titulo_push": "Nueva cuenta de cobro",
        "cuerpo_push": "{{concepto}}: {{valor}}.",
        "variables_ejemplo": {
            "nombre": "María Pérez", "numero": "CC-2026-00012", "concepto": "Honorarios de la sucesión", "valor": "$1.250.000",
            "accion": "Pague $1.250.000 a más tardar el viernes 20 de noviembre de 2026.",
            "vence": "viernes 20 de noviembre de 2026", "proceso": "Sucesión de Jorge Pérez",
            "datos_pago": "Puede pagar así:\nBancolombia, cuenta de ahorros 000-000000-00 a nombre de Alejandra Muñoz.",
            "abogado": "Alejandra Muñoz",
        },
        "enlace_ejemplo": f"{PANEL}/pagos#cuenta-12",
    },
    {
        "clave": "RECIBO_PAGO",
        "nombre": "Recibo de pago",
        "asunto_email": "Recibimos su pago de {{valor}}",
        "cuerpo_email": (
            "# Recibimos su pago\n"
            "Hola, {{primer_nombre}}:\n"
            "Recibimos su pago de {{valor}}. Gracias. Le adjuntamos el recibo en PDF.\n"
            "{{abonos}}\n"
            "> {{saldo}}\n"
            "Abrir enlace: Ver mis pagos | {{enlace}}\n"
            "Recibo: {{numero_recibo}}\n"
            "Valor recibido: {{valor}}\n"
            "Fecha del pago: {{fecha}}\n"
            "Forma de pago: {{metodo}}\n"
            "? No tiene que hacer nada más. Si algún dato no coincide, escríbanos por el chat del portal."
        ),
        "cuerpo_whatsapp": (
            "Hola, {{primer_nombre}}.\n"
            "Recibimos su pago de *{{valor}}* del {{fecha}}. Gracias.\n"
            "{{saldo}}\n"
            "Abrir enlace: Ver mis pagos | {{enlace}}"
        ),
        "titulo_push": "Recibimos su pago",
        "cuerpo_push": "{{valor}} del {{fecha}}. {{saldo}}",
        "variables_ejemplo": {
            "nombre": "María Pérez", "numero_recibo": "RP-2026-00008", "valor": "$500.000", "fecha": "martes 3 de noviembre de 2026",
            "metodo": "Transferencia", "abonos": "Lo abonamos a la cuenta de cobro CC-2026-00012 (Honorarios de la sucesión).",
            "saldo": "Le queda un saldo pendiente de $750.000.",
        },
        "enlace_ejemplo": f"{PANEL}/pagos#pago-8",
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
