"""Glosario de lenguaje claro y explicación de actuaciones.

El cliente lee «El juez aceptó la demanda» en lugar de «Auto admite demanda».
La explicación sale, por orden, del comentario que la firma envió al avisarle
de esa actuación o del glosario. El glosario lo corrigen la administración y
la abogada directora; el resto del equipo lo consulta.
"""

import re
import unicodedata

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.modulos.expedientes import politicas
from app.modulos.expedientes.modelos import Proceso
from app.modulos.glosario.esquemas import DatosTermino, Explicacion, ListaGlosario, TerminoDelGlosario
from app.modulos.glosario.modelos import Actuacion, TerminoGlosario
from app.modulos.glosario.repositorio import RepositorioGlosario
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado, SinPermiso
from app.timezone import utc_ahora

EDITORES = {RolUsuario.ADMIN.value, RolUsuario.ABOGADO_ADMIN.value}
# Palabras que no cuentan al comparar: «Auto fija fecha de audiencia» es «auto fija fecha audiencia».
VACIAS = frozenset({"a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "o", "para", "por", "que", "se", "u", "y"})
NO_ENCONTRADA = "No encontramos esa actuación, o no tienes acceso a ella."


def normalizar(texto: str) -> str:
    """Minúsculas, sin tildes y con un solo espacio entre palabras."""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^0-9a-z]+", " ", sin_tildes.casefold()).split())


def clave(texto: str) -> str:
    """Las palabras que cuentan para comparar, normalizadas."""
    return " ".join(palabra for palabra in normalizar(texto).split() if palabra not in VACIAS)


class Glosario:
    """Busca, para un texto del juzgado, el término más específico que contiene (palabras completas)."""

    def __init__(self, terminos: list[TerminoGlosario]):
        self._terminos = sorted(
            ((f" {clave(t.patron)} ", t) for t in terminos if t.activo and clave(t.patron)),
            key=lambda par: len(par[0]),
            reverse=True,
        )

    def termino(self, texto: str | None) -> TerminoGlosario | None:
        if not texto:
            return None
        relleno = f" {clave(texto)} "
        return next((t for patron, t in self._terminos if patron in relleno), None)


def _rol(usuario: Usuario) -> str:
    return getattr(usuario.rol, "value", usuario.rol)


class ServicioGlosario:
    def __init__(self, db: Session, repositorio: RepositorioGlosario):
        self._db = db
        self._repo = repositorio

    def glosario(self) -> Glosario:
        return Glosario(self._repo.terminos(solo_activos=True))

    # ---- Consulta y edición ---------------------------------------------

    def listar(self, usuario: Usuario) -> ListaGlosario:
        if politicas.es_cliente(usuario):
            raise SinPermiso("El glosario es para el equipo de la firma.")
        terminos = self._repo.terminos()
        nombres = self._repo.nombres({t.actualizado_por_id for t in terminos})
        return ListaGlosario(items=[self._vista(t, nombres) for t in terminos], total=len(terminos))

    def crear(self, usuario: Usuario, datos: DatosTermino) -> TerminoDelGlosario:
        self._exigir_editor(usuario)
        self._validar_patron(datos.patron)
        termino = TerminoGlosario(patron=datos.patron, explicacion=datos.explicacion, activo=datos.activo,
                                  actualizado_por_id=usuario.id, actualizado_en=utc_ahora())
        self._db.add(termino)
        self._guardar()
        registrar_evento_auditoria(self._db, usuario, "glosario.crear", "glosario", termino.id, {"patron": termino.patron})
        self._db.commit()
        return self._vista(termino, {usuario.id: usuario.nombre_completo})

    def editar(self, usuario: Usuario, termino_id: int, datos: DatosTermino) -> TerminoDelGlosario:
        self._exigir_editor(usuario)
        termino = self._termino(termino_id)
        self._validar_patron(datos.patron, excepto=termino.id)
        termino.patron, termino.explicacion, termino.activo = datos.patron, datos.explicacion, datos.activo
        termino.actualizado_por_id, termino.actualizado_en = usuario.id, utc_ahora()
        self._guardar()
        registrar_evento_auditoria(self._db, usuario, "glosario.editar", "glosario", termino.id, {"patron": termino.patron})
        self._db.commit()
        return self._vista(termino, {usuario.id: usuario.nombre_completo})

    def eliminar(self, usuario: Usuario, termino_id: int) -> None:
        self._exigir_editor(usuario)
        termino = self._termino(termino_id)
        registrar_evento_auditoria(self._db, usuario, "glosario.eliminar", "glosario", termino.id, {"patron": termino.patron})
        self._db.delete(termino)
        self._db.commit()

    # ---- Explicación ----------------------------------------------------

    def explicacion(self, usuario: Usuario, actuacion_id: int) -> Explicacion:
        actuacion = self._repo.actuacion_visible(actuacion_id, self._visibles(usuario))
        if actuacion is None:
            raise NoEncontrado(NO_ENCONTRADA)
        cliente = politicas.es_cliente(usuario)
        comentario = self._repo.comentarios_de_avisos([actuacion.id], usuario.id if cliente else None).get(actuacion.id)
        termino = None if comentario else self.glosario().termino(actuacion.actuacion)
        return Explicacion(
            actuacion_id=actuacion.id,
            fecha=(actuacion.fecha_actuacion or actuacion.fecha_registro or "")[:10] or None,
            texto_juzgado=texto_juzgado(actuacion),
            anotacion=None if cliente else ((actuacion.anotacion or "").strip() or None),
            explicacion=comentario or (termino.explicacion if termino else None),
            fuente="abogado" if comentario else "glosario" if termino else None,
            patron=termino.patron if termino else None,
        )

    # ---- Apoyo ----------------------------------------------------------

    @staticmethod
    def _visibles(usuario: Usuario):
        visibles = politicas.filtro_procesos_visibles(usuario)
        if politicas.es_cliente(usuario):
            return visibles & Proceso.archivado_en.is_(None)
        return visibles

    @staticmethod
    def _exigir_editor(usuario: Usuario) -> None:
        if _rol(usuario) not in EDITORES:
            raise SinPermiso("Solo la administración y la abogada directora corrigen el glosario.")

    def _termino(self, termino_id: int) -> TerminoGlosario:
        termino = self._repo.termino(termino_id)
        if termino is None:
            raise NoEncontrado("Ese término ya no está en el glosario.")
        return termino

    def _validar_patron(self, patron: str, excepto: int | None = None) -> None:
        buscada = clave(patron)
        if not buscada:
            raise DatosInvalidos("Escriba palabras del texto del juzgado, no solo artículos.", codigo="patron_vacio",
                            campos={"patron": "Escriba palabras del texto del juzgado."})
        if any(clave(t.patron) == buscada and t.id != excepto for t in self._repo.terminos()):
            raise Conflicto("Ese texto del juzgado ya está en el glosario.", codigo="patron_repetido",
                            campos={"patron": "Ya está en el glosario."})

    def _guardar(self) -> None:
        try:
            self._db.flush()
        except IntegrityError as exc:
            self._db.rollback()
            raise Conflicto("Ese texto del juzgado ya está en el glosario.", codigo="patron_repetido",
                            campos={"patron": "Ya está en el glosario."}) from exc

    @staticmethod
    def _vista(termino: TerminoGlosario, nombres: dict[int, str]) -> TerminoDelGlosario:
        return TerminoDelGlosario(
            id=termino.id, patron=termino.patron, explicacion=termino.explicacion, activo=termino.activo,
            actualizado_en=termino.actualizado_en, actualizado_por=nombres.get(termino.actualizado_por_id),
        )


def texto_juzgado(actuacion: Actuacion) -> str:
    return (actuacion.actuacion or "").strip() or "Actuación judicial"
