"""Plantillas de tareas y suscripción de calendario.

`plantillas_tarea` guarda los pasos que la firma sigue ante un tipo de actuación
y se siembra con cuatro ejemplos que la firma puede editar o borrar.
`suscripciones_calendario` guarda el hash del enlace .ics de cada usuario.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-28
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AJUSTA = "Ajusta los días al término que fije el auto."
PLANTILLAS = [
    {
        "nombre": "Auto admisorio de la demanda",
        "descripcion": "Notificar al demandado y vigilar el término para contestar. " + AJUSTA,
        "palabras_clave": ["admite la demanda", "admisorio", "admite demanda"],
        "pasos": [
            {"titulo": "Notificar a la parte demandada", "dias_habiles": 3, "prioridad": "ALTA"},
            {"titulo": "Verificar que la notificación quedó surtida", "dias_habiles": 10, "prioridad": "MEDIA"},
            {"titulo": "Revisar si el demandado contestó", "dias_habiles": 25, "prioridad": "MEDIA"},
        ],
    },
    {
        "nombre": "Traslado de excepciones",
        "descripcion": "Estudiar las excepciones y pronunciarse dentro del traslado. " + AJUSTA,
        "palabras_clave": ["traslado", "excepciones"],
        "pasos": [
            {"titulo": "Estudiar las excepciones propuestas", "dias_habiles": 2, "prioridad": "ALTA"},
            {"titulo": "Preparar el pronunciamiento sobre las excepciones", "dias_habiles": 7, "prioridad": "ALTA"},
            {"titulo": "Radicar el escrito ante el juzgado", "dias_habiles": 9, "prioridad": "URGENTE"},
        ],
    },
    {
        "nombre": "Auto que decreta pruebas",
        "descripcion": "Preparar la práctica de las pruebas decretadas. " + AJUSTA,
        "palabras_clave": ["decreta pruebas", "decreta las pruebas", "pruebas"],
        "pasos": [
            {"titulo": "Revisar las pruebas decretadas", "dias_habiles": 2, "prioridad": "MEDIA"},
            {"titulo": "Citar a los testigos y coordinar a los peritos", "dias_habiles": 5, "prioridad": "ALTA"},
            {"titulo": "Preparar los interrogatorios", "dias_habiles": 10, "prioridad": "ALTA"},
        ],
    },
    {
        "nombre": "Fijación de audiencia",
        "descripcion": "Preparar al cliente y el caso para la audiencia. " + AJUSTA,
        "palabras_clave": ["audiencia", "fija fecha", "señala fecha"],
        "pasos": [
            {"titulo": "Avisar al cliente y confirmar su asistencia", "dias_habiles": 1, "prioridad": "ALTA"},
            {"titulo": "Preparar la teoría del caso y los alegatos", "dias_habiles": 5, "prioridad": "ALTA"},
            {"titulo": "Repasar el expediente completo", "dias_habiles": None, "prioridad": "MEDIA"},
        ],
    },
]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # Una base anterior a Alembic ya puede tenerlas por Base.metadata.create_all.
    if not inspector.has_table("plantillas_tarea"):
        tabla = op.create_table(
            "plantillas_tarea",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("nombre", sa.String(120), nullable=False),
            sa.Column("descripcion", sa.Text(), nullable=True),
            sa.Column("palabras_clave", sa.JSON(), nullable=False),
            sa.Column("pasos", sa.JSON(), nullable=False),
            sa.Column("creado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)
        op.bulk_insert(tabla, [{**plantilla, "created_at": ahora, "updated_at": ahora} for plantilla in PLANTILLAS])
    if not inspector.has_table("suscripciones_calendario"):
        op.create_table(
            "suscripciones_calendario",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("ultimo_uso", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("suscripciones_calendario")
    op.drop_table("plantillas_tarea")
