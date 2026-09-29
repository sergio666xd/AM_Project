from app import models


def whatsapp_habilitado(usuario: models.Usuario | None) -> bool:
    if usuario is None or not usuario.notificaciones_whatsapp or not usuario.whatsapp_numero:
        return False

    role = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)
    return role in {"ABOGADO", "ADMIN", "ABOGADO_ADMIN", "CLIENTE"}


def plan_whatsapp_habilitado(usuario: models.Usuario, funcion_plan: str) -> bool:
    role = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)
    if role != "ABOGADO":
        return True
    return bool(usuario.plan and getattr(usuario.plan, funcion_plan, False))