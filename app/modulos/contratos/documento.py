"""El PDF de un contrato hecho con plantilla, sobre el documento base CPS.

Documento base (fijo, no se edita desde la aplicación):
- Hoja carta. Encabezado y pie de página: los de plantillas/cps/CPS.pdf, tal cual.
- Márgenes de CPS.docx: superior 3,5 cm, inferior 2,7 cm, izquierdo y derecho 2,5 cm.
- Cuerpo en Georgia 12 pt, interlineado 1,15, azul oscuro de Word (#002060). Si el
  servidor no tiene Georgia se usa Gelasio, de las mismas medidas (plantillas/cps/fuentes).
- Firmas una debajo de la otra: el rótulo de cada lista una sola vez y en seguida cada
  persona con su línea, su nombre, «C.C. No.» en blanco y el recuadro de la huella; al
  final el abogado con su nombre, cédula y tarjeta profesional.
"""

from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate

from app.contract_pdf import TEMPLATE_PATH, _mask_template_body
from app.modulos.contratos import motor

ANCHO, ALTO = letter
MARGENES = {"sup": 3.5 * cm, "inf": 2.7 * cm, "izq": 2.5 * cm, "der": 2.5 * cm}
TAMANO = 12
INTERLINEADO = 1.15
AZUL = Color(0, 32 / 255, 96 / 255)
MAX_PAGINAS = 30
FUENTES = Path(__file__).resolve().parents[3] / "plantillas" / "cps" / "fuentes"
MARCAS = {"falta": ("#fbefd6", "#8a5a00"), "error": ("#f9e4e1", "#a3312a")}


@lru_cache(maxsize=1)
def _fuentes() -> tuple[str, str]:
    """Registra la familia del cuerpo y devuelve (normal, negrita)."""
    familias = (
        (Path(r"C:\Windows\Fonts"), ("georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf")),
        (Path("/usr/share/fonts/truetype/msttcorefonts"), ("Georgia.ttf", "Georgia_Bold.ttf", "Georgia_Italic.ttf", "Georgia_Bold_Italic.ttf")),
        (FUENTES, ("Gelasio-Regular.ttf", "Gelasio-Bold.ttf", "Gelasio-Italic.ttf", "Gelasio-BoldItalic.ttf")),
    )
    for carpeta, archivos in familias:
        rutas = [carpeta / a for a in archivos]
        if all(r.is_file() for r in rutas):
            nombres = ("CPSCuerpo", "CPSCuerpo-Negrita", "CPSCuerpo-Cursiva", "CPSCuerpo-NegritaCursiva")
            for nombre, ruta in zip(nombres, rutas):
                pdfmetrics.registerFont(TTFont(nombre, str(ruta)))
            pdfmetrics.registerFontFamily(nombres[0], normal=nombres[0], bold=nombres[1], italic=nombres[2], boldItalic=nombres[3])
            return nombres[0], nombres[1]
    return "Times-Roman", "Times-Bold"


def _marcado(runs: list[dict], *, mayusculas: bool = False) -> str:
    partes: list[str] = []
    for run in runs:
        if run.get("br"):
            partes.append("<br/>")
            continue
        texto = escape(run.get("t", "").upper() if mayusculas else run.get("t", ""))
        if run.get("i"):
            texto = f"<i>{texto}</i>"
        if run.get("b"):
            texto = f"<b>{texto}</b>"
        if run.get("k") in MARCAS:
            fondo, letra = MARCAS[run["k"]]
            texto = f'<span backColor="{fondo}" textColor="{letra}">{texto}</span>'
        partes.append(texto)
    return "".join(partes)


