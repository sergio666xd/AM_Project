from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models


FUENTE_RAMA_JUDICIAL = "RAMA_JUDICIAL_COLOMBIA"


def normalizar_numero_radicado(numero: str) -> str:
    return "".join(caracter for caracter in numero if caracter.isdigit())


def radicado_vinculado_a_usuario(
    db: Session,
    usuario: models.Usuario,
    numero: str,
) -> bool:
    numero_normalizado = normalizar_numero_radicado(numero)
    ambito_key = ambito_radicado_usuario(usuario)
    return (
        db.query(models.Radicado.id)
        .filter(
            models.Radicado.fuente == FUENTE_RAMA_JUDICIAL,
            models.Radicado.ambito_key == ambito_key,
            models.Radicado.numero_normalizado == numero_normalizado,
            models.Radicado.usuarios_vinculados.any(models.Usuario.id == usuario.id),
        )
        .first()
        is not None
    )


def ambito_radicado_usuario(usuario: models.Usuario) -> str:
    if usuario.rol == models.RolUsuario.ABOGADO:
        return f"SAAS:{usuario.id}"
    if usuario.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
        return "FIRMA"
    raise ValueError("El usuario no puede administrar radicados.")


def iniciar_consulta_nuevo_radicado(
    db: Session,
    usuario: models.Usuario,
    radicado: models.Radicado,
) -> tuple[str, int | None]:
    if (
        usuario.rol == models.RolUsuario.ABOGADO
        and usuario.plan is not None
        and usuario.plan.precio_mensual == 0
    ):
        configuracion = db.query(models.ConfiguracionConsultas).filter_by(id=1).first()
        if not configuracion or not configuracion.activa or not configuracion.dias_habilitados:
            return (
                "Tu plan gratuito no inicia consultas inmediatas y la "
                "programación automática está desactivada.",
                None,
            )
        dias_semana = (
            "lunes",
            "martes",
            "miércoles",
            "jueves",
            "viernes",
            "sábado",
            "domingo",
        )
        dias_habilitados = [
            dias_semana[dia]
            for dia in sorted(set(configuracion.dias_habilitados))
            if isinstance(dia, int) and 0 <= dia < len(dias_semana)
        ]
        if not dias_habilitados:
            return (
                "Tu plan gratuito no inicia consultas inmediatas y la "
                "programación automática no tiene días habilitados.",
                None,
            )
        return (
            f"Tu plan gratuito consulta los {', '.join(dias_habilitados)} a las "
            "12:00 y 17:00, hora de Colombia; este radicado no se consultó "
            "de inmediato.",
            None,
        )

    consulta = models.ConsultaRadicado(
        radicado_id=radicado.id,
        tipo="AUTOMATICA_NUEVO",
        estado="ENCOLADA",
        inicio=datetime.utcnow(),
    )
    db.add(consulta)
    db.commit()
    db.refresh(consulta)
    return "Consulta inmediata iniciada mediante Workflow.", consulta.id


def obtener_o_vincular_radicado(
    db: Session,
    usuario: models.Usuario,
    numero: str,
) -> tuple[models.Radicado, bool]:
    numero_normalizado = normalizar_numero_radicado(numero)
    if len(numero_normalizado) != 23:
        raise ValueError("El radicado debe tener exactamente 23 dígitos.")

    ambito_key = ambito_radicado_usuario(usuario)
    filtros = (
        models.Radicado.fuente == FUENTE_RAMA_JUDICIAL,
        models.Radicado.ambito_key == ambito_key,
        models.Radicado.numero_normalizado == numero_normalizado,
    )
    radicado = db.query(models.Radicado).filter(*filtros).first()
    if radicado is not None:
        if all(vinculado.id != usuario.id for vinculado in radicado.usuarios_vinculados):
            radicado.usuarios_vinculados.append(usuario)
        return radicado, False

    radicado = models.Radicado(
        numero=numero_normalizado,
        usuario_id=usuario.id,
        fuente=FUENTE_RAMA_JUDICIAL,
        ambito_key=ambito_key,
        numero_normalizado=numero_normalizado,
        estado_consulta="sin consultar",
    )
    try:
        with db.begin_nested():
            db.add(radicado)
            db.flush()
    except IntegrityError:
        # Another request may have inserted the same scoped case concurrently.
        radicado = db.query(models.Radicado).filter(*filtros).one_or_none()
        if radicado is None:
            raise
        if all(vinculado.id != usuario.id for vinculado in radicado.usuarios_vinculados):
            radicado.usuarios_vinculados.append(usuario)
        return radicado, False

    return radicado, True