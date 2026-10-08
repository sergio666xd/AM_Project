from app import models


PREFERENCIA_PLAN_WHATSAPP = {
    "ACCESO": "notificaciones_whatsapp_procesos",
    "ACTUACIONES": "notificaciones_whatsapp_procesos",
    "TAREAS": "notificaciones_whatsapp_tareas",
    "SUBTAREAS": "notificaciones_whatsapp_tareas",
    "RECORDATORIOS": "notificaciones_whatsapp_tareas",
    "DOCUMENTOS": "notificaciones_whatsapp_procesos",
    "RESUMENES": "notificaciones_whatsapp_procesos",
}


def abogados_notificables_para_radicado(
    radicado: models.Radicado,
) -> list[models.Usuario]:
    candidatos = {
        usuario.id: usuario
        for usuario in [*radicado.usuarios_vinculados, radicado.creador]
        if usuario is not None
    }
    ambito = (radicado.ambito_key or "").strip()

    if ambito == "FIRMA":
        return sorted(
            (
                usuario
                for usuario in candidatos.values()
                if usuario.estado == models.EstadoUsuario.ACTIVO
                and usuario.rol == models.RolUsuario.ABOGADO_ADMIN
            ),
            key=lambda usuario: usuario.id,
        )

    if ambito.startswith("SAAS:"):
        try:
            propietario_id = int(ambito.removeprefix("SAAS:"))
        except ValueError:
            return []
        propietario = candidatos.get(propietario_id)
        if (
            propietario is None
            or propietario.estado != models.EstadoUsuario.ACTIVO
            or propietario.rol != models.RolUsuario.ABOGADO
        ):
            return []
        return [propietario]

    return []


def clientes_notificables_para_radicado(
    radicado: models.Radicado,
) -> list[tuple[models.Usuario, models.Proceso]]:
    destinatarios: dict[tuple[int, int], tuple[models.Usuario, models.Proceso]] = {}
    for enlace in radicado.procesos:
        proceso = enlace.proceso
        if (
            proceso is None
            or proceso.archivado_en is not None
            or proceso.abogado is None
            or radicado.ambito_key != _ambito_proceso(proceso)
        ):
            continue
        for asignacion in proceso.clientes:
            cliente = asignacion.cliente
            if (
                cliente is None
                or cliente.rol != models.RolUsuario.CLIENTE
                or cliente.estado != models.EstadoUsuario.ACTIVO
            ):
                continue
            destinatarios[(cliente.id, proceso.id)] = (cliente, proceso)
    return list(destinatarios.values())


def _ambito_proceso(proceso: models.Proceso) -> str | None:
    rol = proceso.abogado.rol
    if rol == models.RolUsuario.ABOGADO:
        return f"SAAS:{proceso.abogado.id}"
    if rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
        return "FIRMA"
    return None


def canales_habilitados(
    usuario: models.Usuario | None,
    tipo: str,
    emisor: models.Usuario | None = None,
) -> tuple[str, ...]:
    if (
        usuario is None
        or usuario.estado != models.EstadoUsuario.ACTIVO
        or tipo not in models.TIPOS_NOTIFICACION
    ):
        return ()

    if usuario.rol == models.RolUsuario.CLIENTE:
        canal = usuario.canal_notificacion_cliente
        if canal == "EMAIL" and usuario.email:
            return ("EMAIL",)
        if canal == "WHATSAPP" and usuario.whatsapp_numero.strip():
            return ("WHATSAPP",)
        return ()

    preferencias = usuario.preferencias_notificacion or {}
    canales = preferencias.get(tipo)
    if canales is None:
        email_habilitado = usuario.notificaciones_email
        whatsapp_preferido = usuario.notificaciones_whatsapp
    else:
        email_habilitado = bool(canales.get("email", False))
        whatsapp_preferido = bool(canales.get("whatsapp", False))

    resultado = []
    if email_habilitado and usuario.email:
        resultado.append("EMAIL")
    if whatsapp_preferido and whatsapp_habilitado(usuario):
        feature = PREFERENCIA_PLAN_WHATSAPP.get(tipo)
        plan_owner = usuario if usuario.rol == models.RolUsuario.ABOGADO else emisor
        if feature is None or plan_owner is None or plan_whatsapp_habilitado(plan_owner, feature):
            resultado.append("WHATSAPP")
    return tuple(resultado)


def canales_recordatorio_seleccionados(
    usuario: models.Usuario | None,
    recordatorio: models.RecordatorioTarea | None,
) -> tuple[str, ...]:
    """Canales elegidos para un recordatorio, respetando disponibilidad y plan."""
    if usuario is None or recordatorio is None or usuario.estado != models.EstadoUsuario.ACTIVO:
        return ()
    resultado = []
    if recordatorio.notificar_email and usuario.email:
        resultado.append("EMAIL")
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)
    if (
        recordatorio.notificar_whatsapp
        and usuario.whatsapp_numero.strip()
        and rol in {"ABOGADO", "ADMIN", "ABOGADO_ADMIN", "CLIENTE"}
    ):
        feature = PREFERENCIA_PLAN_WHATSAPP["RECORDATORIOS"]
        if usuario.rol != models.RolUsuario.ABOGADO or plan_whatsapp_habilitado(usuario, feature):
            resultado.append("WHATSAPP")
    return tuple(resultado)


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