class _Firma(Flowable):
    """Un bloque de firma: el rótulo (si es la primera de su lista), la línea, el nombre y lo de abajo."""

    def __init__(self, normal: str, *, rotulo: str | None, lineas: list[str], antes: float, despues: float, huella: bool, espacio: float):
        super().__init__()
        self.normal, self.rotulo, self.lineas, self.huella = normal, rotulo, lineas, huella
        self.antes, self.despues, self.espacio = antes, despues, espacio
        self.renglon = TAMANO * 1.3

    def wrap(self, ancho, alto):
        self.ancho = ancho
        izquierda = self.espacio + self.renglon * len(self.lineas)
        cuerpo = max(izquierda, 2.3 * cm) if self.huella else izquierda
        self.alto = self.antes + (self.renglon if self.rotulo else 0) + cuerpo + self.despues
        return ancho, self.alto

    def draw(self):
        c = self.canv
        c.setFillColor(AZUL)
        c.setStrokeColor(AZUL)
        c.setFont(self.normal, TAMANO)
        y = self.alto - self.antes
        if self.rotulo:
            y -= self.renglon
            c.drawString(0, y + 3.5, self.rotulo)
        base = self.despues  # el renglón inferior del bloque
        # La línea de firma va sobre el nombre; lo demás, renglón por renglón hacia abajo.
        primera = base + self.renglon * (len(self.lineas) - 1)
        if self.huella:
            c.setLineWidth(0.6)
            c.line(0, primera + self.renglon - 1, 7.5 * cm, primera + self.renglon - 1)
        for i, linea in enumerate(self.lineas):
            c.drawString(0, primera - i * self.renglon + 3.5, linea)
        if self.huella:
            ancho, alto, derecha = 1.9 * cm, 2.3 * cm, 0.8 * cm
            x = self.ancho - derecha - ancho
            c.setLineWidth(0.8)
            c.roundRect(x, base, ancho, alto, 0.35 * cm, stroke=1, fill=0)
            c.setFillColor(HexColor("#c8cddb"))
            c.setFont(self.normal, TAMANO * 0.8)
            centro, medio = x + ancho / 2, base + alto / 2
            for j, palabra in enumerate(("Huella", "índice", "derecho")):
                c.drawCentredString(centro, medio + (1 - j) * TAMANO * 0.92 - 3, palabra)


def _firmas(plantilla: dict, datos: dict, normal: str) -> list:
    salida = []
    grupos = motor.firmantes(plantilla.get("campos") or [], datos.get("listas") or {})
    for g, grupo in enumerate(grupos):
        for i, nombre in enumerate(grupo["nombres"] or [""]):
            salida.append(_Firma(
                normal, rotulo=f"{grupo['rotulo']}:" if i == 0 else None, lineas=[nombre or "", "C.C. No."],
                antes=(1.4 if g == 0 else 0.9) * cm if i == 0 else 0.5 * cm, despues=0.3 * cm, huella=True, espacio=1.3 * cm,
            ))
    fijos = datos.get("fijos") or {}
    rotulo = ((plantilla.get("firmas") or {}).get("abogado") or "EL ABOGADO").upper()
    salida.append(_Firma(
        normal, rotulo=f"{rotulo}:", antes=0.9 * cm, despues=1 * cm, huella=False, espacio=2.2 * cm,
        lineas=[fijos.get("abogado.nombre", ""), f"C.C {fijos.get('abogado.documento', '')}",
                f"T.P {fijos.get('abogado.tarjeta', '').replace('.', '')} del C.S de la J"],
    ))
    return [KeepTogether([f]) for f in salida]


