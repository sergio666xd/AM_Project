"""Planes SaaS heredados."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import _validar_capacidad_actuaciones, verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


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


@router.patch("/planes/estado-masivo")
def cambiar_estado_planes_masivo(
    datos: schemas.AccionMasivaPlanes,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    ids = list(set(datos.plan_ids))
    if not ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un plan.")
    objetivos = db.query(models.Plan.id).filter(models.Plan.id.in_(ids)).all()
    total = db.query(models.Plan).filter(models.Plan.id.in_(ids)).update(
        {models.Plan.activo: datos.activo}, synchronize_session=False
    )
    for (plan_id,) in objetivos:
        registrar_evento_auditoria(
            db,
            admin,
            f"admin.plan.estado.{str(datos.activo).lower()}",
            "plan",
            plan_id,
        )
    db.commit()
    return {"mensaje": f"{total} plan(es) actualizado(s).", "total": total}


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

    _validar_capacidad_actuaciones(datos.limite_ultimas_actuaciones)

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
        limite_ultimas_actuaciones=datos.limite_ultimas_actuaciones,
        notificaciones_whatsapp_procesos=datos.notificaciones_whatsapp_procesos,
        notificaciones_whatsapp_tareas=datos.notificaciones_whatsapp_tareas,
        activo=True,
    )

    db.add(nuevo_plan)
    db.flush()
    registrar_evento_auditoria(db, admin, "admin.plan.crear", "plan", nuevo_plan.id)
    db.commit()
    db.refresh(nuevo_plan)

    return nuevo_plan


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

    campos_enviados = getattr(datos, "model_fields_set", getattr(datos, "__fields_set__", set()))
    if "limite_ultimas_actuaciones" in campos_enviados:
        _validar_capacidad_actuaciones(datos.limite_ultimas_actuaciones)
        plan.limite_ultimas_actuaciones = datos.limite_ultimas_actuaciones

    if datos.notificaciones_whatsapp_procesos is not None:
        plan.notificaciones_whatsapp_procesos = datos.notificaciones_whatsapp_procesos

    if datos.notificaciones_whatsapp_tareas is not None:
        plan.notificaciones_whatsapp_tareas = datos.notificaciones_whatsapp_tareas

    registrar_evento_auditoria(db, admin, "admin.plan.actualizar", "plan", plan.id)
    db.commit()
    db.refresh(plan)

    return plan


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

    registrar_evento_auditoria(db, admin, f"admin.plan.estado.{str(activo).lower()}", "plan", plan.id)
    db.commit()
    db.refresh(plan)

    return plan


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
    registrar_evento_auditoria(db, admin, "admin.plan.eliminar", "plan", plan_id)
    db.commit()

    return {
        "mensaje": "Plan eliminado correctamente."
    }
