"""Cómo se leen y se marcan los teléfonos de Colombia."""


def digitos_whatsapp(telefono: str | None) -> str:
    """'315 222 3344' o '+57 315…' → número internacional para wa.me; vacío si no sirve."""
    digitos = "".join(c for c in telefono or "" if c.isdigit())
    if len(digitos) == 10 and digitos.startswith("3"):
        return f"57{digitos}"
    return digitos if len(digitos) >= 11 else ""


def telefono_legible(telefono: str | None) -> str:
    digitos = "".join(c for c in telefono or "" if c.isdigit())
    if len(digitos) == 12 and digitos.startswith("57"):
        digitos = digitos[2:]
    if len(digitos) == 10:
        return f"{digitos[:3]} {digitos[3:6]} {digitos[6:]}"
    return (telefono or "").strip()
