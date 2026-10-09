"""Fill the CPS PDF template in memory while flowing variable text naturally."""

from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path
import re
from uuid import uuid4
import xml.etree.ElementTree as ET
import zipfile

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from xml.sax.saxutils import escape


TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "plantillas" / "cps" / "CPS.pdf"
TEXT_TEMPLATE_PATH = TEMPLATE_PATH.with_name("CPS.docx")
PAGE_COUNT = 3
MAX_GENERATED_PAGES = 10
BODY_BOTTOM = 76
BODY_TOP = 692
BODY_LEFT = 70.8
BODY_WIDTH = 472
NAVY = Color(0, 32 / 255, 96 / 255)
MONTHS = (
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
)
DEFAULT_HONORARIOS = (
    "mixtos detallados a continuaci\u00f3n: 1) EL CONTRATANTE pagar\u00e1 a EL ABOGADO la suma de "
    "**Quinientos Mil pesos ($500.000)**, mediante consignaci\u00f3n o transferencia a una de las "
    "cuentas bancarias que se proveen en el par\u00e1grafo de esta cl\u00e1usula, dentro de los 5 d\u00edas "
    "calendario siguientes al env\u00edo del presente contrato por EL ABOGADO al correo de EL "
    "CONTRATANTE. 2) EL CONTRATANTE pagar\u00e1 a EL ABOGADO el 10% sobre la liquidaci\u00f3n aprobada "
    "por el juez en el proceso. El pago de este porcentaje se har\u00e1 de acuerdo a los pagos "
    "realizados por el demandado sin que el tiempo exceda de 90 d\u00edas calendario, sin embargo, "
    "se podr\u00e1n hacer acuerdos de pago diferentes, una vez se conozca la aprobaci\u00f3n de la "
    "liquidaci\u00f3n del cr\u00e9dito. 3) las costas procesales o agencias en derecho que el juez fije "
    "en favor de la demandante ser\u00e1n trasladados a EL ABOGADO como prima de \u00e9xito."
)
DEFAULT_ATTORNEY_PROFILE = {
    "nombre": "YEINNY ALEJANDRA MUÑOZ MARÍN",
    "genero": "FEMENINO",
    "documento": "40.328.563",
    "tarjeta_profesional": "375.092",
    "correo": "alejandramunozabg@outlook.com",
    "telefono": "3508809878",
    "domicilio": "SABANETA",
}
FIELD_LABELS = {
    "nombre": "Nombres y apellidos del cliente",
    "genero_cliente": "Género del cliente",
    "documento": "Número de cédula del cliente",
    "ciudad": "Domicilio/ciudad del cliente",
    "objeto": "Objeto del contrato",
    "honorarios": "Honorarios pactados",
    "direccion": "Dirección de notificación del cliente",
    "correo": "Correo de notificación del cliente",
    "telefono": "Teléfono de notificación del cliente",
    "dia": "Día de suscripción",
    "mes": "Mes de suscripción",
    "anio": "Año de suscripción",
    "abogado_nombre": "Nombre del abogado",
    "genero_abogado": "Género del abogado",
    "abogado_documento": "Documento del abogado",
    "abogado_tarjeta": "Tarjeta profesional del abogado",
    "abogado_correo": "Correo del abogado",
    "abogado_telefono": "Teléfono del abogado",
    "abogado_domicilio": "Domicilio del abogado",
}
LEGACY_FIELD_KEYS = {
    "nombre", "id1", "documento", "domicilio", "ciudad", "objeto", "honorarios",
    "direccion", "correo", "telefono", "dia", "mes", "anio",
}
EMAIL_FIELDS = {"correo", "abogado_correo"}
LONG_FIELDS = {"objeto": 1600, "honorarios": 4000}
DOCX_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _clean_profile(profile: dict | None) -> dict[str, str]:
    source = profile if isinstance(profile, dict) else {}
    result = dict(DEFAULT_ATTORNEY_PROFILE)
    for key in result:
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            result[key] = value.strip() if key == "correo" else value.strip().upper()
    if result["genero"] not in {"MASCULINO", "FEMENINO"}:
        result["genero"] = "FEMENINO"
    return result


