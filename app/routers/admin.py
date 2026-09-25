from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import obtener_usuario_actual


router = APIRouter(
    prefix="/api/admin",
    tags=["Administración"],
)


# ============================================================
# SEGURIDAD ADMINISTRATIVA
# ============================================================

def verificar_admin(
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
):
    if usuario_actual.rol != models.RolUsuario.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido a administradores",
        )

    return usuario_actual


# ============================================================
# DASHBOARD
# ============================================================

@router.get("/dashboard")
def obtener_dashboard_admin(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    total_usuarios = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO
        )
        .count()
    )

    usuarios_activos = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO,
            models.Usuario.estado == models.EstadoUsuario.ACTIVO,
        )
        .count()
    )

    usuarios_pendientes = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO,
            models.Usuario.estado == models.EstadoUsuario.PENDIENTE_APROBACION,
        )
        .count()
    )

    usuarios_rechazados = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO,
            models.Usuario.estado == models.EstadoUsuario.RECHAZADO,
        )
        .count()
    )

    total_radicados = db.query(models.Radicado).count()

    total_planes = db.query(models.Plan).count()

    planes_activos = (
        db.query(models.Plan)
        .filter(models.Plan.activo == True)
        .count()
    )

    return {
        "usuarios": {
            "total": total_usuarios,
            "activos": usuarios_activos,
            "pendientes": usuarios_pendientes,
            "rechazados": usuarios_rechazados,
        },
        "radicados": {
            "total": total_radicados,
        },
        "planes": {
            "total": total_planes,
            "activos": planes_activos,
        },
    }


# ============================================================
# USUARIOS
# ============================================================

@router.get(
    "/usuarios",
    response_model=list[schemas.UsuarioOut],
)
def listar_usuarios(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    usuarios = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.rol == models.RolUsuario.ABOGADO
        )
        .order_by(models.Usuario.created_at.desc())
        .all()
    )

    return usuarios


# ============================================================
# PLANES - LISTAR
# ============================================================

@router.get(
    "/planes",
    response_model=list[schemas.PlanOut],
)
def listar_planes(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    planes = (
        db.query(models.Plan)
        .order_by(models.Plan.id.asc())
        .all()
    )

    return planes


# ============================================================
# PLANES - CREAR
# ============================================================

@router.post(
    "/planes",
    response_model=schemas.PlanOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_plan(
    datos: schemas.PlanCreate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    nombre = datos.nombre.strip()

    if not nombre:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del plan es obligatorio.",
        )

    if datos.limite_radicados < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El límite de radicados debe ser mayor que cero.",
        )

    if datos.precio_mensual < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El precio mensual no puede ser negativo.",
        )

    plan_existente = (
        db.query(models.Plan)
        .filter(models.Plan.nombre.ilike(nombre))
        .first()
    )

    if plan_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un plan con ese nombre.",
        )

    nuevo_plan = models.Plan(
        nombre=nombre,
        limite_radicados=datos.limite_radicados,
        precio_mensual=datos.precio_mensual,
        activo=True,
    )

    db.add(nuevo_plan)
    db.commit()
    db.refresh(nuevo_plan)

    return nuevo_plan


# ============================================================
# PLANES - EDITAR
# ============================================================

@router.put(
    "/planes/{plan_id}",
    response_model=schemas.PlanOut,
)
def actualizar_plan(
    plan_id: int,
    datos: schemas.PlanUpdate,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plan = (
        db.query(models.Plan)
        .filter(models.Plan.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan no encontrado.",
        )

    if datos.nombre is not None:
        nombre = datos.nombre.strip()

        if not nombre:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre del plan no puede estar vacío.",
            )

        otro_plan = (
            db.query(models.Plan)
            .filter(
                models.Plan.nombre.ilike(nombre),
                models.Plan.id != plan_id,
            )
            .first()
        )

        if otro_plan:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe otro plan con ese nombre.",
            )

        plan.nombre = nombre

    if datos.limite_radicados is not None:
        if datos.limite_radicados < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El límite de radicados debe ser mayor que cero.",
            )

        plan.limite_radicados = datos.limite_radicados

    if datos.precio_mensual is not None:
        if datos.precio_mensual < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El precio mensual no puede ser negativo.",
            )

        plan.precio_mensual = datos.precio_mensual

    if datos.activo is not None:
        plan.activo = datos.activo

    db.commit()
    db.refresh(plan)

    return plan


