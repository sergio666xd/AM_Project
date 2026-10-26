import os
import hashlib
import hmac
import inspect
import logging
import secrets
from contextlib import asynccontextmanager
from uuid import uuid4
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, Request, status, UploadFile, File, Form
from starlette.background import BackgroundTask
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta
from app.timezone import utc_ahora
from pathlib import Path
from botocore.exceptions import BotoCoreError, ClientError
from app.database import engine, get_db
from app import models, schemas, security, storage
from app.email_service import enviar_correo
from app.site_content import PUBLIC_CONTENT_PAGES, PUBLIC_PAGE_ROUTES
from app.security import obtener_usuario_actual
from app.routers import admin, tareas, expedientes, workflows, contratos, chat
from app.radicados import (
    iniciar_consulta_nuevo_radicado,
    obtener_o_vincular_radicado,
    radicado_vinculado_a_usuario,
)
from app.notification_policy import PREFERENCIA_PLAN_WHATSAPP, plan_whatsapp_habilitado
from app.firm_access import require_roles
from app.audit import (
    establecer_contexto_solicitud_auditoria,
    limpiar_contexto_solicitud_auditoria,
    registrar_evento_auditoria,
)
from app.firm_access import has_firm_wide_access, lawyer_process_ids, lawyer_scope_id
from app.message_templates import render_message
from app.password_reset import password_reset_url, send_password_reset_email
from app.security_notifications import send_security_change_confirmation
from app.rate_limit import clave_intento, ip_cliente, limite_excedido, registrar_intentos

RUTA_MIGRACION_PLANTILLAS = Path(__file__).resolve().parents[1] / "migrations" / "2026_10_10_mensajes_configurables.sql"