def default_contract_fields(
    client_name: str = "", email: str = "", phone: str = "", attorney_profile: dict | None = None,
) -> dict[str, str]:
    today = date.today()
    attorney = _clean_profile(attorney_profile)
    return {
        "nombre": client_name.upper(),
        "genero_cliente": "",
        "documento": "",
        "ciudad": "",
        "objeto": "",
        "honorarios": DEFAULT_HONORARIOS,
        "direccion": "",
        "correo": email.strip(),
        "telefono": phone.upper(),
        "dia": str(today.day),
        "mes": MONTHS[today.month - 1],
        "anio": str(today.year),
        "abogado_nombre": attorney["nombre"],
        "genero_abogado": attorney["genero"],
        "abogado_documento": attorney["documento"],
        "abogado_tarjeta": attorney["tarjeta_profesional"],
        "abogado_correo": attorney["correo"],
        "abogado_telefono": attorney["telefono"],
        "abogado_domicilio": attorney["domicilio"],
    }


def validate_contract_fields(raw: dict[str, str], *, require_complete: bool = True) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise ValueError("Los datos del contrato deben ser un objeto de campos de texto.")
    extra = set(raw) - (set(FIELD_LABELS) | LEGACY_FIELD_KEYS)
    if extra:
        raise ValueError(f"Hay campos de contrato desconocidos: {sorted(extra)}.")

    fields = default_contract_fields()
    fields.update({key: value for key, value in raw.items() if key in FIELD_LABELS})
    if "genero_cliente" not in raw and "id1" in raw:
        fields["genero_cliente"] = "FEMENINO" if raw.get("id1", "").lower().endswith("a") else "MASCULINO"
    if "ciudad" not in raw and "domicilio" in raw:
        fields["ciudad"] = raw["domicilio"]
    fields["honorarios"] = raw.get("honorarios") or DEFAULT_HONORARIOS

    for key, label in FIELD_LABELS.items():
        value = fields[key]
        if not isinstance(value, str):
            raise ValueError(f"{label}: el valor debe ser texto.")
        value = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()
        if key in LONG_FIELDS:
            value = "\n".join(line.strip() for line in value.split("\n"))
            maximum = LONG_FIELDS[key]
        else:
            value = " ".join(value.split())
            maximum = 320
        if key not in EMAIL_FIELDS and key not in LONG_FIELDS:
            value = value.upper()
        if len(value) > maximum:
            raise ValueError(f"{label}: máximo {maximum} caracteres.")
        fields[key] = value

    for key in ("genero_cliente", "genero_abogado"):
        if fields[key] and fields[key] not in {"MASCULINO", "FEMENINO"}:
            raise ValueError(f"Selecciona masculino o femenino para {FIELD_LABELS[key].lower()}.")
    if require_complete:
        for required in (
            "nombre", "genero_cliente", "documento", "ciudad", "objeto", "honorarios", "correo",
            "dia", "mes", "anio", "abogado_nombre", "genero_abogado", "abogado_documento",
            "abogado_tarjeta", "abogado_correo", "abogado_telefono", "abogado_domicilio",
        ):
            if not fields[required]:
                raise ValueError(f"Completa el campo {FIELD_LABELS[required].lower()}.")
    return fields


def _format_colombian_identifier(value: str) -> str:
    """Add Colombian thousands separators to numeric identifiers for the PDF only."""
    digits = value.replace(".", "")
    if digits.isdigit():
        return re.sub(r"\B(?=(\d{3})+(?!\d))", ".", digits)
    return value


