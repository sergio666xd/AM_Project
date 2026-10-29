"""PDF de la cuenta de cobro, el recibo de pago y el estado de cuenta.

Se generan al pedirlos, solo con la instantánea guardada en la base (emisor,
cliente, líneas, importes). No se guardan como archivo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.modulos.finanzas.formato import NOTA_POR_DEFECTO, dia_corto, pesos

NAVY = HexColor("#002060")
INK = HexColor("#18203a")
INK2 = HexColor("#454d63")
LINE = HexColor("#e4ddcc")
SHEET2 = HexColor("#fbf9f4")
GOLD = HexColor("#ccb56b")
BAD = HexColor("#a3312a")

_FUENTES = {
    "serif": [("/usr/share/fonts/truetype/msttcorefonts/Georgia.ttf", "/usr/share/fonts/truetype/msttcorefonts/Georgia_Bold.ttf"),
              ("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"),
              ("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")],
    "sans": [("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
             ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")],
    "mono": [("/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"),
             ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")],
}
_RESPALDO = {"serif": ("Times-Roman", "Times-Bold"), "sans": ("Helvetica", "Helvetica-Bold"), "mono": ("Courier", "Courier-Bold")}
_registradas: dict[str, tuple[str, str]] = {}


def _fuente(familia: str) -> tuple[str, str]:
    """Regular y negrita de la familia; si el servidor no tiene las TTF, las de PDF."""
    if familia in _registradas:
        return _registradas[familia]
    for regular, negrita in _FUENTES[familia]:
        if Path(regular).is_file():
            nombres = (f"AM{familia}", f"AM{familia}-Bold")
            pdfmetrics.registerFont(TTFont(nombres[0], regular))
            pdfmetrics.registerFont(TTFont(nombres[1], negrita if Path(negrita).is_file() else regular))
            pdfmetrics.registerFontFamily(nombres[0], normal=nombres[0], bold=nombres[1], italic=nombres[0], boldItalic=nombres[1])
            _registradas[familia] = nombres
            return nombres
    _registradas[familia] = _RESPALDO[familia]
    return _RESPALDO[familia]


@dataclass
class Firma:
    nombre: str
    correo: str = ""
    whatsapp: str = ""
    direccion: str = ""
    sitio: str = ""


@dataclass
class Fila:
    """Una fila de datos («Etiqueta», «valor»). Si el valor está vacío no se pinta."""
    etiqueta: str
    valor: str


@dataclass
class Documento:
    titulo: str
    numero: str | None
    firma: Firma
    partes: list[tuple[str, list[str]]] = field(default_factory=list)
    datos: list[Fila] = field(default_factory=list)
    secciones: list = field(default_factory=list)
    nota: str | None = None
    sello: str | None = None


def _estilos() -> dict[str, ParagraphStyle]:
    serif, serif_b = _fuente("serif")
    sans, sans_b = _fuente("sans")
    mono, _ = _fuente("mono")
    return {
        "firma": ParagraphStyle("firma", fontName=serif, fontSize=13, leading=16, textColor=NAVY),
        "contacto": ParagraphStyle("contacto", fontName=sans, fontSize=8.5, leading=11.5, textColor=INK2),
        "titulo": ParagraphStyle("titulo", fontName=serif, fontSize=24, leading=28, textColor=INK, alignment=TA_RIGHT),
        "numero": ParagraphStyle("numero", fontName=mono, fontSize=10.5, leading=14, textColor=INK2, alignment=TA_RIGHT),
        "etiqueta": ParagraphStyle("etiqueta", fontName=sans_b, fontSize=8.5, leading=11, textColor=INK2),
        "etiqueta_derecha": ParagraphStyle("etiqueta_derecha", fontName=sans_b, fontSize=8.5, leading=11, textColor=INK2, alignment=TA_RIGHT),
        "texto": ParagraphStyle("texto", fontName=sans, fontSize=10, leading=14, textColor=INK),
        "fuerte": ParagraphStyle("fuerte", fontName=sans_b, fontSize=10, leading=14, textColor=INK),
        "derecha": ParagraphStyle("derecha", fontName=sans, fontSize=10, leading=14, textColor=INK, alignment=TA_RIGHT),
        "derecha_fuerte": ParagraphStyle("derecha_fuerte", fontName=sans_b, fontSize=10, leading=14, textColor=INK, alignment=TA_RIGHT),
        "seccion": ParagraphStyle("seccion", fontName=serif, fontSize=13, leading=17, textColor=INK, spaceBefore=4),
        "nota": ParagraphStyle("nota", fontName=sans, fontSize=8.5, leading=12, textColor=INK2),
        "saldo": ParagraphStyle("saldo", fontName=serif_b, fontSize=15, leading=19, textColor=INK, alignment=TA_RIGHT),
        "saldo_etq": ParagraphStyle("saldo_etq", fontName=sans_b, fontSize=10.5, leading=19, textColor=INK),
    }


def _p(texto: str, estilo: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(texto).replace("\n", "<br/>"), estilo)


@dataclass
class TablaDetalle:
    """Tabla con encabezado; las columnas `derecha` van alineadas a la derecha."""
    columnas: list[str]
    filas: list[list[str]]
    anchos: list[float]
    derecha: set[int] = field(default_factory=set)
    vacio: str = ""


@dataclass
class Totales:
    filas: list[tuple[str, str]]
    final: tuple[str, str]


@dataclass
class Bloque:
    titulo: str
    texto: str


def _encabezado(doc: Documento, e: dict[str, ParagraphStyle], ancho: float) -> Table:
    contacto = " · ".join(v for v in (doc.firma.correo, doc.firma.whatsapp and f"WhatsApp {doc.firma.whatsapp}", doc.firma.direccion) if v)
    izquierda = [_p(doc.firma.nombre, e["firma"]), _p(contacto, e["contacto"])]
    derecha = [_p(doc.titulo, e["titulo"])] + ([_p(doc.numero, e["numero"])] if doc.numero else [])
    tabla = Table([[izquierda, derecha]], colWidths=[ancho * 0.55, ancho * 0.45])
    tabla.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LINEBELOW", (0, 0), (-1, 0), 2, GOLD),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tabla


def _partes(doc: Documento, e: dict[str, ParagraphStyle], ancho: float) -> Table | None:
    if not doc.partes:
        return None
    celdas = []
    for etiqueta, lineas in doc.partes:
        visibles = [linea for linea in lineas if linea]
        celdas.append([_p(etiqueta, e["etiqueta"]), _p(visibles[0], e["fuerte"]),
                       *(_p(linea, e["texto"]) for linea in visibles[1:])])
    tabla = Table([celdas], colWidths=[ancho / len(celdas)] * len(celdas))
    tabla.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    return tabla


def _datos(filas: list[Fila], e: dict[str, ParagraphStyle], ancho: float) -> Table | None:
    visibles = [f for f in filas if f.valor]
    if not visibles:
        return None
    pares = [visibles[i:i + 3] for i in range(0, len(visibles), 3)]
    datos = [[[_p(f.etiqueta, e["etiqueta"]), _p(f.valor, e["texto"])] for f in grupo] + [""] * (3 - len(grupo)) for grupo in pares]
    tabla = Table(datos, colWidths=[ancho / 3] * 3)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SHEET2),
        ("BOX", (0, 0), (-1, -1), 0.75, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return tabla


def _tabla(t: TablaDetalle, e: dict[str, ParagraphStyle], ancho: float) -> Table:
    encabezado = [_p(c, e["etiqueta_derecha"] if i in t.derecha else e["etiqueta"]) for i, c in enumerate(t.columnas)]
    filas = [[_p(valor, e["derecha"] if i in t.derecha else e["texto"]) for i, valor in enumerate(fila)] for fila in t.filas]
    if not filas:
        filas = [[_p(t.vacio, e["nota"])] + [""] * (len(t.columnas) - 1)]
    tabla = Table([encabezado, *filas], colWidths=[ancho * a for a in t.anchos], repeatRows=1)
    estilo = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, INK2),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
    ]
    if not t.filas:
        estilo.append(("SPAN", (0, 1), (-1, 1)))
    tabla.setStyle(TableStyle(estilo))
    return tabla


def _totales(t: Totales, e: dict[str, ParagraphStyle], ancho: float) -> Table:
    filas = [["", _p(etq, e["texto"]), _p(valor, e["derecha"])] for etq, valor in t.filas]
    filas.append(["", _p(t.final[0], e["saldo_etq"]), _p(t.final[1], e["saldo"])])
    tabla = Table(filas, colWidths=[ancho * 0.45, ancho * 0.3, ancho * 0.25])
    tabla.setStyle(TableStyle([
        ("LINEABOVE", (1, -1), (-1, -1), 1, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, -1), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tabla


def _bloque(contenido: list, ancho: float) -> Table:
    """Texto suelto alineado al mismo borde que las tablas."""
    tabla = Table([[contenido]], colWidths=[ancho])
    tabla.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return tabla


def _sello(texto: str):
    def pintar(lienzo, documento):
        lienzo.saveState()
        lienzo.setFillColor(Color(BAD.red, BAD.green, BAD.blue, alpha=0.14))
        lienzo.setFont(_fuente("sans")[1], 92)
        lienzo.translate(letter[0] / 2, letter[1] / 2)
        lienzo.rotate(35)
        lienzo.drawCentredString(0, -30, texto)
        lienzo.restoreState()
    return pintar


def _pie(firma: Firma):
    def pintar(lienzo, documento):
        lienzo.saveState()
        lienzo.setFont(_fuente("sans")[0], 8)
        lienzo.setFillColor(INK2)
        lienzo.drawString(documento.leftMargin, 12 * mm, firma.nombre)
        lienzo.drawRightString(letter[0] - documento.rightMargin, 12 * mm, f"Página {lienzo.getPageNumber()}")
        lienzo.restoreState()
    return pintar


def generar(doc: Documento) -> bytes:
    salida = BytesIO()
    plantilla = SimpleDocTemplate(
        salida, pagesize=letter, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=22 * mm,
        title=f"{doc.titulo} {doc.numero or ''}".strip(), author=doc.firma.nombre,
    )
    ancho = plantilla.width
    e = _estilos()
    historia: list = [_encabezado(doc, e, ancho), Spacer(1, 16)]
    for bloque in (_partes(doc, e, ancho), _datos(doc.datos, e, ancho)):
        if bloque is not None:
            historia += [bloque, Spacer(1, 14)]
    for seccion in doc.secciones:
        if isinstance(seccion, TablaDetalle):
            historia += [_tabla(seccion, e, ancho), Spacer(1, 8)]
        elif isinstance(seccion, Totales):
            historia += [_totales(seccion, e, ancho), Spacer(1, 16)]
        elif isinstance(seccion, Bloque):
            historia += [_bloque([_p(seccion.titulo, e["seccion"]), Spacer(1, 3), _p(seccion.texto, e["texto"])], ancho), Spacer(1, 14)]
    historia.append(_bloque([_p(doc.nota or NOTA_POR_DEFECTO, e["nota"])], ancho))

    pie = _pie(doc.firma)
    sello = _sello(doc.sello) if doc.sello else None

    def pagina(lienzo, documento):
        if sello:
            sello(lienzo, documento)
        pie(lienzo, documento)

    plantilla.build(historia, onFirstPage=pagina, onLaterPages=pagina)
    return salida.getvalue()


def fecha(valor: date | None) -> str:
    return dia_corto(valor) if valor else ""


__all__ = ["Bloque", "Documento", "Fila", "Firma", "TablaDetalle", "Totales", "fecha", "generar", "pesos"]
