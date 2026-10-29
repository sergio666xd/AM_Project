"""Clientes del despacho, abogados internos y solicitudes de edición de perfil."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas, security
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.firm_access import (
    lawyer_process_ids,
    lawyer_scope_id,
    require_roles,
)
from app.routers.expedientes.comun import (
    _abogado,
    _abogado_puede_gestionar_cliente,
    _notificar,
    _resumen_solicitud_documento,
    _serializar_solicitud_perfil,
)
from app.timezone import utc_ahora
from app.workflow_service import chat_conversation_url, user_portal_url

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes"])


@router.post("/abogados", status_code=status.HTTP_201_CREATED)
def crear_abogado_admin(datos: schemas.AbogadoAdminCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    require_roles(usuario, ["ADMIN"], action="crear abogados administradores")
    if db.query(models.Usuario).filter(models.Usuario.email == str(datos.email).lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    abogado = models.Usuario(email=str(datos.email).lower(), nombre_completo=datos.nombre_completo.strip(), whatsapp_numero=datos.whatsapp_numero.strip(), password_hash=security.hash_password(datos.password_temporal), rol=models.RolUsuario.ABOGADO_ADMIN, estado=models.EstadoUsuario.ACTIVO, debe_cambiar_password=True, notificaciones_email=True, notificaciones_whatsapp=False)
    db.add(abogado); db.flush()
    registrar_evento_auditoria(db, usuario, "abogado.crear", "usuario", abogado.id)
    db.commit(); db.refresh(abogado)
    _notificar(
        db,
        abogado,
        "Acceso de abogado administrador",
        "Su acceso fue creado. Cambie la contraseña temporal al ingresar.",
        "ACCESO",
        f"USUARIO:{abogado.id}:ACCESO",
        emisor=usuario,
        plantilla_clave="ABOGADO_CREDENCIALES",
        variables={"nombre": abogado.nombre_completo, "correo": abogado.email},
        enlace_texto="Ingresar al portal", enlace_url=user_portal_url(abogado, "/"),
    )
    return {"id": abogado.id, "email": abogado.email, "debe_cambiar_password": True}


@router.post("/clientes", status_code=status.HTTP_201_CREATED)
def crear_cliente(datos: schemas.ClienteCreate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    if db.query(models.Usuario).filter(models.Usuario.email == str(datos.email).lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con este correo.")
    if len(datos.password_temporal) < 8:
        raise HTTPException(status_code=400, detail="La contraseña temporal debe tener al menos 8 caracteres.")
    if datos.canal_envio == "WHATSAPP" and not datos.whatsapp_numero.strip():
        raise HTTPException(status_code=400, detail="Ingresa un número de WhatsApp para enviar las credenciales por ese canal.")
    cliente = models.Usuario(email=str(datos.email).lower(), nombre_completo=datos.nombre_completo.strip(), whatsapp_numero=datos.whatsapp_numero.strip(), password_hash=security.hash_password(datos.password_temporal), rol=models.RolUsuario.CLIENTE, estado=models.EstadoUsuario.ACTIVO, creado_por_abogado_id=usuario.id, debe_cambiar_password=True, notificaciones_email=datos.canal_envio == "EMAIL", notificaciones_whatsapp=datos.canal_envio == "WHATSAPP", canal_notificacion_cliente=datos.canal_envio)
    db.add(cliente); db.flush()
    registrar_evento_auditoria(db, usuario, "cliente.crear", "usuario", cliente.id)
    db.commit(); db.refresh(cliente)
    _notificar(
        db,
        cliente,
        "Acceso a sus procesos",
        f"Hola {cliente.nombre_completo},\n\n{usuario.nombre_completo} creó tu acceso al portal de gestión de procesos.\n\nTus credenciales temporales son:\nUsuario: {cliente.email}\nContraseña temporal: {datos.password_temporal}\n\nAl iniciar sesión tendrás que cambiar esta contraseña. No compartas estas credenciales.\n\nCanal elegido para futuras notificaciones: {datos.canal_envio}.\n\nAbrir enlace: Ingresar al portal | {user_portal_url(cliente, '/')}",
        "ACCESO",
        f"USUARIO:{cliente.id}:ACCESO",
        emisor=usuario,
        # La contraseña temporal solo viaja por correo; WhatsApp avisa que la busque allí.
        incluir_email=True,
        plantilla_clave="CLIENTE_CREDENCIALES",
        variables={"nombre": cliente.nombre_completo, "actor": usuario.nombre_completo,
                   "correo": cliente.email, "password": datos.password_temporal,
                   "canal": datos.canal_envio},
                enlace_texto="Ingresar al portal", enlace_url=user_portal_url(cliente, "/"),
    )
    return {"id": cliente.id, "email": cliente.email, "debe_cambiar_password": True, "canal_envio": datos.canal_envio, "mensaje": "Cliente creado y credenciales programadas para envío."}


@router.get("/clientes")
def listar_clientes(db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    query = db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.CLIENTE)
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        assigned_clients = (
            db.query(models.ProcesoCliente.cliente_id)
            .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
            .filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
        )
        query = query.filter(
            or_(
                models.Usuario.creado_por_abogado_id == responsible_lawyer_id,
                models.Usuario.id.in_(assigned_clients),
            )
        )
    process_query = (
        db.query(models.ProcesoCliente.cliente_id, models.Proceso.id)
        .join(models.Proceso, models.Proceso.id == models.ProcesoCliente.proceso_id)
        .filter(models.Proceso.archivado_en.is_(None))
    )
    if usuario.rol != models.RolUsuario.ADMIN:
        process_query = process_query.filter(or_(
            models.Proceso.abogado_id == usuario.id,
            db.query(models.ProcesoColaborador.abogado_id).filter(
                models.ProcesoColaborador.proceso_id == models.Proceso.id,
                models.ProcesoColaborador.abogado_id == usuario.id,
                models.ProcesoColaborador.visible_cliente.is_(True),
            ).exists(),
        ))
    if responsible_lawyer_id is not None:
        process_query = process_query.filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
    chat_process_by_client = {}
    for client_id, process_id in process_query.order_by(models.Proceso.id.desc()).all():
        chat_process_by_client.setdefault(client_id, process_id)
    return [{
        "id": c.id,
        "nombre_completo": c.nombre_completo,
        "email": c.email,
        "whatsapp_numero": c.whatsapp_numero,
        "genero": c.genero,
        "numero_documento": c.numero_documento,
        "domicilio": c.domicilio,
        "direccion": c.direccion,
        "chat_href": (
            chat_conversation_url(usuario, chat_process_by_client[c.id], c.id)
            if usuario.rol != models.RolUsuario.ADMIN and c.id in chat_process_by_client
            else user_portal_url(usuario, "/gestion-procesos/abogado/chat")
            if usuario.rol != models.RolUsuario.ADMIN
            else None
        ),
    } for c in query.order_by(models.Usuario.nombre_completo).all()]


@router.get("/clientes/solicitud-edicion-perfil")
def listar_mis_solicitudes_edicion_perfil(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(usuario, ["CLIENTE"], action="consultar tus solicitudes de edición")
    solicitudes = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
        cliente_id=usuario.id
    ).order_by(models.SolicitudEdicionPerfilCliente.solicitada_en.desc()).all()
    return [_serializar_solicitud_perfil(item) for item in solicitudes]


@router.post("/clientes/solicitud-edicion-perfil", status_code=status.HTTP_201_CREATED)
def solicitar_edicion_perfil_cliente(
    datos: schemas.SolicitudEdicionPerfilClienteCreate,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(usuario, ["CLIENTE"], action="solicitar la edición de tus datos")
    nombre = datos.nombre_completo.strip()
    email = str(datos.email or usuario.email).strip().lower()
    whatsapp = (datos.whatsapp_numero or usuario.whatsapp_numero or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
    genero = (datos.genero or "").strip().upper() or None
    if genero and genero not in {"MASCULINO", "FEMENINO"}:
        raise HTTPException(status_code=400, detail="Selecciona masculino o femenino.")
    numero_documento = (datos.numero_documento or "").strip().upper().replace(".", "") or None
    domicilio = (datos.domicilio or "").strip().upper() or None
    direccion = (datos.direccion or "").strip().upper() or None
    if (nombre, email, whatsapp, genero, numero_documento, domicilio, direccion) == (
        usuario.nombre_completo,
        usuario.email.lower(),
        usuario.whatsapp_numero,
        usuario.genero,
        usuario.numero_documento,
        usuario.domicilio,
        usuario.direccion,
    ):
        raise HTTPException(status_code=400, detail="No hay cambios para solicitar.")
    pending = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
        cliente_id=usuario.id,
        estado="PENDIENTE",
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="Ya tienes una solicitud pendiente de revisión.")
    duplicate = db.query(models.Usuario).filter(
        models.Usuario.email == email,
        models.Usuario.id != usuario.id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Ese correo ya está asociado a otra cuenta.")
    solicitud = models.SolicitudEdicionPerfilCliente(
        cliente_id=usuario.id,
        email_solicitado=email,
        nombre_completo_solicitado=nombre,
        whatsapp_numero_solicitado=whatsapp,
        genero_solicitado=genero,
        numero_documento_solicitado=numero_documento,
        domicilio_solicitado=domicilio,
        direccion_solicitada=direccion,
    )
    db.add(solicitud)
    db.flush()
    registrar_evento_auditoria(
        db, usuario, "cliente.solicitud_perfil.crear", "solicitud_edicion_perfil", solicitud.id
    )
    db.commit()
    db.refresh(solicitud)
    return _serializar_solicitud_perfil(solicitud)


@router.get("/solicitudes-edicion-perfil")
def listar_solicitudes_edicion_perfil_pendientes(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(
        usuario,
        ["ADMIN", "ABOGADO", "ABOGADO_ADMIN"],
        action="revisar solicitudes de edición de clientes",
    )
    query = db.query(models.SolicitudEdicionPerfilCliente).filter_by(estado="PENDIENTE")
    if usuario.rol != models.RolUsuario.ADMIN:
        allowed_clients = db.query(models.Usuario.id).filter(
            models.Usuario.creado_por_abogado_id == usuario.id
        )
        assigned_clients = db.query(models.ProcesoCliente.cliente_id).filter(
            models.ProcesoCliente.proceso_id.in_(lawyer_process_ids(db, usuario))
        )
        query = query.filter(
            or_(
                models.SolicitudEdicionPerfilCliente.cliente_id.in_(allowed_clients),
                models.SolicitudEdicionPerfilCliente.cliente_id.in_(assigned_clients),
            )
        )
    return [
        _serializar_solicitud_perfil(item)
        for item in query.order_by(models.SolicitudEdicionPerfilCliente.solicitada_en.asc()).all()
    ]


@router.patch("/solicitudes-edicion-perfil/{solicitud_id}")
def revisar_solicitud_edicion_perfil(
    solicitud_id: int,
    datos: schemas.SolicitudEdicionPerfilClienteRevision,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(security.obtener_usuario_actual),
):
    require_roles(
        usuario,
        ["ADMIN", "ABOGADO", "ABOGADO_ADMIN"],
        action="revisar solicitudes de edición de clientes",
    )
    solicitud = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
        id=solicitud_id,
        estado="PENDIENTE",
    ).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud pendiente no encontrada.")
    if not _abogado_puede_gestionar_cliente(usuario, solicitud.cliente, db):
        raise HTTPException(status_code=404, detail="Solicitud pendiente no encontrada.")
    if datos.decision == "APROBAR":
        duplicate = db.query(models.Usuario).filter(
            models.Usuario.email == solicitud.email_solicitado,
            models.Usuario.id != solicitud.cliente_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="El correo solicitado ya pertenece a otra cuenta.")
        solicitud.cliente.email = solicitud.email_solicitado
        solicitud.cliente.nombre_completo = solicitud.nombre_completo_solicitado
        solicitud.cliente.whatsapp_numero = solicitud.whatsapp_numero_solicitado
        if solicitud.genero_solicitado is not None:
            solicitud.cliente.genero = solicitud.genero_solicitado
        if solicitud.numero_documento_solicitado is not None:
            solicitud.cliente.numero_documento = solicitud.numero_documento_solicitado.replace(".", "")
        if solicitud.domicilio_solicitado is not None:
            solicitud.cliente.domicilio = solicitud.domicilio_solicitado
        if solicitud.direccion_solicitada is not None:
            solicitud.cliente.direccion = solicitud.direccion_solicitada
        solicitud.estado = "APROBADA"
        accion = "cliente.solicitud_perfil.aprobar"
    else:
        solicitud.estado = "RECHAZADA"
        accion = "cliente.solicitud_perfil.rechazar"
    solicitud.revisada_por_id = usuario.id
    solicitud.revisada_en = utc_ahora()
    solicitud.comentario_revision = (datos.comentario or "").strip() or None
    registrar_evento_auditoria(
        db, usuario, accion, "solicitud_edicion_perfil", solicitud.id
    )
    db.commit()
    db.refresh(solicitud)
    return {"mensaje": "Solicitud revisada.", "solicitud": _serializar_solicitud_perfil(solicitud)}


@router.get("/clientes/{cliente_id}")
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    cliente = db.query(models.Usuario).filter(models.Usuario.id == cliente_id, models.Usuario.rol == models.RolUsuario.CLIENTE).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        assigned_client = (
            db.query(models.ProcesoCliente.proceso_id)
            .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
            .filter(
                models.ProcesoCliente.cliente_id == cliente.id,
                models.Proceso.id.in_(lawyer_process_ids(db, usuario)),
            )
            .first()
        )
        if cliente.creado_por_abogado_id != responsible_lawyer_id and not assigned_client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    procesos_query = db.query(models.Proceso).join(models.ProcesoCliente).filter(
        models.ProcesoCliente.cliente_id == cliente.id,
        models.Proceso.archivado_en.is_(None),
    )
    tareas_query = db.query(models.Tarea).filter(models.Tarea.cliente_id == cliente.id)
    active_processes = (
        db.query(models.Proceso.id).filter(models.Proceso.archivado_en.is_(None))
        if responsible_lawyer_id is None
        else lawyer_process_ids(db, usuario)
    )
    tareas_query = tareas_query.filter(
        or_(models.Tarea.proceso_id.is_(None), models.Tarea.proceso_id.in_(active_processes))
    )
    solicitudes_query = db.query(models.SolicitudDocumento).join(models.Proceso).filter(
        models.SolicitudDocumento.cliente_id == cliente.id,
        models.Proceso.archivado_en.is_(None),
    )
    if responsible_lawyer_id is not None:
        assigned_processes = lawyer_process_ids(db, usuario)
        procesos_query = procesos_query.filter(models.Proceso.id.in_(assigned_processes))
        tareas_query = tareas_query.filter(
            or_(models.Tarea.usuario_id == responsible_lawyer_id, models.Tarea.proceso_id.in_(assigned_processes))
        )
        solicitudes_query = solicitudes_query.filter(models.Proceso.abogado_id == responsible_lawyer_id)
    procesos = procesos_query.order_by(models.Proceso.id.desc()).all()
    process_names = {p.id: p.nombre for p in procesos}
    tareas = tareas_query.order_by(models.Tarea.created_at.desc()).all()
    solicitudes = solicitudes_query.order_by(models.SolicitudDocumento.created_at.desc()).all()
    process_ids = [p.id for p in procesos]
    chat_process = None
    if usuario.rol != models.RolUsuario.ADMIN:
        chat_process = db.query(models.Proceso).filter(
            models.Proceso.id.in_(process_ids or [-1]),
            or_(
                models.Proceso.abogado_id == usuario.id,
                db.query(models.ProcesoColaborador.abogado_id).filter(
                    models.ProcesoColaborador.proceso_id == models.Proceso.id,
                    models.ProcesoColaborador.abogado_id == usuario.id,
                    models.ProcesoColaborador.visible_cliente.is_(True),
                ).exists(),
            ),
        ).order_by(models.Proceso.id.desc()).first()
    comunicaciones_query = db.query(models.ComunicacionProceso).filter(
        models.ComunicacionProceso.proceso_id.in_(process_ids or [-1]),
        or_(
            models.ComunicacionProceso.visibilidad == "INTERNA",
            (models.ComunicacionProceso.visibilidad == "CLIENTE")
            & (models.ComunicacionProceso.cliente_id == cliente.id),
        ),
    )
    comunicaciones = comunicaciones_query.order_by(models.ComunicacionProceso.created_at.desc()).limit(50).all()
    avisos_query = db.query(models.NotificacionProceso).filter(models.NotificacionProceso.cliente_id == cliente.id)
    avisos_query = avisos_query.filter(models.NotificacionProceso.proceso_id.in_(process_ids or [-1]))
    avisos = avisos_query.order_by(models.NotificacionProceso.created_at.desc()).limit(50).all()
    actividad = [
        {"tipo": "comunicacion", "titulo": item.asunto, "descripcion": item.contenido,
         "fecha": item.created_at, "visibilidad": item.visibilidad,
         "proceso_id": item.proceso_id, "proceso": item.proceso.nombre,
         "actor": item.actor.nombre_completo if item.actor else "Equipo jurídico"}
        for item in comunicaciones
    ]
    actividad.extend(
        {"tipo": "tarea", "titulo": t.titulo, "descripcion": f"Tarea {t.estado.value.lower()}.",
         "fecha": t.created_at, "visibilidad": "INTERNA", "proceso_id": t.proceso_id,
         "proceso": t.proceso.nombre if t.proceso else None, "actor": None}
        for t in tareas[:20]
    )
    actividad.extend(
        {"tipo": "documento", "titulo": s.titulo,
         "descripcion": "Documento recibido" if s.atendida_en else "Solicitud de documento pendiente",
         "fecha": s.atendida_en or s.created_at, "visibilidad": "CLIENTE",
         "proceso_id": s.proceso_id, "proceso": s.proceso.nombre, "actor": None}
        for s in solicitudes[:20]
    )
    actividad.extend(
        {"tipo": "comunicacion", "titulo": aviso.asunto, "descripcion": aviso.cuerpo,
         "fecha": aviso.created_at, "visibilidad": "CLIENTE", "proceso_id": aviso.proceso_id,
         "proceso": process_names.get(aviso.proceso_id),
         "actor": (db.query(models.Usuario.nombre_completo).filter_by(id=aviso.abogado_id).scalar() or "Equipo jurídico")}
        for aviso in avisos
    )
    actividad.sort(key=lambda item: item["fecha"] or datetime.min, reverse=True)
    ultimo_contacto = max(
        [item.created_at for item in comunicaciones + avisos if item.created_at],
        default=None,
    )
    return {
        "id": cliente.id, "nombre_completo": cliente.nombre_completo, "email": cliente.email,
        "whatsapp_numero": cliente.whatsapp_numero, "canal_notificacion_cliente": cliente.canal_notificacion_cliente,
        "notificaciones_email": cliente.notificaciones_email, "notificaciones_whatsapp": cliente.notificaciones_whatsapp,
        "genero": cliente.genero, "numero_documento": cliente.numero_documento,
        "domicilio": cliente.domicilio, "direccion": cliente.direccion,
        "estado_relacion": "ACTIVO" if procesos else "SIN_PROCESOS",
        "ultimo_contacto": ultimo_contacto,
        "chat_href": (
            chat_conversation_url(usuario, chat_process.id, cliente.id)
            if chat_process
            else user_portal_url(usuario, "/gestion-procesos/abogado/chat")
            if usuario.rol != models.RolUsuario.ADMIN
            else None
        ),
        "procesos": [{"id": p.id, "nombre": p.nombre} for p in procesos],
        "tareas": [{"id": t.id, "titulo": t.titulo, "estado": t.estado.value, "fecha_limite": t.fecha_limite, "proceso_id": t.proceso_id} for t in tareas],
        "solicitudes_documento": [{"id": s.id, "titulo": s.titulo, "atendida_en": s.atendida_en, "proceso": s.proceso.nombre, "created_at": s.created_at, **_resumen_solicitud_documento(s)} for s in solicitudes],
        "actividad": [{**item, "fecha": item["fecha"].isoformat() if item["fecha"] else None} for item in actividad[:50]],
        "comunicaciones": [{"id": f"comunicacion:{item.id}", "asunto": item.asunto, "contenido": item.contenido,
            "visibilidad": item.visibilidad, "canal": item.canal, "created_at": item.created_at,
            "proceso_id": item.proceso_id, "proceso": item.proceso.nombre,
            "actor": item.actor.nombre_completo if item.actor else "Equipo jurídico"} for item in comunicaciones]
            + [{"id": f"aviso:{item.id}", "asunto": item.asunto, "contenido": item.cuerpo,
               "visibilidad": "CLIENTE", "canal": "NOTIFICACION", "created_at": item.created_at,
               "proceso_id": item.proceso_id, "proceso": process_names.get(item.proceso_id),
               "actor": db.query(models.Usuario.nombre_completo).filter_by(id=item.abogado_id).scalar() or "Equipo jurídico"} for item in avisos],
    }


@router.put("/clientes/{cliente_id}")
def actualizar_cliente(cliente_id: int, datos: schemas.ClienteUpdate, db: Session = Depends(get_db), usuario: models.Usuario = Depends(security.obtener_usuario_actual)):
    _abogado(usuario)
    cliente_query = db.query(models.Usuario).filter(models.Usuario.id == cliente_id, models.Usuario.rol == models.RolUsuario.CLIENTE)
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is not None:
        assigned_clients = (
            db.query(models.ProcesoCliente.cliente_id)
            .join(models.Proceso, models.ProcesoCliente.proceso_id == models.Proceso.id)
            .filter(models.Proceso.id.in_(lawyer_process_ids(db, usuario)))
        )
        cliente_query = cliente_query.filter(
            or_(
                models.Usuario.creado_por_abogado_id == responsible_lawyer_id,
                models.Usuario.id.in_(assigned_clients),
            )
        )
    cliente = cliente_query.first()
    if not cliente: raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    genero = (datos.genero or "").strip().upper() or None
    if genero and genero not in {"MASCULINO", "FEMENINO"}:
        raise HTTPException(status_code=422, detail="El género debe ser MASCULINO o FEMENINO.")
    cliente.nombre_completo = datos.nombre_completo.strip()
    cliente.whatsapp_numero = datos.whatsapp_numero.strip()
    cliente.genero = genero
    cliente.numero_documento = (datos.numero_documento or "").strip().replace(".", "") or None
    cliente.domicilio = (datos.domicilio or "").strip() or None
    cliente.direccion = (datos.direccion or "").strip() or None
    registrar_evento_auditoria(db, usuario, "cliente.actualizar", "usuario", cliente.id)
    db.commit(); db.refresh(cliente)
    return {"id": cliente.id, "mensaje": "Cliente actualizado."}