def _template_paragraph_runs() -> list[list[tuple[str, frozenset[str]]]]:
    if not TEXT_TEMPLATE_PATH.is_file():
        raise FileNotFoundError("No est\u00e1 disponible CPS.docx, necesario para recuperar el texto legal de CPS.pdf.")
    try:
        with zipfile.ZipFile(TEXT_TEMPLATE_PATH) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
        body = root.find(f"{DOCX_NS}body")
        if body is None:
            raise ValueError("CPS.docx no contiene un cuerpo de documento.")
        paragraphs: list[list[tuple[str, frozenset[str]]]] = []
        for paragraph in body.findall(f"{DOCX_NS}p"):
            runs: list[tuple[str, frozenset[str]]] = []
            for run in paragraph.iter(f"{DOCX_NS}r"):
                properties = run.find(f"{DOCX_NS}rPr")
                style: set[str] = set()
                if properties is not None:
                    for tag, name in (("b", "bold"), ("i", "italic"), ("u", "underline")):
                        element = properties.find(f"{DOCX_NS}{tag}")
                        if element is not None and element.attrib.get(f"{DOCX_NS}val", "true").lower() not in {"0", "false", "off", "none"}:
                            style.add(name)
                parts: list[str] = []
                for child in run.iter():
                    if child.tag == f"{DOCX_NS}t":
                        parts.append(child.text or "")
                    elif child.tag == f"{DOCX_NS}tab":
                        parts.append("\t")
                    elif child.tag == f"{DOCX_NS}br":
                        parts.append("\n")
                value = "".join(parts)
                if value:
                    runs.append((value, frozenset(style)))
            if not runs:
                value = "".join(child.text or "" for child in paragraph.iter() if child.tag == f"{DOCX_NS}t")
                if value:
                    runs.append((value, frozenset()))
            paragraphs.append(runs)
        return paragraphs
    except (OSError, KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        raise ValueError("No fue posible leer el texto auxiliar del contrato CPS.") from exc


def _runs_text(runs: list[tuple[str, frozenset[str]]]) -> str:
    return "".join(value for value, _ in runs)


def _replace_rich_fields(runs: list[tuple[str, frozenset[str]]], fields: dict[str, str]) -> list[tuple[str, frozenset[str]]]:
    chars: list[tuple[str, frozenset[str]]] = [(character, style) for value, style in runs for character in value]

    def apply(pattern: str, replacement, flags: int = re.IGNORECASE) -> None:
        nonlocal chars
        text = "".join(character for character, _ in chars)
        matches = list(re.finditer(pattern, text, flags))
        if not matches:
            return
        rebuilt: list[tuple[str, frozenset[str]]] = []
        cursor = 0
        for match in matches:
            rebuilt.extend(chars[cursor:match.start()])
            value = replacement(match) if callable(replacement) else replacement
            style = chars[match.start()][1] if match.start() < len(chars) else frozenset()
            rebuilt.extend((character, style) for character in value)
            cursor = match.end()
        rebuilt.extend(chars[cursor:])
        chars = rebuilt

    def preserve_case(replacement: str, original: str) -> str:
        if original.isupper():
            return replacement.upper()
        if original.islower():
            return replacement.lower()
        if original[:1].isupper():
            return replacement[:1].upper() + replacement[1:].lower()
        return replacement

    client_gender = fields["genero_cliente"]
    lawyer_gender = fields["genero_abogado"]
    client_identified = "identificada" if client_gender == "FEMENINO" else "identificado"
    client_domiciled = "domiciliada" if client_gender == "FEMENINO" else "domiciliado"
    lawyer_gendered = {
        "FEMENINO": ("abogada titulada", "identificada", "portadora", "domiciliada"),
        "MASCULINO": ("abogado titulado", "identificado", "portador", "domiciliado"),
    }.get(lawyer_gender, ("abogada titulada", "identificada", "portadora", "domiciliada"))
    markers = {
        "\u00abNOMBRES\u00bb": fields["nombre"], "\u00abID1\u00bb": client_identified,
        "\u00abDOCUMENTOS\u00bb": fields["documento"], "\u00abDOMICILIO\u00bb": client_domiciled,
        "\u00abCIUDADES\u00bb": fields["ciudad"], "\u00abDIRECCI\u00d3N\u00bb": fields["direccion"],
        "\u00abCORREO\u00bb": fields["correo"], "\u00abTEL\u00c9FONO\u00bb": fields["telefono"],
        "\u00abOBJETO\u00bb": fields["objeto"], "\u00abHONORARIOS\u00bb": fields["honorarios"],
        "\u00abDD\u00bb": fields["dia"], "\u00abMMMM\u00bb": fields["mes"], "\u00abAAAA\u00bb": fields["anio"],
    }
    for marker, value in markers.items():
        apply(re.escape(marker), value, flags=0)
    apply(r"YEINNY\s+ALEJANDRA\s+MU.OZ\s+MAR.N", fields["abogado_nombre"])
    apply(r"YEINNY\s+MU.OZ", fields["abogado_nombre"])
    apply(r"40\.328\.563|40328563", fields["abogado_documento"])
    apply(r"375\.092|375092", fields["abogado_tarjeta"])
    apply(r"alejandramunozabg@outlook\.com", fields["abogado_correo"])
    apply(r"(TEL.FONO:\s*)3508809878", lambda match: match.group(1) + fields["abogado_telefono"])
    apply(r"(WHATSAPP\s+)3508809878", lambda match: match.group(1) + fields["abogado_telefono"])
    apply(r"ABOGADA TITULADA", lambda match: preserve_case(lawyer_gendered[0], match.group(0)))
    apply(r"PORTADORA", lambda match: preserve_case(lawyer_gendered[2], match.group(0)))
    apply(
        r"(ABOGAD[AO] TITULAD[AO],\s*)IDENTIFICAD[AO]",
        lambda match: match.group(1) + preserve_case(lawyer_gendered[1], match.group(0).rsplit(None, 1)[-1]),
    )
    apply(
        r"DOMICILIADA EN SABANETA",
        lambda match: preserve_case(lawyer_gendered[3], match.group(0).split()[0]) + " en " + fields["abogado_domicilio"],
    )
    return _chars_to_runs(chars)

def _chars_to_runs(chars: list[tuple[str, frozenset[str]]]) -> list[tuple[str, frozenset[str]]]:
    runs: list[tuple[str, frozenset[str]]] = []
    for character, style in chars:
        if runs and runs[-1][1] == style:
            previous, _ = runs[-1]
            runs[-1] = (previous + character, style)
        else:
            runs.append((character, style))
    return runs

def _register_template_fonts() -> tuple[str, str]:
    candidates = (
        (Path(r"C:\Windows\Fonts\georgia.ttf"), Path(r"C:\Windows\Fonts\georgiab.ttf")),
        (Path("/usr/share/fonts/truetype/msttcorefonts/Georgia.ttf"), Path("/usr/share/fonts/truetype/msttcorefonts/Georgia_Bold.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")),
        (Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"), Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf")),
    )
    for regular_path, bold_path in candidates:
        if regular_path.is_file():
            suffix = uuid4().hex
            regular, bold = f"CPSSerif-{suffix}", f"CPSSerifBold-{suffix}"
            pdfmetrics.registerFont(TTFont(regular, str(regular_path)))
            if bold_path.is_file():
                pdfmetrics.registerFont(TTFont(bold, str(bold_path)))
            else:
                bold = regular
            pdfmetrics.registerFontFamily(
                regular, normal=regular, bold=bold, italic=regular, boldItalic=bold,
            )
            return regular, bold
    pdfmetrics.registerFontFamily(
        "Times-Roman", normal="Times-Roman", bold="Times-Bold",
        italic="Times-Italic", boldItalic="Times-BoldItalic",
    )
    return "Times-Roman", "Times-Bold"


