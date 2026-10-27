"""Estado "actuaciones nuevas" por usuario: se marca al consultar y se quita al abrir el detalle."""

from sqlalchemy.orm import Session, joinedload

from app import models
from app.notification_policy import abogados_notificables_para_radicado
from app.timezone import utc_ahora


def ruta_detalle_radicado(usuario: models.Usuario, radicado_id: int) -> str:
    """Ruta del detalle del radicado según el portal del usuario."""
    if usuario.rol == models.RolUsuario.ABOGADO:
        return f"/gestion-procesos/dashboard/radicados/{radicado_id}"
    if usuario.rol == models.RolUsuario.ADMIN:
        return f"/gestion-procesos/admin/radicados?detalle={radicado_id}"
    return f"/gestion-procesos/abogado/radicados/{radicado_id}"


def registrar_novedades_radicado(db: Session, radicado: models.Radicado, cantidad: int) -> list[int]:
    """Acumula las actuaciones nuevas pendientes de revisión para cada abogado del radicado."""
    if cantidad <= 0:
        return []
    ahora = utc_ahora()
    usuario_ids = []
    for abogado in abogados_notificables_para_radicado(radicado):
        novedad = db.query(models.NovedadRadicadoUsuario).filter_by(
            usuario_id=abogado.id,
            radicado_id=radicado.id,
        ).first()
        if novedad is None:
            db.add(models.NovedadRadicadoUsuario(
                usuario_id=abogado.id,
                radicado_id=radicado.id,
                actuaciones_nuevas=cantidad,
                desde=ahora,
                actualizado_en=ahora,
            ))
        else:
            novedad.actuaciones_nuevas += cantidad
            novedad.actualizado_en = ahora
        usuario_ids.append(abogado.id)
    return usuario_ids


def marcar_radicado_revisado(db: Session, usuario: models.Usuario, radicado_id: int) -> int:
    """Quita el estado de novedades del usuario y devuelve cuántas actuaciones tenía pendientes."""
    novedad = db.query(models.NovedadRadicadoUsuario).filter_by(
        usuario_id=usuario.id,
        radicado_id=radicado_id,
    ).first()
    if novedad is None:
        return 0
    pendientes = novedad.actuaciones_nuevas
    db.delete(novedad)
    db.commit()
    return pendientes


def novedades_pendientes(db: Session, usuario: models.Usuario) -> list[models.NovedadRadicadoUsuario]:
    return (
        db.query(models.NovedadRadicadoUsuario)
        .filter(models.NovedadRadicadoUsuario.usuario_id == usuario.id)
        .options(joinedload(models.NovedadRadicadoUsuario.radicado))
        .order_by(models.NovedadRadicadoUsuario.actualizado_en.desc())
        .all()
    )


def descripcion_novedades(cantidad: int) -> str:
    if cantidad == 1:
        return "1 actuación nueva sin revisar"
    return f"{cantidad} actuaciones nuevas sin revisar"