# ============================================================
# PLANES - ACTIVAR / DESACTIVAR
# ============================================================

@router.patch(
    "/planes/{plan_id}/estado",
    response_model=schemas.PlanOut,
)
def cambiar_estado_plan(
    plan_id: int,
    activo: bool,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plan = (
        db.query(models.Plan)
        .filter(models.Plan.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan no encontrado.",
        )

    plan.activo = activo

    db.commit()
    db.refresh(plan)

    return plan


# ============================================================
# PLANES - ELIMINAR
# ============================================================

@router.delete(
    "/planes/{plan_id}",
)
def eliminar_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    plan = (
        db.query(models.Plan)
        .filter(models.Plan.id == plan_id)
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan no encontrado.",
        )

    usuarios_asignados = (
        db.query(models.Usuario)
        .filter(models.Usuario.plan_id == plan_id)
        .count()
    )

    if usuarios_asignados > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede eliminar este plan porque "
                f"tiene {usuarios_asignados} usuario(s) asignado(s). "
                "Desactívelo en lugar de eliminarlo."
            ),
        )

    db.delete(plan)
    db.commit()

    return {
        "mensaje": "Plan eliminado correctamente."
    }

@router.get("/usuarios/{usuario_id}")
def obtener_usuario_admin(
    usuario_id: int,
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

    radicados = (
    db.query(models.Radicado)
    .filter(models.Radicado.usuario_id == usuario.id)
    .order_by(models.Radicado.created_at.desc())
    .all()
    )

    return {
        "id": usuario.id,
        "email": usuario.email,
        "nombre_completo": usuario.nombre_completo,
        "whatsapp_numero": usuario.whatsapp_numero,
        "rol": usuario.rol,
        "estado": usuario.estado,
        "created_at": usuario.created_at,

        "plan": (
            {
                "id": usuario.plan.id,
                "nombre": usuario.plan.nombre,
                "limite_radicados": usuario.plan.limite_radicados,
                "precio_mensual": usuario.plan.precio_mensual,
                "activo": getattr(usuario.plan, "activo", True),
            }
            if usuario.plan
            else None
        ),

        "total_radicados": len(radicados),

        "radicados": [
            {
                "id": radicado.id,
                "numero": radicado.numero,
                "estado_consulta": radicado.estado_consulta,
                "despacho_departamento": radicado.despacho_departamento,
                "demandante": radicado.demandante,
                "demandado": radicado.demandado,
                "consultado_en": radicado.consultado_en,
                "alerta_enviada": radicado.alerta_enviada,
                "detalle_pendiente": radicado.detalle_pendiente,
                "created_at": radicado.created_at,
                "total_actuaciones": len(radicado.actuaciones),
            }
            for radicado in radicados
        ],
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

    db.commit()
    db.refresh(usuario)

    return {
        "mensaje": "Plan actualizado correctamente.",
        "plan": {
            "id": plan.id,
            "nombre": plan.nombre,
            "limite_radicados": plan.limite_radicados,
            "precio_mensual": plan.precio_mensual,
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
            models.Usuario.rol == models.RolUsuario.ABOGADO,
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=404,
            detail="Usuario no encontrado.",
        )

    usuario.estado = estado

    db.commit()
    db.refresh(usuario)

    return {
        "mensaje": "Estado del usuario actualizado correctamente.",
        "estado": usuario.estado,
    }