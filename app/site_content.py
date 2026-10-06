"""Allowlisted public pages editable from the global admin console."""

PUBLIC_CONTENT_PAGES = {
    "inicio": "Inicio",
    "quienes-somos": "Quiénes somos",
    "areas-de-practica": "Áreas de práctica",
    "filosofia": "Filosofía de trabajo",
    "contacto": "Contacto",
    "poliza-juridica": "Póliza jurídica",
    "politica-de-privacidad": "Política de privacidad",
    "tratamiento-de-datos": "Tratamiento de datos",
}

# Stable CMS identifiers stay independent from their public, administrator-editable routes.
PUBLIC_PAGE_ROUTES = {
    "inicio": "/",
    "quienes-somos": "/quienes-somos",
    "areas-de-practica": "/areas-de-practica",
    "filosofia": "/filosofia",
    "contacto": "/contacto",
    "poliza-juridica": "/poliza-juridica",
    "politica-de-privacidad": "/politica-de-privacidad",
    "tratamiento-de-datos": "/tratamiento-de-datos",
}