def _mask_template_body(visual: pdfium.PdfDocument) -> BytesIO:
    output = BytesIO()
    mask = canvas.Canvas(output, pagesize=letter, pageCompression=1)
    for page_index in range(PAGE_COUNT):
        textpage = visual[page_index].get_textpage()
        page_text = textpage.get_text_range()
        protected: set[int] = set()
        phrase = "Huella índice derecho"
        cursor = 0
        while (position := page_text.casefold().find(phrase.casefold(), cursor)) >= 0:
            protected.update(range(position, position + len(phrase)))
            cursor = position + len(phrase)
        lines: dict[int, list[tuple[float, float, float, float]]] = {}
        for char_index in range(textpage.count_chars()):
            if char_index in protected:
                continue
            box = textpage.get_charbox(char_index)
            if not box:
                continue
            x0, y0, x1, y1 = box
            center_y = (y0 + y1) / 2
            if BODY_BOTTOM <= center_y <= BODY_TOP:
                line_key = round(center_y / 2) * 2
                lines.setdefault(line_key, []).append((x0, y0, x1, y1))
        mask.setFillColorRGB(1, 1, 1)
        mask.setStrokeColorRGB(1, 1, 1)
        for boxes in lines.values():
            x0 = min(box[0] for box in boxes) - 0.5
            y0 = min(box[1] for box in boxes) - 0.45
            x1 = max(box[2] for box in boxes) + 0.5
            y1 = max(box[3] for box in boxes) + 0.45
            mask.rect(x0, y0, x1 - x0, y1 - y0, fill=1, stroke=0)
        if page_index == 2:
            # This printed fingerprint guide belongs with the client signature.
            # It is redrawn by the flowing signature block at its new position.
            mask.rect(451.5, 341, 69.5, 86.5, fill=1, stroke=0)
        # The template page count changes when long text flows onto another page.
        mask.rect(246, 13, 120, 22, fill=1, stroke=0)
        mask.showPage()
    mask.save()
    output.seek(0)
    return output


