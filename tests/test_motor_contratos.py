"""El texto de las plantillas de contrato: listas, concordancia y validación."""

from app.modulos.contratos import motor, plantilla_cps

LISTA = {"clave": "contratantes", "etiqueta": "Contratantes", "tipo": "lista", "obligatorio": True,
         "singular": "CONTRATANTE", "rotulo": "EL CONTRATANTE", "firma": True}
INTRO = ("{{#contratantes}}{{.nombre}}, {{.: identificado | identificada}}{{/contratantes}}, "
         "{{contratantes: quien | quienes}} se {{contratantes: denominará | denominarán}} {{contratantes.rotulo}}; "
         "{{contratantes: éste | ésta | éstos | éstas}}")


def _texto(cuerpo: str, personas: list[dict], **datos) -> str:
    plantilla = {"cuerpo": cuerpo, "campos": [LISTA, *datos.pop("campos", [])]}
    resultado = motor.resolver(plantilla, {"listas": {"contratantes": personas}, **datos})
    return "".join(r.get("t", "") for b in resultado.bloques for r in b.get("runs", []))


def _persona(nombre: str, genero: str, ref: str | None = None) -> dict:
    return {"ref": ref or nombre, "nombre": nombre, "genero": genero}


def test_una_persona_concuerda_con_su_genero_y_el_rotulo_es_fijo():
    assert _texto(INTRO, [_persona("Ana Pérez", "f")]) == "Ana Pérez, identificada, quien se denominará EL CONTRATANTE; ésta"
    assert _texto(INTRO, [_persona("Luis Rojas", "m")]) == "Luis Rojas, identificado, quien se denominará EL CONTRATANTE; éste"


def test_varias_personas_van_en_plural_y_en_femenino_solo_si_todas_son_mujeres():
    mujeres = [_persona("Ana Pérez", "f"), _persona("Marta Gil", "f")]
    mezcla = [_persona("Ana Pérez", "f"), _persona("Luis Rojas", "m"), _persona("Marta Gil", "f")]
    assert _texto(INTRO, mujeres) == "Ana Pérez, identificada; y Marta Gil, identificada, quienes se denominarán EL CONTRATANTE; éstas"
    assert _texto(INTRO, mezcla).startswith("Ana Pérez, identificada; Luis Rojas, identificado; y Marta Gil, identificada, quienes")
    assert _texto(INTRO, mezcla).endswith("EL CONTRATANTE; éstos")
    assert _texto("{{contratantes.nombres}}", mezcla) == "Ana Pérez, Luis Rojas y Marta Gil"


def test_lo_que_falta_queda_marcado_y_cuenta():
    plantilla = {"cuerpo": INTRO + " {{objeto}}", "campos": [LISTA, {"clave": "objeto", "etiqueta": "Objeto", "tipo": "parrafo", "obligatorio": True}]}
    datos = {"listas": {"contratantes": [_persona("Ana Pérez", "")]}}
    resultado = motor.resolver(plantilla, datos)
    faltan = [r["t"] for r in resultado.bloques[0]["runs"] if r.get("k") == "falta"]
    assert faltan == ["[identificado / identificada]", "[éste / ésta / éstos / éstas]", "[Objeto]"]
    assert motor.faltantes(plantilla, datos) == ["Falta «Objeto».", "Quedan 3 datos por completar en el texto."]


def test_notificaciones_un_renglon_por_destinatario_con_el_rotulo():
    personas = [{"ref": "a", "nombre": "Ana", "direccion": "Calle 1", "correo": "ana@x.co", "telefono": "300"}, _persona("Luis", "m", "b")]
    otras = [{"ref": "o", "nombre": "Oficina", "direccion": "Cra 2", "correo": "o@x.co", "telefono": "301"}]
    texto = _texto("{{notificaciones}}", personas, notificaciones={"personas": ["a"], "otras": otras})
    assert texto == "EL CONTRATANTE, Ana; dirección: Calle 1; correo: ana@x.co; teléfono: 300Oficina; dirección: Cra 2; correo: o@x.co; teléfono: 301"


def test_campos_propios_con_formato_y_el_abogado_concuerda():
    campos = [{"clave": "valor", "etiqueta": "Valor", "tipo": "pesos"}, {"clave": "inicio", "etiqueta": "Inicio", "tipo": "fecha"},
              {"clave": "cuota", "etiqueta": "Cuota", "tipo": "porcentaje"}]
    texto = _texto("{{valor}} desde el {{inicio}} con {{cuota}}; {{abogado: abogado titulado | abogada titulada}}", [],
                   campos=campos, valores={"valor": "8500000", "inicio": "2026-11-05", "cuota": "20"}, fijos={"abogado.genero": "m"})
    assert texto == "$8.500.000 desde el 5 de noviembre de 2026 con 20 %; abogado titulado"


def test_la_revision_encuentra_codigos_desconocidos_y_bloques_mal_cerrados():
    resultado = motor.revisar("{{honorarios}} {{#contratantes}}{{.nombre}}\n{{/contratantes}} {{.cedula}} {{contratantes: a | b | c}}", [LISTA])
    assert resultado.desconocidos == ["honorarios"]
    assert len(resultado.errores) == 6  # Los dos extremos del bloque, los dos datos sueltos, el código y las formas.


def test_firmantes_un_rotulo_por_lista():
    assert motor.firmantes([LISTA], {"contratantes": [_persona("Ana", "f"), _persona("Luis", "m")]}) == [
        {"rotulo": "EL CONTRATANTE", "nombres": ["Ana", "Luis"]},
    ]


def test_la_plantilla_cps_no_tiene_errores():
    resultado = motor.revisar(plantilla_cps.CUERPO, plantilla_cps.CAMPOS)
    assert resultado.errores == [] and resultado.desconocidos == []
