"""La auditoría contada en frases: «Alejandra Muñoz emitió una cuenta de cobro».

Cada acción registrada (`cuenta_cobro.emitir`) se traduce con la tabla de
acciones conocidas; las que no están se arman con el recurso y el verbo final,
de modo que una acción nueva nunca sale como «realizó una acción».
"""

ADMIN = "/gestion-procesos/admin"

# Acciones con una frase propia.
FRASES = {
    "sitio.mensaje.atendida": "marcó como atendido un mensaje del sitio web",
    "sitio.mensaje.descartada": "descartó un mensaje del sitio web",
    "sitio.mensaje.nueva": "volvió a marcar como nuevo un mensaje del sitio web",
    "sitio.mensaje.nota": "anotó un mensaje del sitio web",
    "sitio.pagina.guardada": "editó una página del sitio web",
    "sitio.pagina.restaurada": "devolvió una página del sitio web a su texto base",
    "abogado.crear": "creó la cuenta de un abogado",
    "admin.usuario.crear": "creó una cuenta",
    "admin.usuario.actualizar": "editó una cuenta",
    "admin.usuario.estado.ACTIVO": "reactivó una cuenta",
    "admin.usuario.estado.SUSPENDIDO": "suspendió una cuenta",
    "admin.usuario.estado.RECHAZADO": "rechazó una cuenta",
    "admin.usuario.forzar_cambio_password": "pidió a un usuario cambiar su contraseña",
    "admin.usuario.password.restablecimiento_enviado": "envió un enlace para cambiar la contraseña",
    "admin.usuario.acceso_reenviado": "reenvió el acceso de una cuenta",
    "admin.usuario.sesiones_cerradas": "cerró las sesiones de una cuenta",
    "admin.usuario.eliminar": "eliminó una cuenta",
    "admin.alerta.descartar": "descartó una alerta",
    "admin.alerta.restaurar": "volvió a mostrar una alerta",
    "admin.configuracion_firma.actualizar": "cambió los datos de la firma",
    "admin.consultas.configuracion.actualizar": "cambió el horario de las consultas judiciales",
    "admin.integraciones.configuracion.actualizar": "cambió la configuración de las integraciones",
    "admin.mensaje.plantilla.actualizar": "editó una plantilla de mensaje",
    "admin.contenido.guardar": "editó una página del sitio",
    "admin.contenido.restaurar": "restauró una página del sitio",
    "auth.password.cambiar": "cambió su contraseña",
    "auth.password.restablecer": "restableció su contraseña",
    "auth.perfil.actualizar": "actualizó su perfil",
    "auth.notificaciones.actualizar": "cambió sus preferencias de avisos",
    "sesion.cerrar_todas": "cerró sesión en todos sus dispositivos",
    "chat.mensaje.enviar": "envió un mensaje",
    "cliente.crear": "creó un cliente",
    "cliente.actualizar": "editó los datos de un cliente",
    "cliente.reenviar_acceso": "reenvió el acceso de un cliente",
    "cliente.comunicacion.enviar": "le escribió a un cliente",
    "cliente.solicitud_perfil.crear": "pidió corregir sus datos",
    "contrato.firmado.cargar": "cargó un contrato firmado",
    "contrato.firmado.descargar": "descargó un contrato firmado",
    "contrato.copia_correo": "envió la copia de un contrato",
    "contrato.copia_correo.reintentar": "reintentó el envío de un contrato",
    "contrato.estado": "cambió el estado de un contrato",
    "cuenta_cobro.ajuste": "ajustó una cuenta de cobro",
    "documento.revisar": "revisó un documento",
    "documento.recordar": "le recordó un documento a un cliente",
    "documento.solicitar": "pidió documentos a un cliente",
    "documento.solicitud_eliminar": "retiró una solicitud de documentos",
    "documento.solicitud_fecha": "cambió la fecha límite de una solicitud",
    "finanzas.configuracion": "cambió la configuración de cobros",
    "pago.abonar": "aplicó un saldo a favor",
    "plantilla_tarea.aplicar": "usó una plantilla de tareas",
    "proceso.etapa": "cambió la etapa de un proceso",
    "etapas.plantilla.crear": "creó una plantilla de etapas",
    "etapas.plantilla.editar": "editó una plantilla de etapas",
    "etapas.plantilla.eliminar": "borró una plantilla de etapas",
    "proceso.cliente.asignar": "vinculó un cliente a un proceso",
    "proceso.cliente.retirar": "desvinculó un cliente de un proceso",
    "proceso.colaborador.asignar": "sumó un abogado a un proceso",
    "proceso.colaborador.retirar": "retiró a un abogado de un proceso",
    "proceso.colaborador.actualizar_permiso": "cambió lo que el cliente ve del equipo",
    "proceso.comunicacion.registrar": "registró una comunicación",
    "proceso.notificacion.enviar": "le avisó una actuación al cliente",
    "proceso.radicado.asignar": "agregó un radicado a un proceso",
    "proceso.radicado.retirar": "retiró un radicado de un proceso",
    "proceso.restaurar": "reabrió un proceso",
    "radicado.desvincular": "desvinculó un radicado",
    "tarea.actualizar_lote": "actualizó varias tareas",
    "tarea.fecha_limite.cambiar_cliente": "cambió la fecha de una tarea del cliente",
}

