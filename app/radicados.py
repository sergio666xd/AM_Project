from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models


FUENTE_RAMA_JUDICIAL = "RAMA_JUDICIAL_COLOMBIA"


def normalizar_numero_radicado(numero: str) -> str:
    return "".join(caracter for caracter in numero if caracter.isdigit())


def ambito_radicado_usuario(usuario: models.Usuario) -> str:
    if usuario.rol == models.RolUsuario.ABOGADO:
        return f"SAAS:{usuario.id}"
    if usuario.rol in (models.RolUsuario.ABOGADO_ADMIN, models.RolUsuario.ADMIN):
        return "FIRMA"
    raise ValueError("El usuario no puede administrar radicados.")


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