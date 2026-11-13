"""El texto de una plantilla de contrato, resuelto con los datos del contrato.

Una plantilla es Markdown sencillo con códigos entre llaves dobles:

- `{{proceso.nombre}}`, `{{abogado.nombre}}`, `{{fecha.hoy}}`…: datos fijos.
- `{{objeto}}`: un campo propio de la plantilla.
- `{{notificaciones}}`: un renglón por destinatario elegido en el formulario.
- `{{#contratantes}} … {{/contratantes}}`: se repite por cada persona de la lista;
  adentro, `{{.nombre}}` y los demás datos de esa persona, y `{{.: m | f}}` concuerda
  con su género.
- `{{contratantes: singular | plural}}` o con cuatro formas (m. sing. | f. sing. |
  m. pl. | f. pl.) concuerda con el grupo: femenino solo si todas son mujeres.
- `{{abogado: m | f}}` concuerda con el género del abogado responsable.
- `{{contratantes.rotulo}}` es el rótulo fijo (EL CONTRATANTE) y
  `{{contratantes.nombres}}` los nombres unidos con «, » y « y ».

El resultado es una lista de bloques con trozos de texto (`Run`), la misma que arma
`frontend-saas/lib/contratos/motor.ts` para la vista previa; el PDF se dibuja a partir
de ella. Si se cambia una regla aquí, se cambia también allá.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

# ---- Datos fijos -----------------------------------------------------------

CAMPOS_FIJOS: dict[str, str] = {
    "notificaciones": "Destinatarios de las notificaciones",
    "proceso.nombre": "Nombre del proceso",
    "proceso.radicado": "Radicado",
    "proceso.despacho": "Despacho",
    "abogado.nombre": "Nombre del abogado",
    "abogado.documento": "Cédula del abogado",
    "abogado.tarjeta": "Tarjeta profesional",
    "abogado.correo": "Correo del abogado",
    "abogado.telefono": "Teléfono del abogado",
    "abogado.domicilio": "Domicilio del abogado",
    "fecha.hoy": "Fecha de hoy, en letras",
    "fecha.dia": "Día",
    "fecha.mes": "Mes en letras",
    "fecha.anio": "Año",
    "fecha.ciudad": "Ciudad de firma",
}
PREFIJOS_RESERVADOS = ("proceso", "abogado", "fecha", "notificaciones")
DATOS_PERSONA = {
    "nombre": "Nombre", "cedula": "Cédula", "ciudad": "Ciudad", "direccion": "Dirección", "correo": "Correo", "telefono": "Teléfono",
}
TIPOS_CAMPO = ("texto", "parrafo", "numero", "pesos", "porcentaje", "fecha", "opciones", "lista")
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")

RE_TOKEN = re.compile(r"\{\{#(\w+)\}\}([\s\S]*?)\{\{/\1\}\}|\{\{([^{}]+)\}\}|\*\*(.+?)\*\*|\*([^*\n]+?)\*")
RE_ENFASIS = re.compile(r"\*\*(.+?)\*\*|\*([^*\n]+?)\*")


def fecha_en_letras(dia: date) -> str:
    return f"{dia.day} de {MESES[dia.month - 1]} de {dia.year}"


def fijos_de_fecha(dia: date) -> dict[str, str]:
    """Los códigos de fecha del contrato para ese día."""
    return {"fecha.hoy": fecha_en_letras(dia), "fecha.dia": str(dia.day), "fecha.mes": MESES[dia.month - 1], "fecha.anio": str(dia.year)}


def pesos(valor: int) -> str:
    return "$" + f"{valor:,}".replace(",", ".")


def formatear(tipo: str, valor: str | None) -> str:
    """El valor de un campo propio tal como va en el texto."""
    valor = (valor or "").strip()
    if not valor:
        return ""
    if tipo == "pesos":
        digitos = re.sub(r"\D", "", valor)
        return pesos(int(digitos)) if digitos and int(digitos) else ""
    if tipo == "porcentaje":
        return f"{valor} %"
    if tipo == "fecha":
        try:
            return fecha_en_letras(date.fromisoformat(valor))
        except ValueError:
            return valor
    return valor


# ---- Resultado ---------------------------------------------------------------

Run = dict  # {"t": str, "b"?: True, "i"?: True, "k"?: "falta" | "error" | "campo" | "propio" | "lista", "br"?: True}


@dataclass
class Resultado:
    bloques: list[dict] = field(default_factory=list)
    errores: list[str] = field(default_factory=list)
    desconocidos: list[str] = field(default_factory=list)

    @property
    def faltan(self) -> int:
        """Cuántos datos marcados como faltantes quedaron en el texto."""
        total = 0
        for bloque in self.bloques:
            for runs in [bloque.get("runs", []), *bloque.get("items", [])]:
                total += sum(1 for r in runs if r.get("k") == "falta")
        return total


def _estilo(runs: list[Run], **marca) -> list[Run]:
    return [{**r, **marca} if not r.get("br") else r for r in runs]


def _unir(partes: list[list[Run]], sep: str, ultimo: str) -> list[Run]:
    salida: list[Run] = []
    for i, parte in enumerate(partes):
        if i:
            salida.append({"t": ultimo if i == len(partes) - 1 else sep})
        salida.extend(parte)
    return salida


def _texto_con_enfasis(texto: str, extra: dict | None = None) -> list[Run]:
    """Un valor escrito en el formulario: respeta **negrita**, *cursiva* y los saltos de línea; nunca resuelve códigos."""
    salida: list[Run] = []
    for i, linea in enumerate(texto.split("\n")):
        if i:
            salida.append({"t": "", "br": True})
        ultimo = 0
        for m in RE_ENFASIS.finditer(linea):
            if m.start() > ultimo:
                salida.append({"t": linea[ultimo:m.start()]})
            salida.append({"t": m.group(1), "b": True} if m.group(1) is not None else {"t": m.group(2), "i": True})
            ultimo = m.end()
        if ultimo < len(linea):
            salida.append({"t": linea[ultimo:]})
    return [{**r, **(extra or {})} for r in salida if r.get("t") or r.get("br")]


def _todas_f(personas: list[dict]) -> bool:
    return bool(personas) and all(p.get("genero") == "f" for p in personas)


def _forma(formas: list[str], personas: list[dict]) -> str:
    plural, femenino = len(personas) > 1, _todas_f(personas)
    if len(formas) == 4:
        return formas[(2 if plural else 0) + (1 if femenino else 0)]
    return formas[1 if plural else 0]


class Contexto:
    """Resuelve los códigos. `modo` "plantilla" muestra etiquetas; "contrato" usa los datos."""

    def __init__(self, *, modo: str, campos: list[dict], valores: dict | None = None, listas: dict | None = None,
                 notificaciones: list[dict] | None = None, genero_abogado: str = ""):
        self.modo = modo
        self.defs = {c["clave"]: c for c in campos if c.get("tipo") == "lista"}
        self.propios = {c["clave"]: c for c in campos if c.get("tipo") != "lista"}
        self.valores = valores or {}
        self.listas = listas or {}
        self.notificaciones = notificaciones
        self.genero_abogado = genero_abogado
        self.errores: list[str] = []
        self.desconocidos: list[str] = []

    @property
    def previa(self) -> bool:
        return self.modo == "plantilla"

    def _error(self, mensaje: str, texto: str | None = None) -> list[Run]:
        self.errores.append(mensaje)
        return [{"t": texto or mensaje, "k": "error"}]

    @staticmethod
    def _falta(texto: str) -> list[Run]:
        return [{"t": f"[{texto}]", "k": "falta"}]

    def bloque(self, nombre: str, interior: str) -> list[Run]:
        definicion = self.defs.get(nombre)
        if definicion is None:
            return self._error(f"No hay una lista «{nombre}».", f"{{{{#{nombre}}}}}")
        if self.previa:
            singular = (definicion.get("singular") or "persona").lower()
            return [*self.inline(interior, {"__def": definicion}), {"t": " "}, {"t": f"↻ por cada {singular}", "k": "lista"}]
        personas = self.listas.get(nombre) or []
        if not personas:
            return self._falta(definicion.get("etiqueta") or nombre)
        return _unir([self.inline(interior, persona) for persona in personas], "; ", "; y ")

    def etiqueta(self, codigo: str, persona: dict | None) -> list[Run]:
        t = codigo.strip()
        if t.startswith("#") or t.startswith("/"):
            return self._error(f"El bloque {{{{{t}}}}} no abre y cierra en el mismo párrafo.", f"{{{{{t}}}}}")
        if ":" in t:
            ref, resto = t.split(":", 1)
            ref = ref.strip()
            formas = [f.strip() for f in resto.split("|")]
            if ref == ".":
                if persona is None:
                    return self._error("{{.: …}} solo va dentro de un bloque {{#lista}}.", f"{{{{{t}}}}}")
                if len(formas) != 2:
                    return self._error(f"{{{{{t}}}}} debe tener 2 formas: masculino | femenino.", f"{{{{{t}}}}}")
                if "__def" in persona:
                    return [{"t": " / ".join(formas), "k": "campo"}]
                if not persona.get("genero"):
                    return self._falta(" / ".join(formas))
                return [{"t": formas[1 if persona["genero"] == "f" else 0]}]
            if ref == "abogado":
                if len(formas) != 2:
                    return self._error(f"{{{{{t}}}}} debe tener 2 formas: masculino | femenino.", f"{{{{{t}}}}}")
                if self.previa:
                    return [{"t": " / ".join(formas), "k": "campo"}]
                return [{"t": formas[0 if self.genero_abogado == "m" else 1]}]
            definicion = self.defs.get(ref)
            if definicion is None:
                return self._error(f"No hay una lista «{ref}».", f"{{{{{t}}}}}")
            if len(formas) not in (2, 4):
                return self._error(f"{{{{{t}}}}} debe tener 2 o 4 formas.", f"{{{{{t}}}}}")
            if self.previa:
                return [{"t": " / ".join(formas), "k": "campo"}]
            personas = self.listas.get(ref) or []
            if not personas or (len(formas) == 4 and any(not p.get("genero") for p in personas)):
                return self._falta(" / ".join(formas))
            return [{"t": _forma(formas, personas)}]
        if t.startswith("."):
            dato = t[1:]
            if persona is None:
                return self._error(f"{{{{{t}}}}} solo va dentro de un bloque {{{{#lista}}}}.", f"{{{{{t}}}}}")
            if dato not in DATOS_PERSONA:
                return self._error(f"Las personas no tienen el dato «{dato}».", f"{{{{{t}}}}}")
            if "__def" in persona:
                singular = (persona["__def"].get("singular") or "persona").lower()
                return [{"t": f"{DATOS_PERSONA[dato]} de cada {singular}", "k": "campo"}]
            valor = (persona.get(dato) or "").strip()
            return [{"t": valor}] if valor else self._falta(DATOS_PERSONA[dato])
        base, _, sub = t.partition(".")
        if base in self.defs:
            definicion = self.defs[base]
            sub = sub.lower()
            if sub not in ("rotulo", "nombres"):
                return self._error(f"{{{{{t}}}}}: use {{{{#{base}}}}}…{{{{/{base}}}}}, .rotulo o .nombres.", f"{{{{{t}}}}}")
            if sub == "rotulo":
                return [{"t": definicion.get("rotulo") or ""}]
            etiqueta = definicion.get("etiqueta") or base
            if self.previa:
                return [{"t": f"Nombres de {etiqueta.lower()}", "k": "campo"}]
            personas = self.listas.get(base) or []
            if not personas:
                return self._falta(etiqueta)
            return _unir([[{"t": p["nombre"]}] if (p.get("nombre") or "").strip() else self._falta("Nombre") for p in personas], ", ", " y ")
        if self.previa:
            if t in CAMPOS_FIJOS:
                return [{"t": CAMPOS_FIJOS[t], "k": "campo"}]
            if t in self.propios:
                return [{"t": self.propios[t].get("etiqueta") or t, "k": "propio"}]
            self.desconocidos.append(t)
            return self._error(f"{{{{{t}}}}} no existe.", f"{{{{{t}}}}} sin definir")
        if t == "notificaciones":
            return self._notificaciones()
        if t not in CAMPOS_FIJOS and t not in self.propios:
            self.desconocidos.append(t)
            return self._error(f"{{{{{t}}}}} no existe.", f"{{{{{t}}}}} sin definir")
        valor = self.valores.get(t) or ""
        if valor:
            return _texto_con_enfasis(valor) if t in self.propios else [{"t": valor}]
        return self._falta(CAMPOS_FIJOS.get(t) or self.propios.get(t, {}).get("etiqueta") or t)

    def _notificaciones(self) -> list[Run]:
        destinatarios = self.notificaciones or []
        if not destinatarios:
            return self._falta("Destinatarios de las notificaciones")
        salida: list[Run] = []
        for i, d in enumerate(destinatarios):
            if i:
                salida.append({"t": "", "br": True})
            if d.get("rotulo"):
                salida.append({"t": f"{d['rotulo']},", "b": True})
                salida.append({"t": " "})
            for j, (clave, etiqueta) in enumerate((("nombre", "Nombre"), ("direccion", "Dirección"), ("correo", "Correo"), ("telefono", "Teléfono"))):
                if j:
                    salida.append({"t": f"; {etiqueta.lower()}: "})
                valor = (d.get(clave) or "").strip()
                salida.extend([{"t": valor}] if valor else self._falta(etiqueta))
        return salida

    def inline(self, texto: str, persona: dict | None = None) -> list[Run]:
        salida: list[Run] = []
        ultimo = 0
        for m in RE_TOKEN.finditer(texto):
            if m.start() > ultimo:
                salida.append({"t": texto[ultimo:m.start()]})
            if m.group(1):
                salida.extend(self.bloque(m.group(1), m.group(2)))
            elif m.group(3) is not None:
                salida.extend(self.etiqueta(m.group(3), persona))
            elif m.group(4) is not None:
                salida.extend(_estilo(self.inline(m.group(4), persona), b=True))
            else:
                salida.extend(_estilo(self.inline(m.group(5), persona), i=True))
            ultimo = m.end()
        if ultimo < len(texto):
            salida.append({"t": texto[ultimo:]})
        return salida


def bloques(md: str, ctx: Contexto) -> Resultado:
    """Parte el Markdown en bloques: una línea de párrafo por bloque para poder paginar."""
    salida: list[dict] = []
    parrafo: list[str] = []
    lista: dict | None = None

    def cerrar_parrafo():
        nonlocal parrafo
        for i, linea in enumerate(parrafo):
            salida.append({"tipo": "p", "fin": i == len(parrafo) - 1, "runs": ctx.inline(linea)})
        parrafo = []

    def cerrar_lista():
        nonlocal lista
        if lista:
            salida.append({"tipo": lista["tipo"], "items": [ctx.inline(t) for t in lista["items"]]})
        lista = None

    for crudo in (md or "").split("\n"):
        linea = crudo.rstrip()
        if not linea.strip():
            cerrar_parrafo()
            cerrar_lista()
            continue
        if m := re.match(r"^#\s+(.*)", linea):
            cerrar_parrafo()
            cerrar_lista()
            salida.append({"tipo": "h1", "runs": ctx.inline(m.group(1))})
            continue
        if m := re.match(r"^##\s+(.*)", linea):
            cerrar_parrafo()
            cerrar_lista()
            salida.append({"tipo": "h2", "runs": ctx.inline(m.group(1))})
            continue
        if re.fullmatch(r"-{3,}", linea.strip()):
            cerrar_parrafo()
            cerrar_lista()
            salida.append({"tipo": "hr"})
            continue
        m = re.match(r"^\s*[-*]\s+(.*)", linea) or re.match(r"^\s*\d+[.)]\s+(.*)", linea)
        if m:
            tipo = "ol" if re.match(r"^\s*\d", linea) else "ul"
            cerrar_parrafo()
            if lista and lista["tipo"] != tipo:
                cerrar_lista()
            if lista is None:
                lista = {"tipo": tipo, "items": []}
            lista["items"].append(m.group(1))
            continue
        cerrar_lista()
        parrafo.append(linea.strip())
    cerrar_parrafo()
    cerrar_lista()
    return Resultado(bloques=salida, errores=list(dict.fromkeys(ctx.errores)), desconocidos=list(dict.fromkeys(ctx.desconocidos)))


def revisar(cuerpo: str, campos: list[dict]) -> Resultado:
    """La plantilla sin datos: sus errores y los códigos que no existen."""
    return bloques(cuerpo, Contexto(modo="plantilla", campos=campos))


# ---- El contrato con sus datos -------------------------------------------------------


def destinatarios(campos: list[dict], listas: dict, notificaciones: dict | None) -> list[dict]:
    """Las personas elegidas para notificaciones (con su rótulo) y las otras direcciones, en ese orden."""
    elegidas = set((notificaciones or {}).get("personas") or [])
    salida = []
    for definicion in (c for c in campos if c.get("tipo") == "lista"):
        for persona in listas.get(definicion["clave"]) or []:
            if persona.get("ref") in elegidas:
                salida.append({**persona, "rotulo": definicion.get("rotulo") or ""})
    return salida + list((notificaciones or {}).get("otras") or [])


def firmantes(campos: list[dict], listas: dict) -> list[dict]:
    """Por cada lista que firma: su rótulo una sola vez y los nombres de sus personas."""
    return [
        {"rotulo": d.get("rotulo") or "", "nombres": [(p.get("nombre") or "").strip() for p in listas.get(d["clave"]) or []]}
        for d in campos if d.get("tipo") == "lista" and d.get("firma", True)
    ]


def contexto_contrato(plantilla: dict, datos: dict) -> Contexto:
    campos = plantilla.get("campos") or []
    listas = datos.get("listas") or {}
    valores = dict(datos.get("fijos") or {})
    propios = datos.get("valores") or {}
    for c in campos:
        if c.get("tipo") != "lista":
            valor = formatear(c.get("tipo", "texto"), propios.get(c["clave"]))
            if valor:
                valores[c["clave"]] = valor
    return Contexto(
        modo="contrato", campos=campos, valores=valores, listas=listas,
        notificaciones=destinatarios(campos, listas, datos.get("notificaciones")),
        genero_abogado=(datos.get("fijos") or {}).get("abogado.genero", ""),
    )


def resolver(plantilla: dict, datos: dict) -> Resultado:
    return bloques(plantilla.get("cuerpo") or "", contexto_contrato(plantilla, datos))


def faltantes(plantilla: dict, datos: dict) -> list[str]:
    """Lo que impide dejar el contrato listo para firmar, en palabras."""
    campos = plantilla.get("campos") or []
    listas = datos.get("listas") or {}
    propios = datos.get("valores") or {}
    motivos: list[str] = []
    for c in campos:
        if c.get("tipo") == "lista":
            personas = listas.get(c["clave"]) or []
            if c.get("obligatorio") and not personas:
                motivos.append(f"Agregue al menos una persona en «{c.get('etiqueta') or c['clave']}».")
            if any(not (p.get("nombre") or "").strip() for p in personas):
                motivos.append(f"Falta el nombre de una persona en «{c.get('etiqueta') or c['clave']}».")
        elif c.get("obligatorio") and not formatear(c.get("tipo", "texto"), propios.get(c["clave"])):
            motivos.append(f"Falta «{c.get('etiqueta') or c['clave']}».")
    resultado = resolver(plantilla, datos)
    if resultado.errores:
        motivos.append("La plantilla tiene errores: " + " ".join(resultado.errores[:3]))
    if resultado.faltan:
        motivos.append(f"Quedan {resultado.faltan} datos por completar en el texto.")
    return list(dict.fromkeys(motivos))