def _historia(plantilla: dict, datos: dict) -> list:
    normal, negrita = _fuentes()
    renglon = TAMANO * INTERLINEADO
    cuerpo = ParagraphStyle("Cuerpo", fontName=normal, fontSize=TAMANO, leading=renglon, textColor=AZUL, alignment=TA_JUSTIFY)
    titulo = ParagraphStyle("Titulo", parent=cuerpo, fontName=negrita, alignment=TA_CENTER, spaceAfter=1.4 * TAMANO)
    clausula = ParagraphStyle("Clausula", parent=cuerpo, fontName=negrita, alignment=0, spaceBefore=TAMANO, spaceAfter=0.3 * TAMANO)
    item = ParagraphStyle("Item", parent=cuerpo, leftIndent=1.6 * TAMANO, bulletIndent=0.5 * TAMANO, bulletFontName=normal)
    historia: list = []
    for bloque in motor.resolver(plantilla, datos).bloques:
        tipo = bloque["tipo"]
        if tipo == "h1":
            historia.append(Paragraph(f"<b>{_marcado(bloque['runs'], mayusculas=True)}</b>", titulo))
        elif tipo == "h2":
            historia.append(Paragraph(f"<b>{_marcado(bloque['runs'], mayusculas=True)}</b>", clausula))
        elif tipo == "hr":
            historia.append(HRFlowable(width="100%", thickness=0.6, color=HexColor("#999999"), spaceBefore=TAMANO, spaceAfter=TAMANO))
        elif tipo in ("ul", "ol"):
            items = bloque["items"]
            for i, runs in enumerate(items):
                estilo = ParagraphStyle(f"Item{i}", parent=item, spaceAfter=0.8 * TAMANO if i == len(items) - 1 else 0)
                historia.append(Paragraph(_marcado(runs), estilo, bulletText="•" if tipo == "ul" else f"{i + 1}."))
        else:
            estilo = ParagraphStyle("P", parent=cuerpo, spaceAfter=TAMANO if bloque.get("fin") else 0)
            historia.append(Paragraph(_marcado(bloque["runs"]) or "&nbsp;", estilo))
    return historia + _firmas(plantilla, datos, normal)


def _documento(destino: BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        destino, pagesize=letter, leftMargin=MARGENES["izq"], rightMargin=MARGENES["der"],
        topMargin=MARGENES["sup"], bottomMargin=MARGENES["inf"], pageCompression=1,
    )


@lru_cache(maxsize=1)
def _fondo() -> bytes:
    """La primera hoja de CPS.pdf sin su texto: solo encabezado y pie."""
    if not TEMPLATE_PATH.is_file():
        raise FileNotFoundError("No está disponible el documento base CPS.pdf.")
    original = PdfReader(str(TEMPLATE_PATH))
    mascara = PdfReader(_mask_template_body(pdfium.PdfDocument(str(TEMPLATE_PATH))))
    escritor = PdfWriter()
    escritor.add_page(original.pages[0])
    escritor.pages[0].merge_page(mascara.pages[0])
    salida = BytesIO()
    escritor.write(salida)
    return salida.getvalue()


def render_pdf_plantilla(plantilla: dict, datos: dict) -> bytes:
    """El contrato en PDF. No lo guarda."""
    _, negrita = _fuentes()
    primera = BytesIO()
    _documento(primera).build(_historia(plantilla, datos))
    total = len(PdfReader(BytesIO(primera.getvalue())).pages)
    if total > MAX_PAGINAS:
        raise ValueError(f"El contrato supera {MAX_PAGINAS} páginas.")

    def numerar(lienzo, documento):
        lienzo.saveState()
        lienzo.setFillColor(AZUL)
        lienzo.setFont(negrita, 9)
        lienzo.drawCentredString(ANCHO / 2, 21, f"Página {documento.page} de {total}")
        lienzo.restoreState()

    texto = BytesIO()
    _documento(texto).build(_historia(plantilla, datos), onFirstPage=numerar, onLaterPages=numerar)
    contenido = PdfReader(BytesIO(texto.getvalue()))
    escritor = PdfWriter()
    for pagina in contenido.pages:
        # Cada hoja con su propia copia del fondo: si se comparte, pypdf mezcla los textos.
        hoja = PdfWriter()
        hoja.add_page(PdfReader(BytesIO(_fondo())).pages[0])
        hoja.pages[0].merge_page(pagina)
        buffer = BytesIO()
        hoja.write(buffer)
        escritor.append(PdfReader(BytesIO(buffer.getvalue())))
    salida = BytesIO()
    escritor.write(salida)
    return salida.getvalue()
