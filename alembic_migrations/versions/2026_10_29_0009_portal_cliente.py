"""Portal del cliente: glosario de lenguaje claro y folios vistos.

`glosario_actuaciones` guarda cómo se le explica al cliente cada tipo de
actuación de la Rama Judicial; se siembran las más frecuentes y la firma las
corrige después. `vistas_proceso_cliente` recuerda hasta qué folio vio cada
cliente su proceso, para marcarle lo nuevo.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-29
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GLOSARIO = "glosario_actuaciones"
VISTAS = "vistas_proceso_cliente"

# Fragmento del texto del juzgado → lo que lee el cliente. Gana el fragmento más largo;
# artículos y preposiciones no cuentan («Fijación estado» reconoce «Fijación en estado»).
SEMILLA = [
    ("Fijación estado", "El juzgado publicó una decisión del proceso en su lista diaria de notificaciones (el «estado»). Desde ese día corren los plazos."),
    ("Radicación de proceso", "El caso quedó registrado en la Rama Judicial con su número de radicado."),
    ("Reparto", "La demanda se asignó por sorteo a un juzgado, que será el encargado del caso."),
    ("Recepción memorial", "El juzgado recibió un escrito de alguna de las partes y lo agregó al expediente."),
    ("Al despacho", "El expediente pasó al juez para que tome la siguiente decisión."),
    ("Despacho comisorio", "El juzgado encargó a otra autoridad hacer una diligencia, como un secuestro o la entrega de un bien."),
    ("Auto admite demanda", "El juez aceptó la demanda: el proceso empieza formalmente y ahora se le avisa a la otra parte."),
    ("Auto inadmite demanda", "El juez pidió corregir o completar la demanda antes de aceptarla. Su abogada se encarga dentro del plazo."),
    ("Auto rechaza demanda", "El juez no aceptó la demanda. Su abogada revisará los motivos y le explicará qué opciones hay."),
    ("Mandamiento de pago", "El juez ordenó a quien debe el dinero que lo pague. Es el primer paso del cobro por vía judicial."),
    ("Auto de trámite", "El juez tomó una decisión para que el proceso siga avanzando. Todavía no resuelve el fondo del caso."),
    ("Auto interlocutorio", "El juez tomó una decisión importante dentro del proceso, sin resolver todavía el fondo del caso."),
    ("Auto requiere", "El juez pidió a una de las partes que haga algo o aporte información dentro de un plazo."),
    ("Requerimiento", "El juez pidió a una de las partes que haga algo o aporte información dentro de un plazo."),
    ("Pone en conocimiento", "El juez informó a las partes de un documento o un hecho nuevo para que lo conozcan."),
    ("Agrega", "Se agregó un documento al expediente."),
    ("Medidas cautelares", "El juez decidió sobre medidas para proteger bienes o derechos mientras dura el proceso, como un embargo."),
    ("Embargo", "El juez ordenó o resolvió un embargo: un bien o una cuenta queda inmovilizado para garantizar el pago."),
    ("Secuestro", "Se programó o se hizo la diligencia de secuestro: un bien queda al cuidado de una persona nombrada por el juzgado."),
    ("Fija fecha audiencia", "El juzgado programó una audiencia. Su abogada le confirmará la fecha, la hora y si debe asistir."),
    ("Audiencia inicial", "Audiencia en la que el juez escucha a las partes, intenta un acuerdo y define qué pruebas se van a practicar."),
    ("Audiencia de instrucción y juzgamiento", "Audiencia en la que se practican las pruebas, se escuchan los argumentos finales y, por lo general, el juez decide."),
    ("Acta de audiencia", "Se realizó una audiencia y lo ocurrido quedó por escrito en el acta."),
    ("Conciliación", "Espacio para que las partes intenten llegar a un acuerdo con ayuda del juez o de un conciliador."),
    ("Decreta pruebas", "El juez decidió qué pruebas se van a tener en cuenta: documentos, testimonios o peritajes."),
    ("Sentencia", "El juez decidió el caso. Su abogada le explicará qué significa la decisión y si conviene apelar."),
    ("Sentencia de segunda instancia", "El tribunal resolvió la apelación: confirmó, cambió o anuló la decisión del primer juez."),
    ("Recurso de apelación", "Una de las partes pidió que un juez superior revise la decisión."),
    ("Concede recurso", "El juez aceptó enviar la decisión a un juez superior para que la revise."),
    ("Recurso de reposición", "Una de las partes le pidió al mismo juez que reconsidere su decisión."),
    ("Obedézcase y cúmplase", "El expediente volvió al juzgado, que ahora cumple lo que decidió el juez superior."),
    ("Notificación personal", "Se le comunicó directamente a una de las partes una decisión del proceso."),
    ("Notificación por aviso", "Se envió un aviso a una de las partes para darle a conocer el proceso o una decisión."),
    ("Emplazamiento", "El juzgado ordenó llamar públicamente a personas que no se han podido ubicar o que pueden tener interés en el proceso."),
    ("Registro Nacional de Personas Emplazadas", "Se publicó el llamado en el registro oficial de personas emplazadas. Es un paso obligatorio del trámite."),
    ("Traslado", "El juzgado le dio a una de las partes un plazo para conocer un escrito y responderlo."),
    ("Contestación de la demanda", "La otra parte respondió la demanda. Su abogada la revisará y le contará lo importante."),
    ("Excepciones", "La otra parte presentó argumentos para defenderse de la demanda. Su abogada preparará la respuesta."),
    ("Reconoce personería", "El juez reconoció oficialmente a su abogada como su representante en el proceso."),
    ("Declara abierto el proceso de sucesión", "El juez inició formalmente la sucesión."),
    ("Inventarios y avalúos", "Se presenta la lista de bienes y deudas con su valor, para que el juez la apruebe."),
    ("Partición", "Se presentó o se aprobó la repartición de los bienes entre los herederos."),
    ("Liquidación del crédito", "Se calculó cuánto se debe hoy, con intereses, en el proceso de cobro."),
    ("Liquidación de costas", "El juzgado calculó los gastos del proceso que debe pagar la parte que perdió."),
    ("Seguir adelante la ejecución", "El juez ordenó continuar con el cobro: se puede avanzar sobre los bienes embargados."),
    ("Títulos judiciales", "El juzgado ordenó o hizo la entrega de dinero depositado en el proceso."),
    ("Remate", "Se programó o se hizo la venta en subasta de un bien embargado para pagar la deuda."),
    ("Oficio", "El juzgado envió una comunicación oficial a una entidad, como un banco o una oficina de registro, para cumplir una orden."),
    ("Suspende", "El proceso quedó en pausa por un tiempo, por pedido de las partes o por orden del juez."),
    ("Reanuda", "El proceso retoma su curso después de una pausa."),
    ("Nulidad", "Se pidió o se decidió anular una parte del proceso porque no se siguieron las reglas."),
    ("Constancia secretarial", "La secretaría del juzgado dejó una nota en el expediente sobre un plazo o un trámite."),
    ("Desistimiento", "Una de las partes retiró su petición, y el juez lo aceptó o lo está estudiando."),
    ("Terminación", "El juez dio por terminado el proceso. Su abogada le explicará el motivo y lo que sigue."),
    ("Remisión", "El expediente se envió a otro juzgado o tribunal, por ejemplo para resolver una apelación."),
    ("Archivo", "El expediente se archivó porque el proceso terminó o no tiene trámites pendientes."),
]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # Una base anterior a Alembic ya puede tenerlas por Base.metadata.create_all.
    if not inspector.has_table(VISTAS):
        op.create_table(
            VISTAS,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False),
            sa.Column("proceso_id", sa.Integer(), sa.ForeignKey("procesos.id", ondelete="CASCADE"), nullable=False),
            sa.Column("ultimo_folio", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("visto_en", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("usuario_id", "proceso_id", name="uq_vista_proceso_cliente"),
        )
        op.create_index(f"ix_{VISTAS}_usuario_id", VISTAS, ["usuario_id"])
    if inspector.has_table(GLOSARIO):
        return
    tabla = op.create_table(
        GLOSARIO,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patron", sa.String(160), nullable=False, unique=True),
        sa.Column("explicacion", sa.Text(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("actualizado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(), nullable=False),
    )
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    op.bulk_insert(tabla, [
        {"patron": patron, "explicacion": explicacion, "activo": True, "actualizado_en": ahora}
        for patron, explicacion in SEMILLA
    ])


def downgrade() -> None:
    op.drop_table(GLOSARIO)
    op.drop_table(VISTAS)
