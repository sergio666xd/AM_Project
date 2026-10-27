"""Resumen del panel del abogado SaaS."""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, contains_eager

from app import models
from app.database import get_db
from app.novedades_radicado import descripcion_novedades, novedades_pendientes, ruta_detalle_radicado
from app.security import obtener_usuario_actual

router = APIRouter()


@router.get("/api/dashboard")
def obtener_dashboard(
    usuario_actual: models.Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    # ---------------------------------------------------------
    # RADICADOS DEL USUARIO
    # ---------------------------------------------------------
    radicados = (
        db.query(models.Radicado.id, models.Radicado.numero)
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
    # ACTUACIONES NUEVAS SIN REVISAR
    # ---------------------------------------------------------
    # Se acumulan en cada consulta y solo se quitan al abrir el detalle del radicado.
    novedades = novedades_pendientes(db, usuario_actual)
    total_actuaciones_nuevas = sum(novedad.actuaciones_nuevas for novedad in novedades)

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
    # Una sola consulta trae la última ejecución de cada radicado, en lugar de
    # una consulta por radicado.
    orden_reciente = (
        func.row_number()
        .over(
            partition_by=models.ConsultaRadicado.radicado_id,
            order_by=(models.ConsultaRadicado.inicio.desc(), models.ConsultaRadicado.id.desc()),
        )
        .label("orden_reciente")
    )
    recientes = (
        db.query(models.ConsultaRadicado.id, orden_reciente)
        .filter(models.ConsultaRadicado.radicado_id.in_([radicado.id for radicado in radicados]))
        .subquery()
    )
    ultima_por_radicado = {
        consulta.radicado_id: consulta
        for consulta in (
            db.query(models.ConsultaRadicado)
            .join(recientes, recientes.c.id == models.ConsultaRadicado.id)
            .filter(recientes.c.orden_reciente == 1)
            .all()
        )
    } if radicados else {}

    procesos_atencion = [
        {
            "radicado_id": novedad.radicado_id,
            "numero": novedad.radicado.numero,
            "motivo": descripcion_novedades(novedad.actuaciones_nuevas),
            "tipo": "ACTUACIONES_NUEVAS",
            "href": ruta_detalle_radicado(usuario_actual, novedad.radicado_id),
        }
        for novedad in novedades
    ]
    radicados_con_novedades = {novedad.radicado_id for novedad in novedades}

    for radicado in radicados:
        ultima_consulta = ultima_por_radicado.get(radicado.id)

        if radicado.id in radicados_con_novedades:
            continue
        if not ultima_consulta:
            procesos_atencion.append({
                "radicado_id": radicado.id,
                "numero": radicado.numero,
                "motivo": "Sin consultas realizadas",
                "tipo": "SIN_CONSULTA",
                "href": ruta_detalle_radicado(usuario_actual, radicado.id),
            })

        elif ultima_consulta.estado == "ERROR":
            procesos_atencion.append({
                "radicado_id": radicado.id,
                "numero": radicado.numero,
                "motivo": "La última consulta presentó un error",
                "tipo": "ERROR",
                "href": ruta_detalle_radicado(usuario_actual, radicado.id),
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
        .options(contains_eager(models.ConsultaRadicado.radicado))
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
