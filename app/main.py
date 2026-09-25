import os
import shutil
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from app.database import engine, Base, get_db
from app import models, schemas, security
from app.routers import admin
from app.security import obtener_usuario_actual
from app.routers import admin, tareas

# Crear las tablas en la BD
models.Base.metadata.create_all(bind=engine)

# Carpeta para almacenar tarjetas profesionales cargadas
UPLOADS_DIR = Path("uploads/tarjetas_profesionales")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Plataforma SaaS de Seguimiento Judicial",
    description="API Multi-Tenant para gestión de radicados y alertas de WhatsApp",
    version="1.0.0",
)

app.include_router(admin.router)
app.include_router(tareas.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir archivos estáticos subidos (solo para ver documentos en desarrollo local)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
def crear_datos_iniciales():
    """Crea un plan por defecto y una cuenta Administrador si no existen."""
    db = next(get_db())
    # Crear plan básico inicial
    if not db.query(models.Plan).first():
        plan_basico = models.Plan(nombre="Básico", limite_radicados=10, precio_mensual=0)
        plan_pro = models.Plan(nombre="Pro", limite_radicados=50, precio_mensual=50000)
        db.add_all([plan_basico, plan_pro])
        db.commit()

    # Crear admin por defecto
    if not db.query(models.Usuario).filter(models.Usuario.rol == models.RolUsuario.ADMIN).first():
        admin = models.Usuario(
            email="admin@sistema.com",
            password_hash=security.hash_password("admin123"),
            nombre_completo="Administrador General",
            whatsapp_numero="573000000000",
            rol=models.RolUsuario.ADMIN,
            estado=models.EstadoUsuario.ACTIVO,
        )
        db.add(admin)
        db.commit()


# --- ENDPOINTS PÚBLICOS ---

@app.post("/api/auth/registro", status_code=status.HTTP_201_CREATED)
def registrar_abogado(
    email: str = Form(...),
    password: str = Form(...),
    nombre_completo: str = Form(...),
    whatsapp_numero: str = Form(...),
    tarjeta_profesional: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Permite a un abogado solicitar registro cargando su Tarjeta Profesional."""
    if db.query(models.Usuario).filter(models.Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado.")

    # Guardar archivo físicamente en la carpeta uploads
    extension = os.path.splitext(tarjeta_profesional.filename)[1]
    nombre_archivo = f"{email.replace('@', '_at_')}_tarjeta{extension}"
    ruta_archivo = UPLOADS_DIR / nombre_archivo

    with open(ruta_archivo, "wb") as buffer:
        shutil.copyfileobj(tarjeta_profesional.file, buffer)

    # Crear el usuario en estado PENDIENTE_APROBACION
    nuevo_usuario = models.Usuario(
        email=email,
        password_hash=security.hash_password(password),
        nombre_completo=nombre_completo,
        whatsapp_numero=whatsapp_numero,
        rol=models.RolUsuario.ABOGADO,
        estado=models.EstadoUsuario.PENDIENTE_APROBACION,
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    # Guardar registro de la solicitud
    solicitud = models.SolicitudRegistro(
        usuario_id=nuevo_usuario.id,
        ruta_tarjeta_profesional=str(ruta_archivo),
    )
    db.add(solicitud)
    db.commit()

    return {
        "mensaje": "Registro recibido con éxito. Tu cuenta se activará tras revisar la tarjeta profesional.",
        "usuario_id": nuevo_usuario.id,
    }


@app.post("/api/auth/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    """Inicia sesión y genera el token JWT. Valida que la cuenta esté activa."""
    usuario = db.query(models.Usuario).filter(models.Usuario.email == form_data.username).first()

    if not usuario or not security.verify_password(form_data.password, usuario.password_hash):
        raise HTTPException(status_code=400, detail="Correo o contraseña incorrectos.")

    if usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION:
        raise HTTPException(
            status_code=403,
            detail="Tu cuenta aún no ha sido aprobada. Espera la verificación de tu Tarjeta Profesional.",
        )

    if usuario.estado == models.EstadoUsuario.RECHAZADO:
        raise HTTPException(status_code=403, detail="Tu solicitud de registro fue rechazada.")

    access_token = security.create_access_token(data={"sub": str(usuario.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me")
def obtener_mi_usuario(
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.id == usuario_actual.id)
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    return {
        "id": usuario.id,
        "email": usuario.email,
        "nombre_completo": usuario.nombre_completo,
        "whatsapp_numero": usuario.whatsapp_numero,
        "rol": usuario.rol.value
        if hasattr(usuario.rol, "value")
        else usuario.rol,
        "estado": usuario.estado.value
        if hasattr(usuario.estado, "value")
        else usuario.estado,
        "plan": (
            {
                "id": usuario.plan.id,
                "nombre": usuario.plan.nombre,
                "limite_radicados": usuario.plan.limite_radicados,
                "precio_mensual": usuario.plan.precio_mensual,
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
        .filter(models.Radicado.usuario_id == usuario_actual.id)
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
            models.Radicado.usuario_id == usuario_actual.id,
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
            models.Radicado.usuario_id == usuario_actual.id,
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
            models.Radicado.usuario_id == usuario_actual.id,
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
            models.Radicado.usuario_id == usuario_actual.id
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
    if usuario_actual.rol != models.RolUsuario.ADMIN:
        raise HTTPException(status_code=403, detail="Acceso denegado: requiere rol de Admin.")

    return (
        db.query(models.SolicitudRegistro)
        .join(models.Usuario)
        .filter(models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION)
        .all()
    )


@app.post("/api/admin/solicitudes/{solicitud_id}/aprobar")
def aprobar_solicitud(
    solicitud_id: int,
    plan_id: int = 1,  # Por defecto Plan Básico (id 1)
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Aprueba la cuenta del abogado y le asigna un plan con límite de radicados."""
    if usuario_actual.rol != models.RolUsuario.ADMIN:
        raise HTTPException(status_code=403, detail="Acceso denegado: requiere rol de Admin.")

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

    if usuario_actual.rol != models.RolUsuario.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: requiere rol de Admin."
        )

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

    db.commit()

    return {
        "mensaje": f"La solicitud de {usuario.nombre_completo} fue rechazada."
    }

# --- ENDPOINTS PARA GESTIÓN DE RADICADOS (ABOGADO) ---

@app.post("/api/radicados", response_model=schemas.RadicadoOut, status_code=status.HTTP_201_CREATED)
def agregar_radicado(
    radicado_in: schemas.RadicadoCreate,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """
    Agrega un nuevo radicado a la cuenta del abogado validando
    previamente los límites de su plan contratado.
    """
    if usuario_actual.estado != models.EstadoUsuario.ACTIVO:
        raise HTTPException(
            status_code=403, 
            detail="Tu cuenta aún no está activa para agregar radicados."
        )

    # 1. Contar radicados actuales del usuario
    total_registrados = (
        db.query(models.Radicado)
        .filter(models.Radicado.usuario_id == usuario_actual.id)
        .count()
    )

    # 2. Validar contra el límite del plan asignado
    limite_plan = usuario_actual.plan.limite_radicados if usuario_actual.plan else 10
    if total_registrados >= limite_plan:
        raise HTTPException(
            status_code=400,
            detail=f"Has alcanzado el límite de {limite_plan} radicados permitido por tu plan ({usuario_actual.plan.nombre}). Actualiza tu plan para agregar más.",
        )

    # 3. Validar duplicado en la cuenta del mismo abogado
    existente = (
        db.query(models.Radicado)
        .filter(
            models.Radicado.numero == radicado_in.numero,
            models.Radicado.usuario_id == usuario_actual.id,
        )
        .first()
    )
    if existente:
        raise HTTPException(status_code=400, detail="Ya tienes registrado este radicado en tu cuenta.")

    # 4. Guardar el nuevo radicado
    nuevo_radicado = models.Radicado(
        numero=radicado_in.numero,
        usuario_id=usuario_actual.id,
        estado_consulta="sin consultar",
    )
    db.add(nuevo_radicado)
    db.commit()
    db.refresh(nuevo_radicado)

    return nuevo_radicado


@app.get("/api/radicados", response_model=list[schemas.RadicadoOut])
def listar_mis_radicados(
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Retorna únicamente los radicados pertenecientes al abogado autenticado (Multi-tenant isolation)."""
    return (
        db.query(models.Radicado)
        .filter(models.Radicado.usuario_id == usuario_actual.id)
        .all()
    )


@app.delete("/api/radicados/{radicado_id}")
def eliminar_radicado(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Elimina un radicado de la cuenta del abogado liberando cupo en su plan."""
    radicado = (
        db.query(models.Radicado)
        .filter(
            models.Radicado.id == radicado_id,
            models.Radicado.usuario_id == usuario_actual.id,
        )
        .first()
    )

    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado en tu cuenta.")

    db.delete(radicado)
    db.commit()
    return {"mensaje": f"Radicado {radicado.numero} eliminado correctamente."}

from app.tasks import tarea_consultar_radicado

@app.post("/api/radicados/{radicado_id}/consultar")
def consultar_radicado_manual(
    radicado_id: int,
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    """Encola la consulta del radicado en segundo plano sin congelar la API."""
    radicado = (
        db.query(models.Radicado)
        .filter(
            models.Radicado.id == radicado_id,
            models.Radicado.usuario_id == usuario_actual.id,
        )
        .first()
    )

    if not radicado:
        raise HTTPException(status_code=404, detail="Radicado no encontrado en tu cuenta.")

    # Enviar tarea a Redis/Celery
    consulta = models.ConsultaRadicado(
    radicado_id=radicado.id,
    tipo="MANUAL",
    estado="ENCOLADA",
    inicio=datetime.utcnow(),
)

    db.add(consulta)
    db.commit()
    db.refresh(consulta)

    try:
        task = tarea_consultar_radicado.delay(
            radicado.id,
            "MANUAL",
            consulta.id,
        )

        consulta.task_id = task.id
        db.commit()

    except Exception as exc:
        consulta.estado = "ERROR"
        consulta.finalizacion = datetime.utcnow()
        consulta.error = str(exc)
        db.commit()

        raise HTTPException(
            status_code=500,
            detail="No fue posible encolar la consulta."
        )

    return {
        "mensaje": "Consulta iniciada en segundo plano.",
        "radicado": radicado.numero,
        "task_id": task.id,
        "consulta_id": consulta.id,
    }