def _heading_prefix(text: str) -> str | None:
    patterns = (
        r"^(?:PRIMERA\.\s*OBJETO:|SEGUNDA\.\s*OBLIGACIONES DEL ABOGADO:|"
        r"TERCERA\.\s*OBLIGACIONES DEL CONTRATANTE:|CUARTA\.\s*HONORARIOS:|"
        r"PARÁGRAFO\.\s*MEDIOS DISPONIBLES PARA PAGO:|QUINTA\.\s*DURACIÓN:|"
        r"SEXTA\.\s*EXONERACIÓN DE RESPONSABILIDAD\.|SÉPTIMA DELEGACIÓN\.|"
        r"TERMINACIÓN:|OCTAVA\.\s*TERMINACIÓN ANORMAL\.|NOVENA CLÁUSULA PENAL:|"
        r"DÉCIMA:\s*DOMICILIO Y NOTIFICACIONES:)"
    )
    match = re.match(patterns, text, flags=re.IGNORECASE)
    return match.group(0) if match else None


def _formatted_rich_paragraph(runs: list[tuple[str, frozenset[str]]], style: ParagraphStyle, *, bold_prefix: str | None = None) -> Paragraph:
    chars = [(character, set(run_style)) for value, run_style in runs for character in value]
    if bold_prefix:
        for index in range(min(len(bold_prefix), len(chars))):
            chars[index][1].add("bold")
    styled_runs = _chars_to_runs([(character, frozenset(run_style)) for character, run_style in chars])
    parts: list[str] = []
    for value, run_style in styled_runs:
        safe = escape(value).replace("\n", "<br/>").replace("\t", "&nbsp;&nbsp;&nbsp;&nbsp;")
        for name, tag in (("underline", "u"), ("italic", "i"), ("bold", "b")):
            if name in run_style:
                safe = f"<{tag}>{safe}</{tag}>"
        parts.append(safe)
    markup = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", "".join(parts))
    return Paragraph(markup, style)


def _story(fields: dict[str, str], regular_font: str, bold_font: str) -> list:
    body_style = ParagraphStyle(
        "CPSBody", fontName=regular_font, fontSize=12, leading=15.3,
        textColor=NAVY, alignment=TA_JUSTIFY, splitLongWords=1, spaceAfter=7,
    )
    title_style = ParagraphStyle(
        "CPSTitle", parent=body_style, fontName=bold_font, alignment=TA_CENTER,
        spaceBefore=4, spaceAfter=10,
    )
    story = []
    signature_started = False
    for template_runs in _template_paragraph_runs():
        runs = list(template_runs)
        while runs and runs[0][0].startswith("\t"):
            value, run_style = runs[0]
            runs[0] = (value[1:], run_style)
            if not runs[0][0]:
                runs.pop(0)
        raw = _runs_text(runs)
        if raw.startswith("Huella"):
            continue
        if raw.startswith("EL CONTRATANTE: "):
            story.append(SignatureFlowable(fields, regular_font, bold_font))
            signature_started = True
            continue
        if signature_started:
            continue
        rich_runs = _replace_rich_fields(runs, fields)
        text = _runs_text(rich_runs)
        if not text.strip():
            story.append(Spacer(1, 8))
            continue
        if re.match(r"CONTRATO DE PRESTACI.N", text, flags=re.IGNORECASE):
            style = title_style
        else:
            style = body_style
        story.append(_formatted_rich_paragraph(rich_runs, style, bold_prefix=_heading_prefix(text)))
    if not signature_started:
        raise ValueError("No se encontraron los espacios de firma del modelo CPS.docx.")
    return story