def actualizar_esquema_planes() -> None:
    """Aplica columnas nuevas a instalaciones PostgreSQL ya existentes."""
    with engine.begin() as conexion:
        conexion.execute(text("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'ABOGADO_ADMIN'"))
        conexion.execute(text("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'CLIENTE'"))
        conexion.execute(text("ALTER TYPE estadousuario ADD VALUE IF NOT EXISTS 'SUSPENDIDO'"))
        conexion.execute(text("ALTER TABLE planes ADD COLUMN IF NOT EXISTS limite_ultimas_actuaciones INTEGER DEFAULT 5"))
        conexion.execute(text("ALTER TABLE planes ADD COLUMN IF NOT EXISTS notificaciones_whatsapp_procesos BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE planes ADD COLUMN IF NOT EXISTS notificaciones_whatsapp_tareas BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_por_abogado_id INTEGER"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notificaciones_email BOOLEAN NOT NULL DEFAULT TRUE"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notificaciones_whatsapp BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMP"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias_notificacion JSON NOT NULL DEFAULT '{}'::json"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS canal_notificacion_cliente VARCHAR(16)"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS genero VARCHAR(16)"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(40)"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS domicilio VARCHAR(120)"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion VARCHAR(300)"))
        conexion.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tarjeta_profesional VARCHAR(40)"))
        conexion.execute(text("ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS genero_solicitado VARCHAR(16)"))
        conexion.execute(text("ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS numero_documento_solicitado VARCHAR(40)"))
        conexion.execute(text("ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS domicilio_solicitado VARCHAR(120)"))
        conexion.execute(text("ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS direccion_solicitada VARCHAR(300)"))
        conexion.execute(text("""
            UPDATE usuarios
            SET preferencias_notificacion = json_build_object(
                'ACTUACIONES', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp),
                'ACCESO', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp),
                'TAREAS', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp),
                'SUBTAREAS', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp),
                'RECORDATORIOS', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp),
                'DOCUMENTOS', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp),
                'RESUMENES', json_build_object('email', notificaciones_email, 'whatsapp', notificaciones_whatsapp)
            )
            WHERE preferencias_notificacion::text = '{}'
        """))
        conexion.execute(text("""
            UPDATE usuarios
            SET canal_notificacion_cliente = CASE
                WHEN notificaciones_email THEN 'EMAIL'
                WHEN notificaciones_whatsapp AND whatsapp_numero <> '' THEN 'WHATSAPP'
                ELSE 'EMAIL'
            END
            WHERE rol = 'CLIENTE' AND canal_notificacion_cliente IS NULL
        """))
        conexion.execute(text("ALTER TABLE tareas ADD COLUMN IF NOT EXISTS proceso_id INTEGER"))
        conexion.execute(text("ALTER TABLE tareas ADD COLUMN IF NOT EXISTS cliente_id INTEGER"))
        conexion.execute(text("ALTER TABLE recordatorios_tareas ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1"))
        conexion.execute(text("ALTER TABLE recordatorios_tareas ADD COLUMN IF NOT EXISTS workflow_version_lanzada INTEGER NOT NULL DEFAULT 0"))
        conexion.execute(text("ALTER TABLE recordatorios_tareas ADD COLUMN IF NOT EXISTS notificar_email BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE recordatorios_tareas ADD COLUMN IF NOT EXISTS notificar_whatsapp BOOLEAN NOT NULL DEFAULT TRUE"))
        conexion.execute(text("ALTER TABLE recordatorios_tareas ADD COLUMN IF NOT EXISTS interno_sistema BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE entregas_notificacion ADD COLUMN IF NOT EXISTS recordatorio_version INTEGER"))
        conexion.execute(text("ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS endpoint VARCHAR(500)"))
        conexion.execute(text("ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS metodo VARCHAR(16)"))
        conexion.execute(text("ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS metadata_json TEXT"))
        conexion.execute(text("ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS error_tecnico TEXT"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS cliente_id INTEGER"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS asignada_cliente BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS proceso_id INTEGER REFERENCES procesos(id)"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS radicado_id INTEGER REFERENCES radicados(id)"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS actuacion_id INTEGER REFERENCES actuaciones(id)"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS notificar_email BOOLEAN NOT NULL DEFAULT TRUE"))
        conexion.execute(text("ALTER TABLE subtareas ADD COLUMN IF NOT EXISTS notificar_whatsapp BOOLEAN NOT NULL DEFAULT TRUE"))
        conexion.execute(text("ALTER TABLE procesos ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMP WITH TIME ZONE"))
        conexion.execute(text("ALTER TABLE procesos_colaboradores ADD COLUMN IF NOT EXISTS visible_cliente BOOLEAN NOT NULL DEFAULT FALSE"))
        conexion.execute(text("ALTER TABLE documentos_proceso ADD COLUMN IF NOT EXISTS estado_revision VARCHAR(24) NOT NULL DEFAULT 'RECIBIDO'"))
        conexion.execute(text("ALTER TABLE documentos_proceso ADD COLUMN IF NOT EXISTS comentario_revision TEXT"))
        conexion.execute(text("ALTER TABLE documentos_proceso ADD COLUMN IF NOT EXISTS revisado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL"))
        conexion.execute(text("ALTER TABLE documentos_proceso ADD COLUMN IF NOT EXISTS revisado_en TIMESTAMP"))
        conexion.execute(text("ALTER TABLE documentos_proceso ALTER COLUMN proceso_id DROP NOT NULL"))
        conexion.execute(text("ALTER TABLE documentos_proceso ALTER COLUMN cliente_id DROP NOT NULL"))
        conexion.execute(text("ALTER TABLE documentos_proceso ALTER COLUMN solicitud_id DROP NOT NULL"))
        conexion.execute(text("ALTER TABLE solicitudes_documento ADD COLUMN IF NOT EXISTS fecha_limite TIMESTAMP"))
        conexion.execute(text("ALTER TABLE comunicaciones_proceso ADD COLUMN IF NOT EXISTS leido_en TIMESTAMP"))
        conexion.execute(text("ALTER TABLE eventos_agenda ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL"))
        conexion.execute(text("ALTER TABLE eventos_agenda ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos_servicios(id) ON DELETE SET NULL"))
        conexion.execute(text("ALTER TABLE documentos_proceso ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos_servicios(id) ON DELETE SET NULL"))
        conexion.execute(text("ALTER TABLE contratos_servicios ADD COLUMN IF NOT EXISTS campos_actual JSON NOT NULL DEFAULT '{}'::json"))
        conexion.execute(text("ALTER TABLE contratos_servicios_versiones ADD COLUMN IF NOT EXISTS campos JSON NOT NULL DEFAULT '{}'::json"))


def huella_esquema() -> str:
    """Resume modelos y migraciones de arranque para detectar cambios de esquema."""
    huella = hashlib.sha256()
    for tabla in sorted(models.Base.metadata.sorted_tables, key=lambda item: item.name):
        huella.update(tabla.name.encode())
        for columna in tabla.columns:
            huella.update(f"{columna.name}:{columna.type!r}:{columna.nullable}".encode())
    huella.update(inspect.getsource(actualizar_esquema_planes).encode())
    if RUTA_MIGRACION_PLANTILLAS.is_file():
        huella.update(RUTA_MIGRACION_PLANTILLAS.read_bytes())
    return huella.hexdigest()


def _huella_esquema_aplicada() -> str | None:
    try:
        with engine.connect() as conexion:
            return conexion.execute(text("SELECT huella FROM esquema_arranque WHERE id = 1")).scalar()
    except SQLAlchemyError:
        return None


def preparar_esquema() -> None:
    """Crea tablas y aplica compatibilidad solo cuando cambian modelos o migraciones.

    En Vercel cada arranque en frío ejecutaba ~70 sentencias DDL con bloqueos
    exclusivos; la huella guardada permite omitirlas cuando ya están aplicadas.
    """
    if engine.dialect.name != "postgresql":
        # Las sentencias de compatibilidad son específicas de PostgreSQL; en
        # bases locales de desarrollo basta con crear las tablas.
        models.Base.metadata.create_all(bind=engine)
        return
    huella = huella_esquema()
    if _huella_esquema_aplicada() == huella:
        return
    models.Base.metadata.create_all(bind=engine)
    actualizar_esquema_planes()
    try:
        if not RUTA_MIGRACION_PLANTILLAS.is_file():
            raise FileNotFoundError(f"No se encontró la migración de plantillas: {RUTA_MIGRACION_PLANTILLAS}")
        ddl, datos_plantillas = RUTA_MIGRACION_PLANTILLAS.read_text(encoding="utf-8").split("\n\n", maxsplit=1)
        with engine.begin() as conexion:
            conexion.exec_driver_sql(ddl)
            conexion.exec_driver_sql(datos_plantillas)
    except Exception:
        # A fallida message-template migration must not take down authentication
        # and the rest of the API during startup. Sin guardar la huella, se reintenta.
        logging.getLogger(__name__).exception(
            "No se pudieron preparar las plantillas de mensajes; la API continuará iniciando."
        )
        return
    with engine.begin() as conexion:
        conexion.execute(text(
            "CREATE TABLE IF NOT EXISTS esquema_arranque ("
            "id INTEGER PRIMARY KEY, huella VARCHAR(64) NOT NULL, "
            "aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ))
        conexion.execute(text("DELETE FROM esquema_arranque WHERE id = 1"))
        conexion.execute(text("INSERT INTO esquema_arranque (id, huella) VALUES (1, :huella)"), {"huella": huella})


ALLOWED_CARD_TYPES = {"application/pdf", "image/jpeg", "image/png"}
ALLOWED_CARD_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
CARD_TYPE_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}
MAX_CARD_SIZE_BYTES = 10 * 1024 * 1024

@asynccontextmanager
async def lifespan(_app: FastAPI):
    crear_datos_iniciales()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Plataforma SaaS de Seguimiento Judicial",
    description="API Multi-Tenant para gestión de radicados y alertas de WhatsApp",
    version="1.0.0",
)


@app.middleware("http")
async def registrar_contexto_tecnico_auditoria(request: Request, call_next):
    token = establecer_contexto_solicitud_auditoria(request.method, request.url.path)
    try:
        return await call_next(request)
    finally:
        limpiar_contexto_solicitud_auditoria(token)

app.include_router(admin.router)
app.include_router(tareas.router)
app.include_router(expedientes.router)
app.include_router(workflows.router)
app.include_router(contratos.router)
app.include_router(chat.router)


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "")
    # Keep the known application origins available even when a deployment
    # provides additional CORS_ORIGINS entries. Replacing this list outright
    # made the admin/panel subdomains fail in the browser while the API still
    # returned HTTP 200 to the request itself.
    defaults = [
        "http://localhost:3000",
        "http://admin.localhost:3000",
        "http://panel.localhost:3000",
        "http://127.0.0.1:3000",
        "https://alejandramunozabogada.com",
        "https://www.alejandramunozabogada.com",
        "https://admin.alejandramunozabogada.com",
        "https://panel.alejandramunozabogada.com",
    ]
    extra = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    return list(dict.fromkeys([*defaults, *extra]))



PASSWORD_RESET_MESSAGE = "Si existe una cuenta activa con ese correo, enviaremos un enlace para restablecer la contraseña."
VENTANA_INTENTOS = timedelta(hours=1)
VENTANA_LOGIN = timedelta(minutes=15)


def crear_datos_iniciales():
    """Aplica compatibilidad y siembra planes SaaS solo si aún no existen."""
    preparar_esquema()
    db = next(get_db())
    try:
        if not db.query(models.Plan).first():
            db.add_all([
                models.Plan(nombre="Básico", limite_radicados=10, precio_mensual=0, limite_ultimas_actuaciones=5),
                models.Plan(nombre="Pro", limite_radicados=50, precio_mensual=50000, limite_ultimas_actuaciones=None, notificaciones_whatsapp_procesos=True, notificaciones_whatsapp_tareas=True),
            ])
            db.commit()
        if not db.query(models.ConfiguracionSaas).filter_by(id=1).first():
            db.add(models.ConfiguracionSaas(id=1, mostrar_planes=True))
            db.commit()
        if not db.query(models.ConfiguracionConsultas).filter_by(id=1).first():
            db.add(models.ConfiguracionConsultas(id=1, activa=False, dias_habilitados=[0, 1, 2, 3, 4]))
            db.commit()
        admin_email = os.getenv("ADMIN_EMAIL", "admin@sistema.local")
        admin_password = os.getenv("ADMIN_PASSWORD")
        if admin_password and not db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.ADMIN).first():
            admin = models.Usuario(
                email=admin_email,
                password_hash=security.hash_password(admin_password),
                nombre_completo="Administrador de firma",
                whatsapp_numero="573000000000",
                rol=models.RolUsuario.ADMIN,
                estado=models.EstadoUsuario.ACTIVO,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


# --- ENDPOINTS PÚBLICOS ---

@app.get("/api/configuracion-publica", response_model=schemas.ConfiguracionSaasOut)
def obtener_configuracion_publica(db: Session = Depends(get_db)):
    configuracion = db.query(models.ConfiguracionSaas).filter_by(id=1).first()
    return {"mostrar_planes": configuracion.mostrar_planes if configuracion else True}

@app.get("/api/contenido-publico/{slug}")
def obtener_contenido_publico(slug: str, db: Session = Depends(get_db)):
    if slug not in PUBLIC_CONTENT_PAGES:
        raise HTTPException(status_code=404, detail="Página pública no encontrada.")
    page = db.query(models.ContenidoPagina).filter_by(slug=slug).first()
    if page is None:
        raise HTTPException(status_code=404, detail="La página usa su contenido base.")
    return {"slug": page.slug, "contenido": page.contenido, "updated_at": page.updated_at}


@app.get("/api/contenido-publico/ruta/resolver")
def resolver_ruta_contenido_publico(ruta: str, db: Session = Depends(get_db)):
    normalized = ruta.rstrip("/") or "/"
    for slug, default_route in PUBLIC_PAGE_ROUTES.items():
        page = db.query(models.ContenidoPagina).filter_by(slug=slug).first()
        saved_route = (page.contenido or {}).get("route") if page and isinstance(page.contenido, dict) else None
        current_route = saved_route or default_route
        if normalized == current_route:
            return {"slug": slug, "ruta": current_route}
    raise HTTPException(status_code=404, detail="Ruta de contenido público no encontrada.")


@app.get("/api/planes-publicos", response_model=list[schemas.PlanOut])
def listar_planes_publicos(db: Session = Depends(get_db)):
    """Retorna planes SaaS disponibles para abogados externos."""
    return db.query(models.Plan).filter(models.Plan.activo == True).order_by(models.Plan.precio_mensual.asc(), models.Plan.id.asc()).all()


@app.post("/api/intereses-saas", response_model=schemas.InteresSaasOut, status_code=status.HTTP_201_CREATED)
def registrar_interes_saas(
    interes: schemas.InteresSaasCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    clave_ip = clave_intento("interes:ip", ip_cliente(request))
    if limite_excedido(db, [(clave_ip, 5)], VENTANA_INTENTOS):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta nuevamente más tarde.")
    registrar_intentos(db, [clave_ip])
    if interes.website.strip():
        raise HTTPException(status_code=400, detail="No fue posible procesar la solicitud.")
    if not interes.autorizacion_datos:
        raise HTTPException(status_code=400, detail="Debe autorizar el tratamiento de sus datos.")
    email = str(interes.email).strip().lower()
    if not db.query(models.InteresSaas).filter(models.InteresSaas.email == email).first():
        db.add(models.InteresSaas(email=email))
        db.commit()
    return {"mensaje": "Gracias. Le avisaremos sobre los planes para abogados externos."}

@app.post("/api/auth/registro", status_code=status.HTTP_201_CREATED)
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


@app.post("/api/auth/login", response_model=schemas.Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    remember_me: bool = Form(True),
    db: Session = Depends(get_db),
):
    """Inicia sesión y genera el token JWT. Valida que la cuenta esté activa."""
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
    return {"access_token": access_token, "token_type": "bearer", "debe_cambiar_password": usuario.debe_cambiar_password}


@app.post("/api/auth/refresh-token", response_model=schemas.Token)
def refresh_token(
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    token: str = Depends(security.oauth2_scheme),
    db: Session = Depends(get_db),
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
    return {"access_token": new_token, "token_type": "bearer", "debe_cambiar_password": usuario_actual.debe_cambiar_password}


@app.post("/api/auth/cambiar-password")
def cambiar_password(
    datos: schemas.CambiarPasswordIn,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_para_cambio_password),
    token: str = Depends(security.oauth2_scheme),
    db: Session = Depends(get_db),
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


@app.post("/api/auth/recuperar-password")
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


@app.post("/api/auth/restablecer-password")
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


@app.patch("/api/auth/preferencias-notificaciones")
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


@app.post("/api/auth/seguridad/codigos")
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


@app.get("/api/auth/seguridad/codigos/activo")
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


@app.post("/api/auth/seguridad/codigos/{challenge_id}/reenviar")
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


@app.post("/api/auth/seguridad/codigos/{challenge_id}/verificar")
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


@app.post("/api/auth/seguridad/codigos/{challenge_id}/aplicar")
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


@app.delete("/api/auth/seguridad/codigos/{challenge_id}", status_code=status.HTTP_204_NO_CONTENT)
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

@app.delete("/api/auth/seguridad/codigos", status_code=status.HTTP_204_NO_CONTENT)
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


@app.patch("/api/auth/perfil")
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

@app.get("/api/auth/me")
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

@app.get("/api/dashboard")
def obtener_dashboard(
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    # ---------------------------------------------------------
    # RADICADOS DEL USUARIO
    # ---------------------------------------------------------
    radicados = (
        db.query(models.Radicado)
        .filter(models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario_actual.id))
        .all()
    )

    total_radicados = len(radicados)

    limite_radicados = (
        usuario_actual.plan.limite_radicados
        if usuario_actual.plan
        else 0
    )

    # ---------------------------------------------------------
    # CONSULTAS
    # ---------------------------------------------------------
    consultas_pendientes = (
        db.query(models.ConsultaRadicado)
        .join(
            models.Radicado,
            models.ConsultaRadicado.radicado_id == models.Radicado.id,
        )
        .filter(
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario_actual.id),
            models.ConsultaRadicado.estado.in_(
                ["ENCOLADA", "EJECUTANDO"]
            ),
        )
        .count()
    )

    # ---------------------------------------------------------
    # ACTUACIONES NUEVAS
    # ---------------------------------------------------------
    actuaciones_nuevas = (
        db.query(models.ConsultaRadicado)
        .join(
            models.Radicado,
            models.ConsultaRadicado.radicado_id == models.Radicado.id,
        )
        .filter(
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario_actual.id),
            models.ConsultaRadicado.actuaciones_nuevas > 0,
        )
        .all()
    )

    total_actuaciones_nuevas = sum(
        consulta.actuaciones_nuevas
        for consulta in actuaciones_nuevas
    )

    # ---------------------------------------------------------
    # CONSULTAS CON ERROR
    # ---------------------------------------------------------
    consultas_error = (
        db.query(models.ConsultaRadicado)
        .join(
            models.Radicado,
            models.ConsultaRadicado.radicado_id == models.Radicado.id,
        )
        .filter(
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario_actual.id),
            models.ConsultaRadicado.estado == "ERROR",
        )
        .count()
    )

    # ---------------------------------------------------------
    # PROCESOS QUE REQUIEREN ATENCIÓN
    # ---------------------------------------------------------
    procesos_atencion = []

    for radicado in radicados:
        ultima_consulta = (
            db.query(models.ConsultaRadicado)
            .filter(
                models.ConsultaRadicado.radicado_id == radicado.id
            )
            .order_by(models.ConsultaRadicado.inicio.desc())
            .first()
        )

        if not ultima_consulta:
            procesos_atencion.append({
                "radicado_id": radicado.id,
                "numero": radicado.numero,
                "motivo": "Sin consultas realizadas",
                "tipo": "SIN_CONSULTA",
            })

        elif ultima_consulta.estado == "ERROR":
            procesos_atencion.append({
                "radicado_id": radicado.id,
                "numero": radicado.numero,
                "motivo": "La última consulta presentó un error",
                "tipo": "ERROR",
            })

        elif ultima_consulta.actuaciones_nuevas > 0:
            procesos_atencion.append({
                "radicado_id": radicado.id,
                "numero": radicado.numero,
                "motivo": (
                    f"{ultima_consulta.actuaciones_nuevas} "
                    "actuación(es) nueva(s)"
                ),
                "tipo": "ACTUACIONES_NUEVAS",
            })

    # ---------------------------------------------------------
    # ÚLTIMAS CONSULTAS
    # ---------------------------------------------------------
    ultimas_consultas = (
        db.query(models.ConsultaRadicado)
        .join(
            models.Radicado,
            models.ConsultaRadicado.radicado_id == models.Radicado.id,
        )
        .filter(
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario_actual.id)
        )
        .order_by(models.ConsultaRadicado.inicio.desc())
        .limit(10)
        .all()
    )

    consultas = []

    for consulta in ultimas_consultas:
        consultas.append({
            "id": consulta.id,
            "radicado_id": consulta.radicado_id,
            "radicado": consulta.radicado.numero,
            "tipo": consulta.tipo,
            "estado": consulta.estado,
            "inicio": consulta.inicio.isoformat()
            if consulta.inicio
            else None,
            "finalizacion": consulta.finalizacion.isoformat()
            if consulta.finalizacion
            else None,
            "actuaciones_nuevas": consulta.actuaciones_nuevas,
            "detalle": consulta.detalle,
            "error": consulta.error,
        })

    # ---------------------------------------------------------
    # RESPUESTA
    # ---------------------------------------------------------
    return {
        "usuario": {
            "nombre": usuario_actual.nombre_completo,
        },
        "plan": (
            {
                "id": usuario_actual.plan.id,
                "nombre": usuario_actual.plan.nombre,
                "limite_radicados": usuario_actual.plan.limite_radicados,
                "precio_mensual": usuario_actual.plan.precio_mensual,
                "limite_ultimas_actuaciones": usuario_actual.plan.limite_ultimas_actuaciones,
                "notificaciones_whatsapp_procesos": usuario_actual.plan.notificaciones_whatsapp_procesos,
                "notificaciones_whatsapp_tareas": usuario_actual.plan.notificaciones_whatsapp_tareas,
            }
            if usuario_actual.plan
            else None
        ),
        "resumen": {
            "total_radicados": total_radicados,
            "limite_radicados": limite_radicados,
            "consultas_pendientes": consultas_pendientes,
            "actuaciones_nuevas": total_actuaciones_nuevas,
            "consultas_error": consultas_error,
        },
        "procesos_atencion": procesos_atencion,
        "ultimas_consultas": consultas,
    }
