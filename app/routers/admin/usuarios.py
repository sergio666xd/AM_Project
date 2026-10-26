"""Gestión de usuarios y solicitudes de registro."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas, security
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.password_reset import password_reset_url, send_password_reset_email
from app.routers.admin.agenda import _notificar_agenda_tras_reactivacion
from app.routers.admin.comun import verificar_admin
from app.routers.admin.dashboard import (
    _dashboard_activity_description,
    _dashboard_activity_href,
)

router = APIRouter(prefix="/api/admin", tags=["Administración"])


@router.get(
    "/usuarios",
    response_model=list[schemas.UsuarioOut],
)
def listar_usuarios(
    incluir_administradores: bool = False,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    query = db.query(models.Usuario)
    if not incluir_administradores:
        query = query.filter(models.Usuario.rol != models.RolUsuario.ADMIN)
    usuarios = query.order_by(models.Usuario.created_at.desc()).all()

    return usuarios


@router.post("/usuarios", response_model=schemas.UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario_admin(
    datos: schemas.UsuarioAdminCreate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    email = str(datos.email).lower()
    nombre = datos.nombre_completo.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    if datos.rol == models.RolUsuario.ADMIN:
        raise HTTPException(status_code=400, detail="No se crean administradores de plataforma desde esta pantalla.")
    if db.query(models.Usuario).filter(models.Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    plan_id = datos.plan_id
    abogado_id = datos.creado_por_abogado_id
    if datos.rol == models.RolUsuario.ABOGADO:
        if plan_id is None or not db.query(models.Plan).filter(models.Plan.id == plan_id, models.Plan.activo == True).first():
            raise HTTPException(status_code=400, detail="El plan seleccionado no está disponible.")
        abogado_id = None
    elif datos.rol == models.RolUsuario.ABOGADO_ADMIN:
        plan_id = None
        abogado_id = None
    elif datos.rol == models.RolUsuario.CLIENTE:
        plan_id = None
        abogado = db.query(models.Usuario).filter(
            models.Usuario.id == abogado_id,
            models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
        ).first()
        if not abogado:
            raise HTTPException(status_code=400, detail="Selecciona el abogado administrador responsable del cliente.")
    usuario = models.Usuario(
        email=email, nombre_completo=nombre, whatsapp_numero=datos.whatsapp_numero.strip(),
        password_hash=security.hash_password(datos.password_temporal), rol=datos.rol,
        estado=models.EstadoUsuario.ACTIVO, plan_id=plan_id,
        creado_por_abogado_id=abogado_id, debe_cambiar_password=True,
        notificaciones_email=True, notificaciones_whatsapp=False,
        canal_notificacion_cliente="EMAIL" if datos.rol == models.RolUsuario.CLIENTE else None,
    )
    db.add(usuario)
    db.flush()
    registrar_evento_auditoria(db, admin, "admin.usuario.crear", "usuario", usuario.id)
    db.commit(); db.refresh(usuario)
    return usuario


@router.patch("/usuarios/estado-masivo")
def cambiar_estado_usuarios_masivo(datos: schemas.AccionMasivaUsuarios, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    ids = list(set(datos.usuario_ids))
    if not ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un usuario.")
    objetivos = db.query(models.Usuario.id).filter(
        models.Usuario.id.in_(ids), models.Usuario.rol != models.RolUsuario.ADMIN
    ).all()
    total = db.query(models.Usuario).filter(
        models.Usuario.id.in_(ids), models.Usuario.rol != models.RolUsuario.ADMIN
    ).update({models.Usuario.estado: datos.estado}, synchronize_session=False)
    for (usuario_id,) in objetivos:
        registrar_evento_auditoria(db, admin, f"admin.usuario.estado.{datos.estado.value}", "usuario", usuario_id)
    db.commit()
    return {"mensaje": f"{total} usuario(s) actualizado(s).", "total": total}


@router.patch("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def actualizar_usuario_admin(
    usuario_id: int, datos: schemas.UsuarioAdminUpdate,
    db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id, models.Usuario.rol != models.RolUsuario.ADMIN).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if datos.rol is not None and datos.rol != usuario.rol:
        if datos.rol == models.RolUsuario.ADMIN:
            raise HTTPException(status_code=400, detail="No se puede asignar el rol administrador desde esta pantalla.")
        has_processes = db.query(models.Proceso.id).filter(models.Proceso.abogado_id == usuario.id).first()
        has_collaborations = db.query(models.ProcesoColaborador.proceso_id).filter(models.ProcesoColaborador.abogado_id == usuario.id).first()
        has_client_processes = db.query(models.ProcesoCliente.proceso_id).filter(models.ProcesoCliente.cliente_id == usuario.id).first()
        has_tasks = db.query(models.Tarea.id).filter(or_(models.Tarea.usuario_id == usuario.id, models.Tarea.cliente_id == usuario.id)).first()
        has_documents = db.query(models.DocumentoProceso.id).filter(models.DocumentoProceso.cliente_id == usuario.id).first()
        has_document_requests = db.query(models.SolicitudDocumento.id).filter(models.SolicitudDocumento.cliente_id == usuario.id).first()
        has_profile_requests = db.query(models.SolicitudEdicionPerfilCliente.id).filter(models.SolicitudEdicionPerfilCliente.cliente_id == usuario.id).first()
        if any((has_processes, has_collaborations, has_client_processes, has_tasks, has_documents, has_document_requests, has_profile_requests)) or usuario.solicitud_registro:
            raise HTTPException(status_code=400, detail="No se puede cambiar el rol porque la cuenta ya tiene información asociada.")
        if usuario.estado != models.EstadoUsuario.ACTIVO:
            raise HTTPException(status_code=400, detail="Solo se puede cambiar el rol de una cuenta activa.")
        if datos.rol == models.RolUsuario.ABOGADO:
            selected_plan = datos.plan_id or usuario.plan_id
            if not selected_plan or not db.query(models.Plan).filter(models.Plan.id == selected_plan, models.Plan.activo.is_(True)).first():
                raise HTTPException(status_code=400, detail="Selecciona un plan SaaS activo para este abogado.")
            usuario.plan_id = selected_plan
            usuario.creado_por_abogado_id = None
        elif datos.rol == models.RolUsuario.ABOGADO_ADMIN:
            usuario.plan_id = None
            usuario.creado_por_abogado_id = None
        elif datos.rol == models.RolUsuario.CLIENTE:
            owner_id = datos.creado_por_abogado_id or usuario.creado_por_abogado_id
            owner = db.query(models.Usuario).filter(
                models.Usuario.id == owner_id,
                models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN,
                models.Usuario.estado == models.EstadoUsuario.ACTIVO,
            ).first()
            if not owner:
                raise HTTPException(status_code=400, detail="Selecciona un abogado activo de la firma como responsable.")
            usuario.plan_id = None
            usuario.creado_por_abogado_id = owner.id
        usuario.rol = datos.rol
    if datos.nombre_completo is not None:
        if not datos.nombre_completo.strip():
            raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
        usuario.nombre_completo = datos.nombre_completo.strip()
    if datos.whatsapp_numero is not None: usuario.whatsapp_numero = datos.whatsapp_numero.strip()
    if datos.plan_id is not None:
        if usuario.rol != models.RolUsuario.ABOGADO:
            raise HTTPException(status_code=400, detail="Solo las cuentas SaaS tienen plan.")
        if not db.query(models.Plan).filter(models.Plan.id == datos.plan_id).first():
            raise HTTPException(status_code=400, detail="Plan no encontrado.")
        usuario.plan_id = datos.plan_id
    if datos.creado_por_abogado_id is not None:
        if usuario.rol != models.RolUsuario.CLIENTE or not db.query(models.Usuario).filter(models.Usuario.id == datos.creado_por_abogado_id, models.Usuario.rol == models.RolUsuario.ABOGADO_ADMIN).first():
            raise HTTPException(status_code=400, detail="El abogado responsable no es válido.")
        usuario.creado_por_abogado_id = datos.creado_por_abogado_id
    registrar_evento_auditoria(db, admin, "admin.usuario.actualizar", "usuario", usuario.id)
    db.commit(); db.refresh(usuario)
    return usuario


@router.patch("/usuarios/{usuario_id}/forzar-cambio-password")
def forzar_cambio_password_admin(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    usuario = db.query(models.Usuario).filter(
        models.Usuario.id == usuario_id,
        models.Usuario.rol != models.RolUsuario.ADMIN,
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    usuario.debe_cambiar_password = True
    registrar_evento_auditoria(db, admin, "admin.usuario.forzar_cambio_password", "usuario", usuario.id)
    db.commit()
    return {"mensaje": "El usuario deberá cambiar su contraseña en el próximo ingreso."}


@router.post("/usuarios/{usuario_id}/enviar-restablecimiento")
def enviar_restablecimiento_password_admin(
    usuario_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    usuario = db.query(models.Usuario).filter_by(id=usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    token = security.create_password_reset_token(usuario.id, usuario.password_hash)
    background_tasks.add_task(
        send_password_reset_email,
        usuario.email,
        password_reset_url(token, usuario.rol),
    )
    registrar_evento_auditoria(
        db, admin, "admin.usuario.password.restablecimiento_enviado", "usuario", usuario.id,
    )
    db.commit()
    return {"mensaje": f"Se programó el envío del enlace de restablecimiento a {usuario.email}."}


@router.post("/solicitudes/accion-masiva")
def procesar_solicitudes_masivo(datos: schemas.AccionMasivaSolicitudes, db: Session = Depends(get_db), admin: models.Usuario = Depends(verificar_admin)):
    ids = list(set(datos.solicitud_ids))
    accion = datos.accion.upper()
    if not ids or accion not in {"APROBAR", "RECHAZAR"}:
        raise HTTPException(status_code=400, detail="Acción o solicitudes inválidas.")
    solicitudes = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.id.in_(ids)).all()
    if accion == "APROBAR":
        plan = db.query(models.Plan).filter(models.Plan.id == datos.plan_id, models.Plan.activo == True).first()
        if not plan:
            raise HTTPException(status_code=400, detail="Selecciona un plan activo.")
        for solicitud in solicitudes:
            solicitud.usuario.estado = models.EstadoUsuario.ACTIVO
            solicitud.usuario.plan_id = plan.id
    else:
        for solicitud in solicitudes:
            solicitud.usuario.estado = models.EstadoUsuario.RECHAZADO
    for solicitud in solicitudes:
        registrar_evento_auditoria(
            db,
            admin,
            f"admin.solicitud.{accion.lower()}",
            "solicitud_registro",
            solicitud.id,
        )
    db.commit()
    return {"mensaje": f"{len(solicitudes)} solicitud(es) procesada(s)."}


@router.get("/usuarios/{usuario_id}")
def obtener_usuario_admin(
    usuario_id: int,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    procesos_query = db.query(models.Proceso)
    if usuario.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ABOGADO):
        procesos_query = procesos_query.filter(models.Proceso.abogado_id == usuario.id)
        colaboraciones = db.query(models.ProcesoColaborador.proceso_id).filter(
            models.ProcesoColaborador.abogado_id == usuario.id
        ).all()
        colaboration_ids = [row[0] for row in colaboraciones]
        if colaboration_ids:
            procesos_query = db.query(models.Proceso).filter(
                or_(models.Proceso.abogado_id == usuario.id, models.Proceso.id.in_(colaboration_ids))
            )
    elif usuario.rol == models.RolUsuario.CLIENTE:
        procesos_query = procesos_query.join(
            models.ProcesoCliente, models.ProcesoCliente.proceso_id == models.Proceso.id
        ).filter(models.ProcesoCliente.cliente_id == usuario.id)
    else:
        procesos_query = procesos_query.filter(models.Proceso.id == -1)
    procesos = procesos_query.order_by(models.Proceso.created_at.desc()).limit(100).all()
    proceso_ids = [proceso.id for proceso in procesos]

    tareas = db.query(models.Tarea).filter(or_(
        models.Tarea.usuario_id == usuario.id,
        models.Tarea.cliente_id == usuario.id,
    )).order_by(models.Tarea.created_at.desc()).limit(100).all()

    documentos_query = db.query(models.DocumentoProceso).filter(
        models.DocumentoProceso.cliente_id == usuario.id
    )
    if proceso_ids:
        documentos_query = db.query(models.DocumentoProceso).filter(or_(
            models.DocumentoProceso.cliente_id == usuario.id,
            models.DocumentoProceso.proceso_id.in_(proceso_ids),
        ))
    documentos = documentos_query.order_by(models.DocumentoProceso.created_at.desc()).limit(100).all()

    solicitudes = []
    if usuario.solicitud_registro:
        solicitud = usuario.solicitud_registro
        solicitudes.append({
            "id": solicitud.id, "tipo": "Registro profesional", "estado": usuario.estado.value,
            "fecha": solicitud.fecha_solicitud, "href": "/gestion-procesos/admin/solicitudes",
        })
    solicitudes_perfil = db.query(models.SolicitudEdicionPerfilCliente).filter(
        models.SolicitudEdicionPerfilCliente.cliente_id == usuario.id
    ).order_by(models.SolicitudEdicionPerfilCliente.solicitada_en.desc()).limit(50).all()
    solicitudes.extend({
        "id": solicitud.id, "tipo": "Edición de perfil", "estado": solicitud.estado,
        "fecha": solicitud.solicitada_en, "href": "/gestion-procesos/admin/solicitudes-perfil",
    } for solicitud in solicitudes_perfil)
    solicitudes_documento_query = db.query(models.SolicitudDocumento).filter(
        models.SolicitudDocumento.cliente_id == usuario.id
    )
    if proceso_ids:
        solicitudes_documento_query = db.query(models.SolicitudDocumento).filter(or_(
            models.SolicitudDocumento.cliente_id == usuario.id,
            models.SolicitudDocumento.proceso_id.in_(proceso_ids),
        ))
    for solicitud in solicitudes_documento_query.order_by(models.SolicitudDocumento.created_at.desc()).limit(50).all():
        solicitudes.append({
            "id": solicitud.id, "tipo": f"Documento: {solicitud.titulo}",
            "estado": "Atendida" if solicitud.atendida_en else "Pendiente",
            "fecha": solicitud.created_at, "href": "/gestion-procesos/admin/documentos",
        })

    activity_rows = db.query(models.EventoAuditoria).filter(
        models.EventoAuditoria.actor_id == usuario.id
    ).order_by(models.EventoAuditoria.created_at.desc(), models.EventoAuditoria.id.desc()).limit(30).all()
    actividad = []
    for evento in activity_rows:
        descripcion, recurso = _dashboard_activity_description(evento.accion, evento.tipo_recurso)
        actividad.append({
            "id": evento.id, "accion": evento.accion, "descripcion": descripcion,
            "recurso": recurso, "fecha": evento.created_at,
            "href": _dashboard_activity_href(evento.tipo_recurso, evento.recurso_id),
        })

    return {
        "id": usuario.id,
        "nombre_completo": usuario.nombre_completo,
        "email": usuario.email,
        "whatsapp_numero": usuario.whatsapp_numero,
        "rol": usuario.rol.value,
        "estado": usuario.estado.value,
        "debe_cambiar_password": usuario.debe_cambiar_password,
        "created_at": usuario.created_at,
        "ultimo_acceso": usuario.ultimo_acceso,
        "plan": {"id": usuario.plan.id, "nombre": usuario.plan.nombre} if usuario.plan else None,
        "responsable": {
            "id": usuario.creado_por_abogado.id,
            "nombre": usuario.creado_por_abogado.nombre_completo,
        } if usuario.creado_por_abogado else None,
        "procesos": [{
            "id": proceso.id, "nombre": proceso.nombre, "estado": "Archivado" if proceso.archivado_en else "Activo",
            "abogado": proceso.abogado.nombre_completo if proceso.abogado else None,
            "href": "/gestion-procesos/admin/procesos",
        } for proceso in procesos],
        "tareas": [{
            "id": tarea.id, "titulo": tarea.titulo, "estado": tarea.estado.value,
            "fecha_limite": tarea.fecha_limite, "proceso": tarea.proceso.nombre if tarea.proceso else None,
            "href": "/gestion-procesos/admin/tareas",
        } for tarea in tareas],
        "documentos": [{
            "id": documento.id, "nombre": documento.nombre_archivo,
            "fecha": documento.created_at, "proceso": documento.proceso.nombre if documento.proceso else None,
            "href": "/gestion-procesos/admin/documentos",
        } for documento in documentos],
        "solicitudes": solicitudes,
        "actividad": actividad,
        "totales": {
            "procesos": len(procesos), "tareas": len(tareas),
            "documentos": len(documentos), "solicitudes": len(solicitudes),
        },
    }


@router.patch("/usuarios/{usuario_id}/plan")
def cambiar_plan_usuario(
    usuario_id: int,
    plan_id: int,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.id == usuario_id,
            models.Usuario.rol == models.RolUsuario.ABOGADO,
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    plan = (
        db.query(models.Plan)
        .filter(
            models.Plan.id == plan_id,
            models.Plan.activo == True,
        )
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=400,
            detail="El plan no existe o está inactivo.",
        )

    usuario.plan_id = plan.id

    registrar_evento_auditoria(db, usuario_actual, "admin.usuario.plan", "usuario", usuario.id)
    db.commit()
    db.refresh(usuario)

    return {
        "mensaje": "Plan actualizado correctamente.",
        "plan": {
            "id": plan.id,
            "nombre": plan.nombre,
            "limite_radicados": plan.limite_radicados,
            "precio_mensual": plan.precio_mensual,
            "limite_ultimas_actuaciones": plan.limite_ultimas_actuaciones,
            "notificaciones_whatsapp_procesos": plan.notificaciones_whatsapp_procesos,
            "notificaciones_whatsapp_tareas": plan.notificaciones_whatsapp_tareas,
            "activo": plan.activo,
        },
    }


@router.patch("/usuarios/{usuario_id}/estado")
def cambiar_estado_usuario(
    usuario_id: int,
    estado: models.EstadoUsuario,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.id == usuario_id,
            models.Usuario.rol != models.RolUsuario.ADMIN,
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    if usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION:
        raise HTTPException(status_code=409, detail="Revisa la solicitud de registro para decidir el estado de esta cuenta.")
    if estado == models.EstadoUsuario.PENDIENTE_APROBACION:
        raise HTTPException(status_code=400, detail="Usa el flujo de revisión de solicitudes para dejar una cuenta pendiente.")
    if estado not in (models.EstadoUsuario.ACTIVO, models.EstadoUsuario.SUSPENDIDO, models.EstadoUsuario.RECHAZADO):
        raise HTTPException(status_code=400, detail="Estado de cuenta no permitido.")

    reactivado = usuario.estado == models.EstadoUsuario.SUSPENDIDO and estado == models.EstadoUsuario.ACTIVO
    usuario.estado = estado

    registrar_evento_auditoria(db, usuario_actual, f"admin.usuario.estado.{estado.value}", "usuario", usuario.id)
    db.commit()
    db.refresh(usuario)
    if reactivado:
        _notificar_agenda_tras_reactivacion(db, usuario, usuario_actual)

    return {
        "mensaje": "Estado del usuario actualizado correctamente.",
        "estado": usuario.estado.value,
    }


@router.delete("/usuarios/{usuario_id}")
def eliminar_usuario_admin(
    usuario_id: int,
    usuario_actual: models.Usuario = Depends(verificar_admin),
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.rol == models.RolUsuario.ADMIN:
        raise HTTPException(status_code=403, detail="Las cuentas administradoras de plataforma no se eliminan desde este módulo.")

    procesos_ids = [row[0] for row in db.query(models.Proceso.id).filter(
        models.Proceso.abogado_id == usuario_id
    ).all()]
    ids_procesos_usuario = procesos_ids or [-1]
    documentos_conservados = db.query(models.DocumentoProceso.id).filter(or_(
        models.DocumentoProceso.cliente_id == usuario_id,
        models.DocumentoProceso.proceso_id.in_(ids_procesos_usuario),
    )).count()

    # Preserve file metadata and R2 objects while removing account/process links.
    db.query(models.DocumentoProceso).filter(or_(
        models.DocumentoProceso.cliente_id == usuario_id,
        models.DocumentoProceso.proceso_id.in_(ids_procesos_usuario),
    )).update({models.DocumentoProceso.solicitud_id: None}, synchronize_session=False)
    db.query(models.DocumentoProceso).filter(
        models.DocumentoProceso.proceso_id.in_(ids_procesos_usuario)
    ).update({models.DocumentoProceso.proceso_id: None}, synchronize_session=False)
    db.query(models.DocumentoProceso).filter(
        models.DocumentoProceso.cliente_id == usuario_id
    ).update({models.DocumentoProceso.cliente_id: None}, synchronize_session=False)

    # Clear assignments on records that may belong to other accounts.
    db.query(models.Usuario).filter(
        models.Usuario.creado_por_abogado_id == usuario_id
    ).update({models.Usuario.creado_por_abogado_id: None}, synchronize_session=False)
    db.query(models.Tarea).filter(
        models.Tarea.cliente_id == usuario_id
    ).update({models.Tarea.cliente_id: None}, synchronize_session=False)
    db.query(models.Subtarea).filter(
        models.Subtarea.cliente_id == usuario_id
    ).update({models.Subtarea.cliente_id: None}, synchronize_session=False)
    db.query(models.ProcesoCliente).filter(
        models.ProcesoCliente.cliente_id == usuario_id
    ).delete(synchronize_session=False)
    db.query(models.ProcesoColaborador).filter(or_(
        models.ProcesoColaborador.abogado_id == usuario_id,
        models.ProcesoColaborador.proceso_id.in_(ids_procesos_usuario),
    )).delete(synchronize_session=False)
    db.query(models.SolicitudDocumento).filter(or_(
        models.SolicitudDocumento.cliente_id == usuario_id,
        models.SolicitudDocumento.proceso_id.in_(ids_procesos_usuario),
    )).delete(synchronize_session=False)
    db.query(models.SolicitudRegistro).filter(
        models.SolicitudRegistro.usuario_id == usuario_id
    ).delete(synchronize_session=False)
    db.query(models.SolicitudEdicionPerfilCliente).filter(or_(
        models.SolicitudEdicionPerfilCliente.cliente_id == usuario_id,
        models.SolicitudEdicionPerfilCliente.revisada_por_id == usuario_id,
    )).delete(synchronize_session=False)
    db.query(models.NotificacionProceso).filter(or_(
        models.NotificacionProceso.abogado_id == usuario_id,
        models.NotificacionProceso.cliente_id == usuario_id,
        models.NotificacionProceso.proceso_id.in_(ids_procesos_usuario),
    )).delete(synchronize_session=False)
    db.execute(models.radicados_usuarios.delete().where(
        models.radicados_usuarios.c.usuario_id == usuario_id
    ))

    # Radicados may be shared by another process; preserve them under ADMIN.
    db.query(models.Radicado).filter(
        models.Radicado.creado_por_id == usuario_id
    ).update({models.Radicado.creado_por_id: usuario_actual.id}, synchronize_session=False)

    registrar_evento_auditoria(
        db,
        usuario_actual,
        "admin.usuario.eliminar",
        "usuario",
        usuario.id,
        metadata={"documentos_conservados": documentos_conservados},
    )
    db.delete(usuario)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No fue posible completar la eliminación por una dependencia de datos. No se aplicaron cambios.",
        ) from error
    return {
        "mensaje": (
            f"Cuenta eliminada. Se conservaron {documentos_conservados} documento(s) "
            "en el inventario ADMIN; los demás registros vinculados se eliminaron o desligaron."
        )
    }
