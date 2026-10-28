"""Autenticación, recuperación de contraseña, perfil y códigos de seguridad del usuario."""

import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import models, schemas, security, storage
from app.audit import (
    registrar_evento_auditoria,
)
from app.database import get_db
from app.email_service import enviar_correo
from app.message_templates import render_message
from app.nucleo.sesion import fijar_cookie_sesion
from app.notification_policy import PREFERENCIA_PLAN_WHATSAPP, plan_whatsapp_habilitado
from app.password_reset import password_reset_url, send_password_reset_email
from app.rate_limit import (
    VENTANA_INTENTOS,
    VENTANA_LOGIN,
    clave_intento,
    ip_cliente,
    limite_excedido,
    registrar_intentos,
)
from app.security import obtener_usuario_actual
from app.security_notifications import send_security_change_confirmation
from app.timezone import utc_ahora

router = APIRouter()


ALLOWED_CARD_TYPES = {"application/pdf", "image/jpeg", "image/png"}
ALLOWED_CARD_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
CARD_TYPE_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}
MAX_CARD_SIZE_BYTES = 10 * 1024 * 1024
PASSWORD_RESET_MESSAGE = "Si existe una cuenta activa con ese correo, enviaremos un enlace para restablecer la contraseña."


@router.post("/api/auth/registro", status_code=status.HTTP_201_CREATED)
def registrar_abogado(
    email: str = Form(...),
    password: str = Form(...),
    nombre_completo: str = Form(...),
    whatsapp_numero: str = Form(...),
    tarjeta_profesional: UploadFile = File(...),
    plan_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Registra un abogado externo SaaS y lo deja pendiente de aprobación."""
    email = email.strip().lower()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres.")
    if db.query(models.Usuario).filter(models.Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado.")

    original_name = tarjeta_profesional.filename or ""
    extension = os.path.splitext(original_name)[1].lower()
    content_type = tarjeta_profesional.content_type or ""
    if (
        extension not in ALLOWED_CARD_EXTENSIONS
        or content_type not in ALLOWED_CARD_TYPES
        or CARD_TYPE_BY_EXTENSION.get(extension) != content_type
    ):
        raise HTTPException(
            status_code=400,
            detail="La tarjeta profesional debe ser un PDF, JPG o PNG.",
        )

    tarjeta_profesional.file.seek(0, os.SEEK_END)
    file_size = tarjeta_profesional.file.tell()
    tarjeta_profesional.file.seek(0)
    if file_size == 0 or file_size > MAX_CARD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="El archivo debe tener máximo 10 MB.")

    plan = db.query(models.Plan).filter(
        models.Plan.id == plan_id, models.Plan.activo == True
    ).first()
    if not plan:
        raise HTTPException(status_code=400, detail="El plan seleccionado no está disponible.")

    # La clave no contiene el correo ni datos personales. R2 permanece privado.
    object_key = f"registros/tarjetas-profesionales/{uuid4().hex}{extension}"
    try:
        storage.get_r2_client().upload_fileobj(
            tarjeta_profesional.file,
            storage.get_r2_tp_registros_bucket(),
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No fue posible guardar el documento. Intenta nuevamente.",
        ) from exc

    # Crear el usuario en estado PENDIENTE_APROBACION
    nuevo_usuario = models.Usuario(
        email=email,
        password_hash=security.hash_password(password),
        nombre_completo=nombre_completo,
        whatsapp_numero=whatsapp_numero,
        rol=models.RolUsuario.ABOGADO,
        estado=models.EstadoUsuario.PENDIENTE_APROBACION,
        plan_id=plan.id,
    )
    db.add(nuevo_usuario)
    db.flush()

    # Guardar registro de la solicitud
    solicitud = models.SolicitudRegistro(
        usuario_id=nuevo_usuario.id,
        ruta_tarjeta_profesional=object_key,
    )
    db.add(solicitud)
    db.flush()
    registrar_evento_auditoria(
        db, nuevo_usuario, "auth.registro.solicitar", "solicitud_registro", solicitud.id
    )
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        # Evita dejar un documento huérfano si falla el registro en la base de datos.
        try:
            storage.get_r2_client().delete_object(Bucket=storage.get_r2_tp_registros_bucket(), Key=object_key)
        except (BotoCoreError, ClientError):
            pass
        raise HTTPException(status_code=500, detail="No fue posible completar el registro.") from exc

    return {
        "mensaje": "Registro recibido con éxito. Tu cuenta se activará tras revisar la tarjeta profesional.",
        "usuario_id": nuevo_usuario.id,
    }


@router.post("/api/auth/login", response_model=schemas.Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    remember_me: bool = Form(True),
    db: Session = Depends(get_db),
    response: Response = None,
):
    """Inicia sesión y genera el token JWT. Valida que la cuenta esté activa.

    También deja el token en la cookie httpOnly de la API v2, para que el paso
    del frontend a la sesión por cookie no obligue a iniciar sesión otra vez.
    """
    claves_fallo = [clave_intento("login:email", form_data.username), clave_intento("login:ip", ip_cliente(request))]
    if limite_excedido(db, list(zip(claves_fallo, (10, 50))), VENTANA_LOGIN):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.")

    usuario = db.query(models.Usuario).filter(models.Usuario.email == form_data.username).first()

    if not usuario or not security.verify_password(form_data.password, usuario.password_hash):
        registrar_intentos(db, claves_fallo)
        raise HTTPException(status_code=400, detail="Correo o contraseña incorrectos.")

    if usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta aún no ha sido aprobada. Espera la verificación de tu Tarjeta Profesional.",
        )

    if usuario.estado == models.EstadoUsuario.SUSPENDIDO:
        raise HTTPException(status_code=403, detail="Tu cuenta está suspendida. Contacta al administrador de la plataforma.")

    if usuario.estado == models.EstadoUsuario.RECHAZADO:
        raise HTTPException(status_code=403, detail="Tu solicitud de registro fue rechazada.")

    usuario.ultimo_acceso = utc_ahora()
    db.commit()
    access_token = security.create_access_token(
        data={"sub": str(usuario.id)}, persistent=remember_me,
    )
    if response is not None:
        fijar_cookie_sesion(response, access_token, persistente=remember_me)
    return {"access_token": access_token, "token_type": "bearer", "debe_cambiar_password": usuario.debe_cambiar_password}


@router.post("/api/auth/refresh-token", response_model=schemas.Token)
def refresh_token(
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    token: str = Depends(security.oauth2_scheme),
    db: Session = Depends(get_db),
    response: Response = None,
):
    """Renueva el token JWT manteniendo la misma politica de expiracion (sliding window).

    Si el token original fue emitido con persistent=True el nuevo token
    tambien sera persistente (15 dias desde ahora).  Esto permite que la
    sesion se mantenga activa indefinidamente mientras el usuario acceda
    al menos una vez cada 15 dias.
    """
    payload = security.decode_token_payload(token)
    persistent = bool(payload.get("persistent")) if payload else False
    usuario_actual.ultimo_acceso = utc_ahora()
    db.commit()
    new_token = security.create_access_token(
        data={"sub": str(usuario_actual.id)}, persistent=persistent,
    )
    if response is not None:
        fijar_cookie_sesion(response, new_token, persistente=persistent)
    return {"access_token": new_token, "token_type": "bearer", "debe_cambiar_password": usuario_actual.debe_cambiar_password}


@router.post("/api/auth/cambiar-password")
def cambiar_password(
    datos: schemas.CambiarPasswordIn,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_para_cambio_password),
    token: str = Depends(security.oauth2_scheme),
    db: Session = Depends(get_db),
    response: Response = None,
):
    if not usuario_actual.debe_cambiar_password:
        raise HTTPException(status_code=403, detail="Para cambiar tu contraseña, solicita y verifica un código desde Configuración > Seguridad.")
    if not security.verify_password(datos.password_actual, usuario_actual.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    if len(datos.password_nueva) < 8:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 8 caracteres.")
    usuario_actual.password_hash = security.hash_password(datos.password_nueva)
    usuario_actual.debe_cambiar_password = False
    usuario_actual.ultimo_acceso = utc_ahora()
    registrar_evento_auditoria(db, usuario_actual, "auth.password.cambiar", "usuario", usuario_actual.id)
    db.commit()

    # Generar token de sesión para que el usuario quede autenticado de inmediato
    payload = security.decode_token_payload(token)
    persistent = bool(payload.get("persistent", True)) if payload else True
    new_token = security.create_access_token(
        data={"sub": str(usuario_actual.id)}, persistent=persistent,
    )
    if response is not None:
        fijar_cookie_sesion(response, new_token, persistente=persistent)
    rol_str = (
        usuario_actual.rol.value
        if hasattr(usuario_actual.rol, "value")
        else str(usuario_actual.rol)
    )
    return {
        "mensaje": "Contraseña actualizada con éxito.",
        "access_token": new_token,
        "token_type": "bearer",
        "debe_cambiar_password": False,
        "rol": rol_str,
        "email": usuario_actual.email,
        "nombre_completo": usuario_actual.nombre_completo,
    }


@router.post("/api/auth/recuperar-password")
def solicitar_recuperacion_password(
    datos: schemas.SolicitudRecuperacionPassword,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = str(datos.email).strip().lower()
    claves = [clave_intento("recuperar:ip", ip_cliente(request)), clave_intento("recuperar:email", email)]
    if limite_excedido(db, list(zip(claves, (8, 3))), VENTANA_INTENTOS):
        return {"mensaje": PASSWORD_RESET_MESSAGE}
    registrar_intentos(db, claves)

    usuario = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if usuario and usuario.estado == models.EstadoUsuario.ACTIVO:
        token = security.create_password_reset_token(usuario.id, usuario.password_hash)
        background_tasks.add_task(send_password_reset_email, email, password_reset_url(token, usuario.rol))
    return {"mensaje": PASSWORD_RESET_MESSAGE}


@router.post("/api/auth/restablecer-password")
def restablecer_password(
    datos: schemas.ConfirmacionRecuperacionPassword,
    db: Session = Depends(get_db),
):
    if len(datos.password_nueva) < 8:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 8 caracteres.")
    usuario_id = security.password_reset_token_user_id(datos.token)
    if usuario_id is None:
        raise HTTPException(status_code=400, detail="El enlace de recuperación no es válido o ha expirado.")
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if (
        not usuario
        or security.verify_password_reset_token(datos.token, usuario.password_hash) != usuario.id
    ):
        raise HTTPException(status_code=400, detail="El enlace de recuperación no es válido o ha expirado.")

    usuario.password_hash = security.hash_password(datos.password_nueva)
    usuario.debe_cambiar_password = False
    registrar_evento_auditoria(db, usuario, "auth.password.restablecer", "usuario", usuario.id)
    db.commit()
    return {"mensaje": "Contraseña restablecida. Ya puedes iniciar sesión."}


@router.patch("/api/auth/preferencias-notificaciones")
def actualizar_preferencias_notificaciones(datos: schemas.PreferenciasNotificacionUpdate, usuario_actual: models.Usuario = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if usuario_actual.rol == models.RolUsuario.CLIENTE:
        if datos.preferencias is not None:
            raise HTTPException(status_code=400, detail="Los clientes configuran los canales de notificación directamente.")
        if datos.canal_cliente is not None:
            email_enabled = datos.canal_cliente == "EMAIL"
            whatsapp_enabled = datos.canal_cliente == "WHATSAPP"
        else:
            email_enabled = datos.notificaciones_email if datos.notificaciones_email is not None else usuario_actual.notificaciones_email
            whatsapp_enabled = datos.notificaciones_whatsapp if datos.notificaciones_whatsapp is not None else usuario_actual.notificaciones_whatsapp
        if not email_enabled and not whatsapp_enabled:
            raise HTTPException(status_code=400, detail="Selecciona al menos un canal de notificación.")
        if whatsapp_enabled and not (usuario_actual.whatsapp_numero or "").strip():
            raise HTTPException(status_code=400, detail="Configura un número de WhatsApp antes de habilitar ese canal.")
        usuario_actual.notificaciones_email = email_enabled
        usuario_actual.notificaciones_whatsapp = whatsapp_enabled
        usuario_actual.canal_notificacion_cliente = (
            "EMAIL" if email_enabled and not whatsapp_enabled
            else "WHATSAPP" if whatsapp_enabled and not email_enabled
            else None
        )
    else:
        if datos.canal_cliente is not None:
            raise HTTPException(status_code=400, detail="El canal obligatorio solo aplica a CLIENTE.")
        preferencias = dict(usuario_actual.preferencias_notificacion or {})
        if datos.preferencias is not None:
            desconocidas = set(datos.preferencias) - set(models.TIPOS_NOTIFICACION)
            if desconocidas:
                raise HTTPException(status_code=400, detail="La solicitud contiene tipos de notificación desconocidos.")
            for tipo, canales in datos.preferencias.items():
                if canales.whatsapp and not usuario_actual.whatsapp_numero.strip():
                    raise HTTPException(status_code=400, detail="Configura un número de WhatsApp antes de habilitar ese canal.")
                funcion_plan = PREFERENCIA_PLAN_WHATSAPP.get(tipo)
                if canales.whatsapp and funcion_plan and not plan_whatsapp_habilitado(usuario_actual, funcion_plan):
                    raise HTTPException(status_code=403, detail="Tu plan no permite WhatsApp para ese tipo de notificación.")
                preferencias[tipo] = canales.model_dump()
        if datos.notificaciones_email is not None or datos.notificaciones_whatsapp is not None:
            for tipo in models.TIPOS_NOTIFICACION:
                canales = dict(preferencias.get(tipo) or {})
                if datos.notificaciones_email is not None:
                    canales["email"] = datos.notificaciones_email
                if datos.notificaciones_whatsapp is not None:
                    canales["whatsapp"] = datos.notificaciones_whatsapp
                preferencias[tipo] = canales
        usuario_actual.preferencias_notificacion = {
            tipo: {
                "email": bool((preferencias.get(tipo) or {}).get("email", True)),
                "whatsapp": bool((preferencias.get(tipo) or {}).get("whatsapp", False)),
            }
            for tipo in models.TIPOS_NOTIFICACION
        }
        usuario_actual.notificaciones_email = any(
            canales["email"] for canales in usuario_actual.preferencias_notificacion.values()
        )
        usuario_actual.notificaciones_whatsapp = any(
            canales["whatsapp"] for canales in usuario_actual.preferencias_notificacion.values()
        )
    # Silenciamiento de canales cuando push está activo
    if datos.silenciar_email_si_push is not None:
        usuario_actual.silenciar_email_si_push = datos.silenciar_email_si_push
    if datos.silenciar_whatsapp_si_push is not None:
        usuario_actual.silenciar_whatsapp_si_push = datos.silenciar_whatsapp_si_push
    registrar_evento_auditoria(db, usuario_actual, "auth.notificaciones.actualizar", "usuario", usuario_actual.id)
    db.commit()
    return {
        "preferencias_notificacion": usuario_actual.preferencias_notificacion,
        "canal_notificacion_cliente": usuario_actual.canal_notificacion_cliente,
        "notificaciones_email": usuario_actual.notificaciones_email,
        "notificaciones_whatsapp": usuario_actual.notificaciones_whatsapp,
        "silenciar_email_si_push": usuario_actual.silenciar_email_si_push,
        "silenciar_whatsapp_si_push": usuario_actual.silenciar_whatsapp_si_push,
    }


def _hash_codigo_seguridad(challenge_id: str, usuario_id: int, accion: str, codigo: str) -> str:
    secreto = security.get_jwt_secret().encode()
    mensaje = f"{challenge_id}:{usuario_id}:{accion}:{codigo}".encode()
    return hmac.new(secreto, mensaje, hashlib.sha256).hexdigest()


def _enviar_codigo_seguridad(db: Session, usuario: models.Usuario, canal: str, codigo: str) -> bool:
    asunto, mensaje = render_message(db, "CODIGO_SEGURIDAD", {"nombre": usuario.nombre_completo, "codigo": codigo}, canal=canal)
    if canal == "EMAIL":
        return enviar_correo(usuario.email, asunto, mensaje)
    from app.whatsapp import enviar_mensaje_whatsapp
    return bool(usuario.whatsapp_numero and enviar_mensaje_whatsapp(usuario.whatsapp_numero, mensaje))


def _datos_codigo(challenge: models.CodigoSeguridadUsuario) -> dict:
    return {
        "id": challenge.id,
        "accion": challenge.accion,
        "canal": challenge.canal,
        "expira_en": challenge.expira_en.isoformat() + "Z",
        "reenviar_desde": challenge.reenviar_desde.isoformat() + "Z",
        "verificado": challenge.valor_pendiente == "__OTP_VERIFICADO__",
    }


@router.post("/api/auth/seguridad/codigos")
def solicitar_codigo_seguridad(
    datos: schemas.SolicitarCodigoSeguridad,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if datos.canal == "EMAIL" and not usuario.email:
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene un correo configurado.")
    if datos.canal == "WHATSAPP" and not (usuario.whatsapp_numero or "").strip():
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene un número de WhatsApp configurado.")

    ahora = utc_ahora()
    anterior = db.query(models.CodigoSeguridadUsuario).filter_by(
        usuario_id=usuario.id, accion=datos.accion, consumido_en=None
    ).order_by(models.CodigoSeguridadUsuario.creado_en.desc()).first()
    if anterior and anterior.expira_en > ahora and anterior.reenviar_desde > ahora:
        raise HTTPException(status_code=429, detail="Ya hay un código vigente. Espera el tiempo indicado para solicitar otro.")

    challenge_id = str(uuid4())
    codigo = f"{secrets.randbelow(1_000_000):06d}"
    if not _enviar_codigo_seguridad(db, usuario, datos.canal, codigo):
        raise HTTPException(status_code=503, detail="No fue posible enviar el código por ese canal.")
    if anterior:
        anterior.consumido_en = ahora
        anterior.valor_pendiente = None
    challenge = models.CodigoSeguridadUsuario(
        id=challenge_id, usuario_id=usuario.id, accion=datos.accion, canal=datos.canal,
        codigo_hash=_hash_codigo_seguridad(challenge_id, usuario.id, datos.accion, codigo),
        valor_pendiente=None, expira_en=ahora + timedelta(minutes=3),
        reenviar_desde=ahora + timedelta(seconds=60),
    )
    db.add(challenge)
    db.commit()
    return _datos_codigo(challenge)


@router.get("/api/auth/seguridad/codigos/activo")
def obtener_codigo_seguridad_activo(
    accion: str,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if accion not in {"email", "whatsapp", "password"}:
        raise HTTPException(status_code=400, detail="Acción no válida.")
    challenge = db.query(models.CodigoSeguridadUsuario).filter(
        models.CodigoSeguridadUsuario.usuario_id == usuario.id,
        models.CodigoSeguridadUsuario.accion == accion,
        models.CodigoSeguridadUsuario.consumido_en.is_(None),
        models.CodigoSeguridadUsuario.expira_en > utc_ahora(),
    ).order_by(models.CodigoSeguridadUsuario.creado_en.desc()).first()
    db.query(models.CodigoSeguridadUsuario).filter(
        models.CodigoSeguridadUsuario.usuario_id == usuario.id,
        models.CodigoSeguridadUsuario.expira_en <= utc_ahora(),
        models.CodigoSeguridadUsuario.consumido_en.is_(None),
    ).update({
        models.CodigoSeguridadUsuario.valor_pendiente: None,
        models.CodigoSeguridadUsuario.consumido_en: utc_ahora(),
    }, synchronize_session=False)
    db.commit()
    return _datos_codigo(challenge) if challenge else None


@router.post("/api/auth/seguridad/codigos/{challenge_id}/reenviar")
def reenviar_codigo_seguridad(
    challenge_id: str,
    datos: schemas.ReenviarCodigoSeguridad,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    challenge = db.query(models.CodigoSeguridadUsuario).filter_by(
        id=challenge_id, usuario_id=usuario.id, consumido_en=None
    ).with_for_update().first()
    ahora = utc_ahora()
    if not challenge or challenge.expira_en <= ahora:
        raise HTTPException(status_code=410, detail="El código venció. Solicita uno nuevo.")
    if challenge.reenviar_desde > ahora:
        raise HTTPException(status_code=429, detail="Espera antes de reenviar o cambiar el canal.")
    if datos.canal == "EMAIL" and not usuario.email:
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene un correo configurado.")
    if datos.canal == "WHATSAPP" and not (usuario.whatsapp_numero or "").strip():
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene un número de WhatsApp configurado.")
    codigo = f"{secrets.randbelow(1_000_000):06d}"
    if not _enviar_codigo_seguridad(db, usuario, datos.canal, codigo):
        raise HTTPException(status_code=503, detail="No fue posible enviar el código por ese canal.")
    challenge.canal = datos.canal
    challenge.codigo_hash = _hash_codigo_seguridad(challenge.id, usuario.id, challenge.accion, codigo)
    challenge.expira_en = ahora + timedelta(minutes=3)
    challenge.reenviar_desde = ahora + timedelta(seconds=60)
    challenge.intentos = 0
    challenge.valor_pendiente = None
    db.commit()
    return _datos_codigo(challenge)


@router.post("/api/auth/seguridad/codigos/{challenge_id}/verificar")
def verificar_codigo_seguridad(
    challenge_id: str,
    datos: schemas.VerificarCodigoSeguridad,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    challenge = db.query(models.CodigoSeguridadUsuario).filter_by(
        id=challenge_id, usuario_id=usuario.id, consumido_en=None
    ).with_for_update().first()
    ahora = utc_ahora()
    if not challenge or challenge.expira_en <= ahora:
        raise HTTPException(status_code=410, detail="El código venció. Solicita uno nuevo.")
    if challenge.intentos >= 5:
        challenge.consumido_en = ahora
        challenge.valor_pendiente = None
        db.commit()
        raise HTTPException(status_code=429, detail="Se agotaron los intentos. Solicita un código nuevo.")
    esperado = _hash_codigo_seguridad(challenge.id, usuario.id, challenge.accion, datos.codigo)
    if not hmac.compare_digest(esperado, challenge.codigo_hash):
        challenge.intentos += 1
        db.commit()
        raise HTTPException(status_code=400, detail="El código no es correcto.")
    challenge.valor_pendiente = "__OTP_VERIFICADO__"
    db.commit()
    return {"mensaje": "Código verificado. Ingresa el nuevo dato.", "verificado": True}


@router.post("/api/auth/seguridad/codigos/{challenge_id}/aplicar")
def aplicar_cambio_seguridad(
    challenge_id: str,
    datos: schemas.AplicarCambioSeguridad,
    background_tasks: BackgroundTasks,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    challenge = db.query(models.CodigoSeguridadUsuario).filter_by(
        id=challenge_id, usuario_id=usuario.id, consumido_en=None
    ).with_for_update().first()
    ahora = utc_ahora()
    if not challenge or challenge.expira_en <= ahora:
        raise HTTPException(status_code=410, detail="El código venció. Solicita uno nuevo.")
    if challenge.valor_pendiente != "__OTP_VERIFICADO__":
        raise HTTPException(status_code=403, detail="Primero debes validar el código enviado.")

    old_email = usuario.email
    old_whatsapp = usuario.whatsapp_numero or ""
    if challenge.accion == "email":
        from pydantic import TypeAdapter, ValidationError
        if not datos.valor:
            raise HTTPException(status_code=400, detail="Ingresa el nuevo correo.")
        try:
            new_email = str(TypeAdapter(schemas.EmailStr).validate_python(datos.valor)).strip().lower()
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail="Ingresa un correo válido.") from exc
        if db.query(models.Usuario).filter(models.Usuario.email == new_email, models.Usuario.id != usuario.id).first():
            raise HTTPException(status_code=409, detail="Este correo ya está asociado a otra cuenta.")
        usuario.email = new_email
        change_label = "correo de acceso"
    elif challenge.accion == "whatsapp":
        number = "".join(char for char in (datos.valor or "") if char.isdigit())
        if len(number) < 10 or len(number) > 15:
            raise HTTPException(status_code=400, detail="Ingresa un número válido con indicativo de país.")
        usuario.whatsapp_numero = number
        change_label = "número de WhatsApp"
    else:
        if not datos.password_actual or not security.verify_password(datos.password_actual, usuario.password_hash):
            raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
        if not datos.password_nueva or len(datos.password_nueva) < 8 or len(datos.password_nueva.encode("utf-8")) > 72:
            raise HTTPException(status_code=400, detail="La nueva contraseña debe tener entre 8 y 72 bytes UTF-8.")
        usuario.password_hash = security.hash_password(datos.password_nueva)
        usuario.debe_cambiar_password = False
        change_label = "contraseña"

    if usuario.rol == models.RolUsuario.CLIENTE and challenge.accion in {"email", "whatsapp"}:
        pending_profile_requests = db.query(models.SolicitudEdicionPerfilCliente).filter_by(
            cliente_id=usuario.id, estado="PENDIENTE",
        ).all()
        for pending_request in pending_profile_requests:
            pending_request.email_solicitado = usuario.email
            pending_request.whatsapp_numero_solicitado = usuario.whatsapp_numero or ""

    challenge.consumido_en = ahora
    challenge.valor_pendiente = None
    registrar_evento_auditoria(db, usuario, f"auth.seguridad.{challenge.accion}", "usuario", usuario.id)
    db.commit()
    db.refresh(usuario)
    emails = [old_email, usuario.email]
    whatsapp_numbers = [old_whatsapp, usuario.whatsapp_numero or ""]
    background_tasks.add_task(
        send_security_change_confirmation,
        usuario.nombre_completo,
        change_label,
        emails,
        whatsapp_numbers,
    )
    return {"mensaje": "Cambio aplicado. Enviamos una confirmación a tus canales registrados.", "email": usuario.email, "whatsapp_numero": usuario.whatsapp_numero}


@router.delete("/api/auth/seguridad/codigos/{challenge_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancelar_codigo_seguridad(
    challenge_id: str,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    challenge = db.query(models.CodigoSeguridadUsuario).filter_by(
        id=challenge_id, usuario_id=usuario.id, consumido_en=None
    ).with_for_update().first()
    if challenge:
        challenge.consumido_en = utc_ahora()
        challenge.valor_pendiente = None
        db.commit()
    return None


@router.delete("/api/auth/seguridad/codigos", status_code=status.HTTP_204_NO_CONTENT)
def cancelar_codigos_seguridad_activos(
    accion: str,
    usuario: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    if accion not in {"email", "whatsapp", "password"}:
        raise HTTPException(status_code=400, detail="Acción no válida.")
    db.query(models.CodigoSeguridadUsuario).filter(
        models.CodigoSeguridadUsuario.usuario_id == usuario.id,
        models.CodigoSeguridadUsuario.accion == accion,
        models.CodigoSeguridadUsuario.consumido_en.is_(None),
    ).update({
        models.CodigoSeguridadUsuario.valor_pendiente: None,
        models.CodigoSeguridadUsuario.consumido_en: utc_ahora(),
    }, synchronize_session=False)
    db.commit()
    return None


@router.patch("/api/auth/perfil")
def actualizar_mi_perfil(datos: schemas.PerfilUpdate, usuario_actual: models.Usuario = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if datos.email is not None or datos.whatsapp_numero is not None:
        raise HTTPException(status_code=403, detail="Correo y WhatsApp solo se pueden cambiar con verificación OTP desde Configuración > Seguridad.")
    if usuario_actual.rol == models.RolUsuario.CLIENTE and any(
        value is not None
        for value in (
            datos.email, datos.nombre_completo, datos.whatsapp_numero, datos.genero,
            datos.numero_documento, datos.domicilio, datos.direccion, datos.tarjeta_profesional,
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="Los clientes deben solicitar la edición de sus datos para aprobación.",
        )
    if datos.email is not None:
        email = str(datos.email).strip().lower()
        existing = db.query(models.Usuario).filter(
            models.Usuario.email == email,
            models.Usuario.id != usuario_actual.id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Este correo ya está asociado a otra cuenta.")
        usuario_actual.email = email
    if datos.nombre_completo is not None:
        nombre = datos.nombre_completo.strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre completo es obligatorio.")
        usuario_actual.nombre_completo = nombre
    if datos.whatsapp_numero is not None:
        usuario_actual.whatsapp_numero = datos.whatsapp_numero.strip()
    if datos.genero is not None:
        genero = datos.genero.strip().upper()
        if genero and genero not in {"MASCULINO", "FEMENINO"}:
            raise HTTPException(status_code=400, detail="Selecciona masculino o femenino.")
        usuario_actual.genero = genero or None
    for field in ("numero_documento", "domicilio", "direccion", "tarjeta_profesional"):
        value = getattr(datos, field)
        if value is not None:
            normalized = value.strip().upper()
            if field in {"numero_documento", "tarjeta_profesional"}:
                normalized = normalized.replace(".", "")
            setattr(usuario_actual, field, normalized or None)
    registrar_evento_auditoria(db, usuario_actual, "auth.perfil.actualizar", "usuario", usuario_actual.id)
    db.commit()
    db.refresh(usuario_actual)
    return {
        "email": usuario_actual.email, "nombre_completo": usuario_actual.nombre_completo,
        "whatsapp_numero": usuario_actual.whatsapp_numero, "genero": usuario_actual.genero,
        "numero_documento": usuario_actual.numero_documento, "domicilio": usuario_actual.domicilio,
        "direccion": usuario_actual.direccion, "tarjeta_profesional": usuario_actual.tarjeta_profesional,
    }


@router.get("/api/auth/me")
def obtener_mi_usuario(
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_para_cambio_password),
):
    usuario = usuario_actual
    return {
        "id": usuario.id,
        "email": usuario.email,
        "nombre_completo": usuario.nombre_completo,
        "whatsapp_numero": usuario.whatsapp_numero,
        "genero": usuario.genero,
        "numero_documento": usuario.numero_documento,
        "domicilio": usuario.domicilio,
        "direccion": usuario.direccion,
        "tarjeta_profesional": usuario.tarjeta_profesional,
        "rol": usuario.rol.value
        if hasattr(usuario.rol, "value")
        else usuario.rol,
        "estado": usuario.estado.value
        if hasattr(usuario.estado, "value")
        else usuario.estado,
        "debe_cambiar_password": usuario.debe_cambiar_password,
        "notificaciones_email": usuario.notificaciones_email,
        "notificaciones_whatsapp": usuario.notificaciones_whatsapp,
        "preferencias_notificacion": usuario.preferencias_notificacion or {},
        "canal_notificacion_cliente": usuario.canal_notificacion_cliente,
        "silenciar_email_si_push": usuario.silenciar_email_si_push,
        "silenciar_whatsapp_si_push": usuario.silenciar_whatsapp_si_push,
        "plan": (
            {
                "id": usuario.plan.id,
                "nombre": usuario.plan.nombre,
                "limite_radicados": usuario.plan.limite_radicados,
                "precio_mensual": usuario.plan.precio_mensual,
                "limite_ultimas_actuaciones": usuario.plan.limite_ultimas_actuaciones,
                "notificaciones_whatsapp_procesos": usuario.plan.notificaciones_whatsapp_procesos,
                "notificaciones_whatsapp_tareas": usuario.plan.notificaciones_whatsapp_tareas,
            }
            if usuario.plan
            else None
        ),
    }