# --- ENDPOINTS DE ADMINISTRACIÓN ---
@app.get("/api/admin/solicitudes", response_model=list[schemas.SolicitudRegistroOut])
def listar_solicitudes_pendientes(
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna las solicitudes pendientes de abogados para revisión manual."""
    require_roles(usuario_actual, ["ADMIN"], action="listar solicitudes pendientes")

    return (
        db.query(models.SolicitudRegistro)
        .join(models.Usuario)
        .filter(models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION)
        .all()
    )


@app.get("/api/admin/solicitudes/{solicitud_id}/tarjeta")
def descargar_tarjeta_profesional(
    solicitud_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Entrega una tarjeta privada de R2 solamente a administradores autenticados."""
    require_roles(usuario_actual, ["ADMIN"], action="descargar la tarjeta profesional")

    solicitud = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    if not solicitud.ruta_tarjeta_profesional:
        raise HTTPException(status_code=404, detail="La tarjeta profesional fue retirada del almacenamiento.")

    try:
        response = storage.get_r2_client().get_object(
            Bucket=storage.get_r2_tp_registros_bucket(), Key=solicitud.ruta_tarjeta_profesional
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404"}:
            raise HTTPException(status_code=404, detail="Documento no encontrado.") from exc
        raise HTTPException(status_code=502, detail="No fue posible obtener el documento.") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=502, detail="No fue posible obtener el documento.") from exc

    registrar_evento_auditoria(
        db, usuario_actual, "admin.solicitud.tarjeta.descargar", "solicitud_registro", solicitud.id
    )
    db.commit()
    content_type = response.get("ContentType") or "application/octet-stream"
    extension = ".pdf" if content_type == "application/pdf" else ".jpg" if content_type == "image/jpeg" else ".png"
    return StreamingResponse(
        response["Body"].iter_chunks(chunk_size=64 * 1024),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="tarjeta-profesional{extension}"'},
        background=BackgroundTask(response["Body"].close),
    )


@app.post("/api/admin/solicitudes/{solicitud_id}/aprobar")
def aprobar_solicitud(
    solicitud_id: int,
    plan_id: int = 1,  # Por defecto Plan Básico (id 1)
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Aprueba la cuenta del abogado y le asigna un plan con límite de radicados."""
    require_roles(usuario_actual, ["ADMIN"], action="aprobar la solicitud del abogado")

    solicitud = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    plan = (
    db.query(models.Plan)
    .filter(
        models.Plan.id == plan_id,
        models.Plan.activo == True
    )
    .first()
    )

    if not plan:
        raise HTTPException(
            status_code=400,
            detail="El plan especificado no existe o está inactivo."
        )

    usuario = solicitud.usuario
    usuario.estado = models.EstadoUsuario.ACTIVO
    usuario.plan_id = plan.id

    registrar_evento_auditoria(db, usuario_actual, "admin.solicitud.aprobar", "solicitud_registro", solicitud.id)
    db.commit()
    return {
        "mensaje": f"Cuenta de {usuario.nombre_completo} aprobada exitosamente con el plan {plan.nombre}."
    }

@app.post("/api/admin/solicitudes/{solicitud_id}/rechazar")
def rechazar_solicitud(
    solicitud_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Rechaza la solicitud de registro de un abogado."""

    require_roles(usuario_actual, ["ADMIN"], action="rechazar la solicitud del abogado")

    solicitud = (
        db.query(models.SolicitudRegistro)
        .filter(models.SolicitudRegistro.id == solicitud_id)
        .first()
    )

    if not solicitud:
        raise HTTPException(
            status_code=404,
            detail="Solicitud no encontrada."
        )

    usuario = solicitud.usuario

    usuario.estado = models.EstadoUsuario.RECHAZADO

    registrar_evento_auditoria(db, usuario_actual, "admin.solicitud.rechazar", "solicitud_registro", solicitud.id)
    db.commit()

    return {
        "mensaje": f"La solicitud de {usuario.nombre_completo} fue rechazada."
    }

# --- ENDPOINTS PARA GESTIÓN DE RADICADOS (ABOGADO) ---

def radicados_visibles(usuario: models.Usuario, db: Session):
    query = db.query(models.Radicado)
    if has_firm_wide_access(usuario):
        return query
    responsible_lawyer_id = lawyer_scope_id(usuario)
    if responsible_lawyer_id is None:
        return query.filter(models.Radicado.id == -1)
    assigned_radicados = db.query(models.ProcesoRadicado.radicado_id).filter(
        models.ProcesoRadicado.proceso_id.in_(lawyer_process_ids(db, usuario))
    )
    return query.filter(
        or_(
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == responsible_lawyer_id),
            models.Radicado.id.in_(assigned_radicados),
        )
    )

@app.post("/api/radicados", response_model=schemas.RadicadoOut, status_code=status.HTTP_201_CREATED)
def agregar_radicado(
    radicado_in: schemas.RadicadoCreate,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Agrega un radicado a la firma, conservando al creador como responsable."""
    require_roles(usuario_actual, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="gestionar radicados")
    if usuario_actual.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(
            status_code=403, 
            detail="Tu cuenta aún no está activa para agregar radicados."
        )

    if usuario_actual.rol == models.RolUsuario.ABOGADO and usuario_actual.plan is None:
        raise HTTPException(status_code=403, detail="Tu cuenta SaaS necesita un plan activo para agregar radicados.")

    vinculado_previamente = radicado_vinculado_a_usuario(
        db,
        usuario_actual,
        radicado_in.numero,
    )
    try:
        nuevo_radicado, creado = obtener_o_vincular_radicado(
            db, usuario_actual, radicado_in.numero
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if usuario_actual.rol == models.RolUsuario.ABOGADO:
        total_registrados = db.query(models.Radicado).join(
            models.Radicado.usuarios_vinculados
        ).filter(models.Usuario.id == usuario_actual.id).count()
        if total_registrados > usuario_actual.plan.limite_radicados:
            db.rollback()
            raise HTTPException(status_code=400, detail="Has alcanzado el límite de radicados de tu plan.")
    accion = "radicado.crear" if creado else "radicado.vincular"
    registrar_evento_auditoria(db, usuario_actual, accion, "radicado", nuevo_radicado.id)
    db.commit()
    db.refresh(nuevo_radicado)

    if creado or not vinculado_previamente:
        mensaje, consulta_id = iniciar_consulta_nuevo_radicado(
            db,
            usuario_actual,
            nuevo_radicado,
        )
    else:
        mensaje, consulta_id = "El radicado ya estaba agregado; no se inició otra consulta.", None
    limite = (
        usuario_actual.plan.limite_ultimas_actuaciones
        if usuario_actual.rol == models.RolUsuario.ABOGADO
        else None
    )
    resultado = serializar_radicado(nuevo_radicado, limite)
    resultado["mensaje"] = mensaje
    resultado["consulta_id"] = consulta_id
    return resultado


def _limite_actuaciones_visibles(usuario: models.Usuario) -> int | None:
    require_roles(usuario, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="consultar radicados")
    if usuario.rol == models.RolUsuario.ABOGADO and usuario.plan is None:
        raise HTTPException(status_code=403, detail="Tu cuenta SaaS no tiene un plan asignado.")
    return usuario.plan.limite_ultimas_actuaciones if usuario.rol == models.RolUsuario.ABOGADO else None


@app.get("/api/radicados", response_model=list[schemas.RadicadoOut])
def listar_mis_radicados(
    resumen: bool = False,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna radicados dentro del alcance del rol en la firma.

    Con ``resumen=true`` omite las actuaciones; sirve para selectores y
    listados que solo necesitan los datos del radicado.
    """
    limite = _limite_actuaciones_visibles(usuario_actual)
    query = radicados_visibles(usuario_actual, db).order_by(models.Radicado.id.desc())
    if resumen:
        return [serializar_radicado(radicado, 0) for radicado in query.all()]
    radicados = query.options(selectinload(models.Radicado.actuaciones)).all()
    return [serializar_radicado(radicado, limite) for radicado in radicados]


@app.get("/api/radicados/{radicado_id}", response_model=schemas.RadicadoOut)
def obtener_radicado(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna un radicado visible con su historial de actuaciones autorizado."""
    limite = _limite_actuaciones_visibles(usuario_actual)
    radicado = (
        radicados_visibles(usuario_actual, db)
        .filter(models.Radicado.id == radicado_id)
        .options(selectinload(models.Radicado.actuaciones))
        .first()
    )
    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado en tu alcance.")
    return serializar_radicado(radicado, limite)


def serializar_radicado(radicado: models.Radicado, limite_actuaciones: int | None) -> dict:
    """Serializa el historial de actuaciones autorizado."""
    actuaciones = [] if limite_actuaciones == 0 else sorted(radicado.actuaciones, key=lambda actuacion: actuacion.orden)
    if limite_actuaciones is not None:
        actuaciones = actuaciones[:limite_actuaciones]
    return {
        "id": radicado.id, "numero": radicado.numero,
        "estado_consulta": radicado.estado_consulta,
        "despacho_departamento": radicado.despacho_departamento,
        "demandante": radicado.demandante, "demandado": radicado.demandado,
        "consultado_en": radicado.consultado_en,
        "alerta_enviada": radicado.alerta_enviada,
        "detalle_pendiente": radicado.detalle_pendiente,
        "actuaciones": [
            {
                "id": actuacion.id, "orden": actuacion.orden,
                "fecha_actuacion": actuacion.fecha_actuacion,
                "actuacion": actuacion.actuacion, "anotacion": actuacion.anotacion,
                "fecha_inicia_termino": actuacion.fecha_inicia_termino,
                "fecha_finaliza_termino": actuacion.fecha_finaliza_termino,
                "fecha_registro": actuacion.fecha_registro,
                "es_fijacion": actuacion.es_fijacion,
            } for actuacion in actuaciones
        ],
    }


@app.delete("/api/radicados/{radicado_id}")
def eliminar_radicado(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Elimina un radicado visible para el usuario dentro de la firma."""
    require_roles(usuario_actual, ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"], action="eliminar radicados")
    radicado = radicados_visibles(usuario_actual, db).filter(models.Radicado.id == radicado_id).first()

    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado en tu alcance.")
    if not any(vinculado.id == usuario_actual.id for vinculado in radicado.usuarios_vinculados):
        raise HTTPException(status_code=403, detail="No tienes un vínculo directo con este radicado.")

    radicado.usuarios_vinculados.remove(usuario_actual)
    registrar_evento_auditoria(db, usuario_actual, "radicado.desvincular", "radicado", radicado.id)
    db.commit()
    return {"mensaje": f"Radicado {radicado.numero} retirado de tu lista."}

@app.post("/api/radicados/{radicado_id}/consultar")
def consultar_radicado_manual(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Reject the legacy Celery path; manual calls start through the Next Workflow launcher."""
    require_roles(usuario_actual, ["ADMIN"], action="consultar radicados manualmente")
    raise HTTPException(
        status_code=410,
        detail="Este endpoint legacy fue deshabilitado. Inicia la consulta desde la interfaz ADMIN mediante Workflow.",
    )


# Keep CORS outside Starlette's ServerErrorMiddleware so unhandled 500
# responses still carry the allowed origin header. Browser clients can then
# report the API error instead of a misleading CORS/network failure.
_fastapi_app = app
app = CORSMiddleware(
    app=_fastapi_app,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