RECURSOS = {
    "abogado": "un abogado",
    "admin.agenda.evento": "un evento de la agenda",
    "admin.auditoria": "registros de auditoría",
    "admin.plan": "un plan",
    "admin.r2": "archivos del almacenamiento",
    "admin.solicitud": "una solicitud de registro",
    "agenda.suscripcion": "la suscripción del calendario",
    "cliente": "un cliente",
    "contrato": "un contrato",
    "cuenta_cobro": "una cuenta de cobro",
    "documento": "un documento",
    "glosario": "un término del glosario",
    "pago": "un pago",
    "plantilla_tarea": "una plantilla de tareas",
    "proceso.evento_agenda": "un evento de la agenda",
    "proceso": "un proceso",
    "radicado": "un radicado",
    "recordatorio": "un recordatorio",
    "subtarea": "una subtarea",
    "tarea": "una tarea",
    "usuario": "una cuenta",
}

VERBOS = {
    "crear": "creó", "editar": "editó", "actualizar": "actualizó", "eliminar": "eliminó", "emitir": "emitió",
    "anular": "anuló", "descartar": "descartó", "registrar": "registró", "revertir": "revirtió", "cargar": "cargó",
    "descargar": "descargó", "enviar": "envió", "archivar": "archivó", "restaurar": "restauró", "completar": "completó",
    "renovar": "renovó", "aprobar": "aprobó", "rechazar": "rechazó", "guardar": "guardó", "aplicar": "aplicó",
}


def frase(accion: str) -> str:
    if accion in FRASES:
        return FRASES[accion]
    if accion.startswith("admin.usuario.estado."):
        return "cambió el estado de una cuenta"
    partes = accion.split(".")
    verbo = VERBOS.get(partes[-1])
    recurso = next((RECURSOS[".".join(partes[:n])] for n in range(len(partes) - 1, 0, -1) if ".".join(partes[:n]) in RECURSOS), None)
    if verbo and recurso:
        return f"{verbo} {recurso}"
    if recurso:
        return f"hizo un cambio en {recurso}"
    return f"hizo un cambio ({accion})"


def enlace(tipo_recurso: str, recurso_id: str | None) -> str | None:
    tipo = tipo_recurso.lower()
    con_id = recurso_id if recurso_id and recurso_id.isdigit() else None
    if tipo == "usuario" and con_id:
        return f"{ADMIN}/usuarios/{con_id}"
    if tipo == "proceso" and con_id:
        return f"{ADMIN}/procesos/{con_id}"
    if tipo == "solicitud_contacto" and con_id:
        return f"{ADMIN}/sitio/mensajes?mensaje={con_id}"
    if tipo == "pagina_publica" and recurso_id:
        return f"{ADMIN}/sitio/contenido?pagina={recurso_id}"
    destinos = {
        "cuenta_cobro": "cobros", "pago_financiero": "cobros", "configuracion_correo_financiero": "finanzas",
        "tarea": "tareas", "subtarea": "tareas", "recordatorio_tarea": "tareas", "documento_proceso": "documentos",
        "solicitud_documento": "documentos", "radicado": "radicados", "contrato_servicio": "contratos",
        "plantilla_mensaje": "operacion/mensajes", "solicitud_edicion_perfil": "solicitudes-perfil",
        "configuracion_integraciones": "operacion/integraciones", "configuracion_consultas": "operacion/consultas",
        "configuracion_firma": "firma", "evento_agenda": "agenda", "plantilla_etapas": "operacion/etapas",
    }
    return f"{ADMIN}/{destinos[tipo]}" if tipo in destinos else None
