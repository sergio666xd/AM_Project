"""Datos de la firma: nombre, contacto y logos que usan el sitio, los correos y los PDF."""

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.sistema.esquemas import DatosFirma, TextosFirma
from app.modulos.sistema.repositorio import RepositorioSistema

CAMPOS = tuple(TextosFirma.model_fields)


class ServicioFirma:
    def __init__(self, db: Session, repositorio: RepositorioSistema):
        self._db = db
        self._repo = repositorio

    def _datos(self, configuracion) -> DatosFirma:
        valores = {campo: getattr(configuracion, campo) for campo in CAMPOS}
        for campo, valor in valores.items():
            if valor is None and campo not in ("correo_contacto", "correo_pqr"):
                valores[campo] = ""
        return DatosFirma(
            **valores, actualizado_en=configuracion.updated_at,
            actualizado_por=self._repo.nombre(configuracion.actualizado_por_id),
        )

    def ver(self, admin: Usuario) -> DatosFirma:
        exigir_admin(admin)
        configuracion = self._repo.configuracion_firma()
        self._db.commit()
        return self._datos(configuracion)

    def guardar(self, admin: Usuario, datos: TextosFirma) -> DatosFirma:
        exigir_admin(admin)
        configuracion = self._repo.configuracion_firma(bloquear=True)
        cambios = [campo for campo in CAMPOS if getattr(configuracion, campo) != getattr(datos, campo)]
        for campo in CAMPOS:
            setattr(configuracion, campo, getattr(datos, campo))
        configuracion.actualizado_por_id = admin.id
        registrar_evento_auditoria(self._db, admin, "admin.configuracion_firma.actualizar", "configuracion_firma", 1,
                                   {"campos": cambios})
        self._db.commit()
        self._db.refresh(configuracion)
        return self._datos(configuracion)
