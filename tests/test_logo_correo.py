from app.email_service import _html_correo


def test_correo_usa_el_logo_propio_de_correos():
    html = _html_correo("Hola", {"logo_url": "https://ejemplo.com/general.png", "logo_correo_url": "https://ejemplo.com/correo.png"})
    assert 'src="https://ejemplo.com/correo.png"' in html
    assert "general.png" not in html


def test_correo_usa_el_logo_general_si_no_hay_logo_de_correos():
    html = _html_correo("Hola", {"logo_url": "https://ejemplo.com/general.png", "logo_correo_url": ""})
    assert 'src="https://ejemplo.com/general.png"' in html
