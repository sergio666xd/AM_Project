"""La plantilla inicial: el texto de plantillas/cps/CPS.docx escrito con la sintaxis de plantillas.

Se siembra una sola vez (con la migración 0018 o al arrancar sobre una base nueva). Después
la firma la edita, la duplica o la elimina desde la página Contratos.
"""

from datetime import datetime, timezone

import sqlalchemy as sa

NOMBRE = "CPS · Prestación de servicios profesionales de abogado"
DESCRIPCION = "El contrato de la firma (CPS.docx), con el objeto y los honorarios de cada caso."
FIRMAS = {"abogado": "EL ABOGADO"}
CAMPOS = [
    {"clave": "contratantes", "etiqueta": "Contratantes", "tipo": "lista", "obligatorio": True,
     "singular": "CONTRATANTE", "rotulo": "EL CONTRATANTE", "firma": True},
    {"clave": "objeto", "etiqueta": "Objeto del contrato", "tipo": "parrafo", "obligatorio": True,
     "ayuda": "Lo que el cliente encomienda. Ej.: la representación judicial en el proceso ejecutivo de alimentos contra…"},
    {"clave": "honorarios", "etiqueta": "Honorarios", "tipo": "parrafo", "obligatorio": True,
     "ayuda": "Sigue a «Se fijan honorarios». Ej.: por valor de $2.000.000, pagaderos 50 % a la firma y 50 % al radicar la demanda."},
]
CUERPO = """# Contrato de prestación de servicios profesionales de abogado

Entre los suscritos a saber: {{#contratantes}}{{.nombre}}, mayor de edad, {{.: identificado | identificada}} con cédula de ciudadanía No. {{.cedula}}, {{.: domiciliado | domiciliada}} en {{.ciudad}}{{/contratantes}}, {{contratantes: quien | quienes}} en adelante se {{contratantes: denominará | denominarán}} EL CONTRATANTE; y por otra parte {{abogado.nombre}}, {{abogado: abogado titulado | abogada titulada}}, {{abogado: identificado | identificada}} con cédula de ciudadanía No. {{abogado.documento}} y {{abogado: portador | portadora}} de la Tarjeta Profesional No. {{abogado.tarjeta}} expedida por el Consejo Superior de la Judicatura, {{abogado: domiciliado | domiciliada}} en {{abogado.domicilio}}, quien en adelante se denominará EL ABOGADO, se celebra el presente contrato de prestación de servicios profesionales, regido por las siguientes cláusulas:

**PRIMERA. OBJETO**: EL CONTRATANTE encomienda a EL ABOGADO {{objeto}}

**SEGUNDA. OBLIGACIONES DEL ABOGADO**:
a) Obrar con diligencia en los asuntos a él encomendados.
b) Elaborar, presentar y radicar la demanda con sus anexos conforme a los mandatos del Código General del Proceso.
c) Informar oportunamente al CONTRATANTE sobre el curso del proceso y las decisiones judiciales.
d) Resolver las consultas frente al caso objeto del presente contrato, con la mayor celeridad posible.
e) Guardar reserva profesional sobre la información recibida.
f) Cualquier otro trámite que no esté dentro del objeto del contrato causará honorarios adicionales que deberán ser pactados previamente y documentados ya sea en un otrosí o en CPS independiente.

**TERCERA. OBLIGACIONES DEL CONTRATANTE**:
a) Entregar oportunamente toda la información y los documentos requeridos que EL ABOGADO le solicite.
b) Pagar los honorarios pactados en la cláusula cuarta.
c) Cubrir los demás gastos judiciales y extrajudiciales que demande el proceso (solicitudes, copias, autenticaciones, notificaciones, transporte, etc.).

**CUARTA. HONORARIOS**: Se fijan honorarios {{honorarios}}
**PARÁGRAFO. MEDIOS DISPONIBLES PARA PAGO:** Los siguientes serán los únicos medios de pago que se proveen para que EL CONTRATANTE cumpla con el pago de los honorarios:
Efectivo. En lugar, fecha y hora pactada previamente por las partes con constancia por escrito.
Consignaciones y/o transferencias: Cuentas de ahorros: 1) NU 13344356 a nombre de Yeinny Alejandra Muñoz Marin, C.C. 40328563. Opción de llave: 3008212386. 2) DAVIPLATA 3508809878 a nombre de Yeinny Munoz. 3) NEQUI 3332651575 a nombre de Yeinny Alejandra Muñoz. En caso de elegir este medio de pago, EL CONTRATANTE deberá remitir copia del comprobante al número de WhatsApp 3508809878 para su confirmación.

**QUINTA. Duración**: El presente contrato tendrá vigencia hasta la culminación del proceso.

**SEXTA. Exoneración de Responsabilidad.** EL CONTRATANTE manifiesta en forma libre y voluntaria que exonera de toda responsabilidad a EL ABOGADO por los perjuicios que se puedan originar en el desarrollo del mandato, es sabedor que la gestión adelantada es de medios y no de resultado, además manifiesta que los medios probatorios aportados para el desarrollo del proceso serán suministrados a su cargo y conocimiento.

**SÉPTIMA Delegación.** EL ABOGADO sin aprobación del CONTRATANTE, podrá delegar, encargar, transferir, sustituir y demás, los trámites, autorizaciones y/o poder conferido a quien considere necesario y pertinente durante la vigencia del presente contrato en aras de garantizar diligencia, una debida defensa y representación de los derechos del CONTRATANTE en lo que corresponda al objeto del contrato.
**TERMINACIÓN**: El contrato podrá darse por terminado por mutuo acuerdo, por incumplimiento de alguna de las partes, o por justa causa conforme a la ley.

**OCTAVA. Terminación anormal.** El incumplimiento de las obligaciones nacidas de este acuerdo de voluntades por una de las partes facultará a la otra para dar por terminado el contrato, sin que sea necesario requerimiento de ninguna índole, razón por la cual, las partes acuerdan que el presente contrato PRESTA MÉRITO EJECUTIVO EN CAUSA PROPIA.

**NOVENA Cláusula Penal**: En caso de incumplimiento parcial o total de las cláusulas estipuladas anteriormente por parte de EL CONTRATANTE, así como la terminación injustificada del presente mandato y la revocatoria del respectivo poder, éste deberá pagar a EL ABOGADO lo correspondiente al 50% del valor de las pretensiones presentadas en la demanda.

**DECIMA: Domicilio y Notificaciones:** Acuerdan las partes que el domicilio contractual será el municipio de Medellín y como direcciones para notificaciones se tendrán las siguientes:
{{notificaciones}}
**EL ABOGADO,** {{abogado.nombre}}**:** correo: {{abogado.correo}}; teléfono: {{abogado.telefono}}

Las partes acuerdan que se entiende aceptado el presente contrato con la remisión del este documento al correo electrónico del Contratante y desde el correo electrónico de la Profesional, sin necesidad de que este responda con la aceptación expresa, bastará que dentro de los 3 días calendario siguientes a la remisión del correo con el contrato adjunto el Contratante no presente reparo alguno frente a las cláusulas contractuales. En todo caso para efectos de legalidad del presente se suscribe este contrato de prestación de servicios a los {{fecha.dia}} días del mes de {{fecha.mes}} de {{fecha.anio}}."""

TABLA = sa.table(
    "plantillas_contrato",
    sa.column("id", sa.Integer()), sa.column("nombre"), sa.column("descripcion"), sa.column("cuerpo"),
    sa.column("campos", sa.JSON()), sa.column("firmas", sa.JSON()), sa.column("created_at"), sa.column("updated_at"),
)


def sembrar(conexion) -> None:
    """Crea la plantilla CPS si nunca ha habido plantillas (las eliminadas también cuentan)."""
    if conexion.scalar(sa.select(sa.func.count()).select_from(TABLA)):
        return
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    conexion.execute(TABLA.insert().values(
        nombre=NOMBRE, descripcion=DESCRIPCION, cuerpo=CUERPO, campos=CAMPOS, firmas=FIRMAS, created_at=ahora, updated_at=ahora,
    ))
