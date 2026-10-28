"""Preparación del esquema y datos iniciales al arrancar la API."""

import hashlib
import inspect
import logging
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import models, security
from app.database import engine, get_db
from app.migraciones import aplicar_migraciones, huella_versiones

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
    huella.update(huella_versiones())
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

    Los cambios de esquema nuevos van como revisiones de Alembic
    (alembic_migrations/versions); actualizar_esquema_planes() y la migración de
    plantillas quedan como el esquema heredado y no deben crecer.
    """
    if engine.dialect.name != "postgresql":
        # Las sentencias de compatibilidad son específicas de PostgreSQL; en
        # bases locales de desarrollo basta con crear las tablas.
        aplicar_migraciones(engine)
        models.Base.metadata.create_all(bind=engine)
        return
    huella = huella_esquema()
    if _huella_esquema_aplicada() == huella:
        return
    migraciones_ok = True
    try:
        aplicar_migraciones(engine)
    except Exception:
        # El esquema heredado se aplica igual; sin guardar la huella, el
        # próximo arranque vuelve a intentar las migraciones.
        migraciones_ok = False
        logging.getLogger(__name__).exception("No se pudieron aplicar las migraciones de Alembic.")
    models.Base.metadata.create_all(bind=engine)
    actualizar_esquema_planes()
    try:
        if not RUTA_MIGRACION_PLANTILLAS.is_file():
            raise FileNotFoundError(f"No se encontró la migración de plantillas: {RUTA_MIGRACION_PLANTILLAS}")
        ddl, datos_plantillas = RUTA_MIGRACION_PLANTILLAS.read_text(encoding="utf-8").split("\n\n", maxsplit=1)
        if engine.dialect.paramstyle in ("format", "pyformat"):
            # psycopg lee cada % suelto como marcador aunque no haya parámetros.
            datos_plantillas = datos_plantillas.replace("%", "%%")
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
    if not migraciones_ok:
        return
    with engine.begin() as conexion:
        conexion.execute(text(
            "CREATE TABLE IF NOT EXISTS esquema_arranque ("
            "id INTEGER PRIMARY KEY, huella VARCHAR(64) NOT NULL, "
            "aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ))
        conexion.execute(text("DELETE FROM esquema_arranque WHERE id = 1"))
        conexion.execute(text("INSERT INTO esquema_arranque (id, huella) VALUES (1, :huella)"), {"huella": huella})


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