class SignatureFlowable(Spacer):
    def __init__(self, fields: dict[str, str], regular_font: str, bold_font: str):
        super().__init__(1, 205)
        self.fields = fields
        self.regular_font = regular_font
        self.bold_font = bold_font
        self.width = BODY_WIDTH
        self.height = 205

    def draw(self):
        c = self.canv
        c.setFillColor(NAVY)
        c.setStrokeColor(NAVY)
        c.setFont(self.bold_font, 12)
        c.drawString(0, 185, "EL CONTRATANTE:")
        c.line(115, 186, 310, 186)
        c.setFont(self.regular_font, 12)
        c.drawString(0, 166, self.fields["nombre"])
        c.drawString(0, 149, f"C.C. No. {self.fields['documento']}")
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(1)
        c.roundRect(345, 130, 66, 74, 9, fill=0, stroke=1)
        c.setFillColor(Color(0.88, 0.9, 0.94))
        c.setFont(self.regular_font, 7)
        c.drawCentredString(378, 177, "HUELLA")
        c.drawCentredString(378, 166, "ÍNDICE")
        c.drawCentredString(378, 155, "DERECHO")
        c.setFillColor(NAVY)
        c.setFont(self.bold_font, 12)
        c.drawString(0, 95, "EL ABOGADO:")
        c.setFont(self.regular_font, 12)
        c.drawString(0, 36, self.fields["abogado_nombre"])
        c.drawString(0, 19, f"C.C. {self.fields['abogado_documento']}")
        c.drawString(0, 2, f"T.P. {self.fields['abogado_tarjeta']} DEL C.S. DE LA J.")


def render_contract_pdf(raw_fields: dict[str, str]) -> bytes:
    """Return a filled, naturally reflowed CPS PDF without persisting it."""
    fields = validate_contract_fields(raw_fields)
    for key in ("documento", "abogado_documento", "abogado_tarjeta"):
        fields[key] = _format_colombian_identifier(fields[key])
    if not TEMPLATE_PATH.is_file():
        raise FileNotFoundError("No está disponible la plantilla visual CPS.pdf.")
    source = PdfReader(str(TEMPLATE_PATH))
    if len(source.pages) != PAGE_COUNT:
        raise ValueError("La plantilla CPS.pdf debe conservar sus tres páginas originales.")
    visual = pdfium.PdfDocument(str(TEMPLATE_PATH))
    regular_font, bold_font = _register_template_fonts()

    text_buffer = BytesIO()
    document = SimpleDocTemplate(
        text_buffer, pagesize=letter, leftMargin=BODY_LEFT, rightMargin=612 - BODY_LEFT - BODY_WIDTH,
        topMargin=792 - BODY_TOP, bottomMargin=BODY_BOTTOM,
        pageCompression=1,
    )
    document.build(_story(fields, regular_font, bold_font))
    text_buffer.seek(0)
    content = PdfReader(text_buffer)
    page_total = max(PAGE_COUNT, len(content.pages))
    if page_total > MAX_GENERATED_PAGES:
        raise ValueError(f"El contrato supera el límite de {MAX_GENERATED_PAGES} páginas. Reduce el objeto o los honorarios.")

    masked_buffer = _mask_template_body(visual)
    masked = PdfReader(masked_buffer)
    # Rebuild only the text layer now that page count is known.
    text_buffer = BytesIO()
    document = SimpleDocTemplate(
        text_buffer, pagesize=letter, leftMargin=BODY_LEFT, rightMargin=612 - BODY_LEFT - BODY_WIDTH,
        topMargin=792 - BODY_TOP, bottomMargin=BODY_BOTTOM, pageCompression=1,
    )
    def draw_final_page_number(layer: canvas.Canvas, doc) -> None:
        layer.saveState()
        layer.setFillColor(NAVY)
        layer.setFont(bold_font, 9)
        layer.drawCentredString(306, 21, f"Página {doc.page} de {page_total}")
        layer.restoreState()
    document.build(_story(fields, regular_font, bold_font), onFirstPage=draw_final_page_number, onLaterPages=draw_final_page_number)
    text_buffer.seek(0)
    content = PdfReader(text_buffer)
    writer = PdfWriter()
    for index in range(page_total):
        template_index = min(index, PAGE_COUNT - 1)
        # Build and serialize each page in its own writer. pypdf otherwise
        # reuses cloned indirect objects when the third template page is used
        # as the background for several overflow pages, causing their content
        # streams to alias and every overflow page to show the same text.
        page_writer = PdfWriter()
        isolated_template_page = source.pages[template_index].clone(page_writer, force_duplicate=True)
        page_writer.add_page(isolated_template_page)
        page = page_writer.pages[0]
        page.merge_page(masked.pages[template_index])
        if index < len(content.pages):
            page.merge_page(content.pages[index])
        page_buffer = BytesIO()
        page_writer.write(page_buffer)
        page_buffer.seek(0)
        writer.append(PdfReader(page_buffer))
    result = BytesIO()
    writer.write(result)
    return result.getvalue()
