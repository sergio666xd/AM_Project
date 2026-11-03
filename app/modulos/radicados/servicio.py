from datetime import date

from sqlalchemy.orm import Session

from app.modulos.expedientes import politicas
from app.modulos.expedientes.modelos import Actuacion, Proceso, Radicado
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.modulos.radicados.esquemas import (
    ActuacionDelRadicado,
    ActuacionResumen,
    ConsultaRadicado,
    ListaRadicados,
    ProcesoDelRadicado,
    RadicadoDetalle,
    RadicadoFila,
    ResumenRadicados,
)
from app.modulos.radicados.repositorio import RepositorioRadicados, filtro_radicados_visibles
from app.nucleo.errores import NoEncontrado, SinPermiso

NO_ENCONTRADO = "No encontramos ese radicado, o no tiene acceso a él."
SOLO_EQUIPO = "Los radicados son para el equipo de la firma."
PROBLEMAS = {"no_encontrado", "error"}


def _rol(usuario: Usuario) -> RolUsuario:
    return RolUsuario(getattr(usuario.rol, "value", usuario.rol))


def _dia(texto: str | None) -> date | None:
    if not texto:
        return None
    try:
        return date.fromisoformat(texto.strip()[:10])
    except ValueError:
        return None


def _texto(valor: str | None) -> str | None:
    return (valor or "").strip() or None


def consulta(radicado: Radicado) -> ConsultaRadicado:
    """Traduce el estado guardado por el consultor ("ok", "error_api: …", "omitido: proceso privado"…)."""
    crudo = (radicado.estado_consulta or "").strip()
    normal = crudo.casefold()
    detalle = None
    if normal == "ok":
        estado, etiqueta = "consultado", "Consultado"
    elif not normal or normal == "sin consultar":
        estado, etiqueta = "sin_consultar", "Sin consultar"
    elif normal in {"encolada", "ejecutando", "pendiente"} or "consultando" in normal:
        estado, etiqueta = "consultando", "Consultando"
    elif "no_encontrado" in normal or "no encontrado" in normal:
        estado, etiqueta = "no_encontrado", "No aparece en la Rama Judicial"
    elif "privado" in normal:
        estado, etiqueta = "privado", "Proceso privado"
    elif normal.startswith("error"):
        estado, etiqueta = "error", "La consulta falló"
        detalle = _texto(crudo.split(":", 1)[1] if ":" in crudo else None)
    else:
        estado, etiqueta = "consultado", crudo[:1].upper() + crudo[1:]
    return ConsultaRadicado(estado=estado, etiqueta=etiqueta, detalle=detalle, consultado_en=_texto(radicado.consultado_en))


class ServicioRadicados:
    def __init__(self, db: Session, radicados: RepositorioRadicados):
        self._db = db
        self._radicados = radicados

    @staticmethod
    def _exigir_equipo(usuario: Usuario) -> None:
        if _rol(usuario) not in {RolUsuario.ADMIN, *politicas.ROLES_ABOGADO}:
            raise SinPermiso(SOLO_EQUIPO)

    @staticmethod
    def _procesos(usuario: Usuario, radicado: Radicado) -> list[ProcesoDelRadicado]:
        procesos = [v.proceso for v in radicado.procesos if v.proceso is not None]
        if _rol(usuario) != RolUsuario.ADMIN:
            procesos = [p for p in procesos if _visible(usuario, p)]
        procesos.sort(key=lambda p: (p.archivado_en is not None, p.nombre.casefold()))
        return [ProcesoDelRadicado(id=p.id, nombre=p.nombre, archivado=p.archivado_en is not None) for p in procesos]

    def _fila(self, usuario: Usuario, radicado: Radicado, ultima: Actuacion | None, total: int, novedades: int) -> dict:
        return {
            "id": radicado.id, "numero": radicado.numero, "despacho": _texto(radicado.despacho_departamento),
            "demandante": _texto(radicado.demandante), "demandado": _texto(radicado.demandado),
            "consulta": consulta(radicado), "procesos": self._procesos(usuario, radicado),
            "ultima_actuacion": ActuacionResumen(
                id=ultima.id, texto=_texto(ultima.actuacion) or "Actuación del juzgado", fecha=_dia(ultima.fecha_actuacion),
            ) if ultima else None,
            "total_actuaciones": total, "novedades": novedades,
        }

    def listar(self, usuario: Usuario) -> ListaRadicados:
        self._exigir_equipo(usuario)
        radicados = self._radicados.listar(filtro_radicados_visibles(usuario))
        ids = [r.id for r in radicados]
        ultimas = self._radicados.ultimas_actuaciones(ids)
        totales = self._radicados.totales(ids)
        novedades = self._radicados.novedades(usuario.id, ids)
        filas = [
            RadicadoFila(**self._fila(usuario, r, ultimas.get(r.id), totales.get(r.id, 0), novedades.get(r.id, 0)))
            for r in radicados
        ]
        filas.sort(key=lambda f: (f.ultima_actuacion.fecha if f.ultima_actuacion and f.ultima_actuacion.fecha else date.min, f.id),
                   reverse=True)
        return ListaRadicados(items=filas, resumen=ResumenRadicados(
            total=len(filas),
            con_novedades=sum(1 for f in filas if f.novedades),
            con_problemas=sum(1 for f in filas if f.consulta.estado in PROBLEMAS),
            sin_consultar=sum(1 for f in filas if f.consulta.estado == "sin_consultar"),
        ))

    def detalle(self, usuario: Usuario, radicado_id: int) -> RadicadoDetalle:
        """El radicado con todas sus actuaciones; las que usted no ha revisado vienen marcadas como nuevas."""
        self._exigir_equipo(usuario)
        radicado = self._radicados.obtener(radicado_id, filtro_radicados_visibles(usuario))
        if radicado is None:
            raise NoEncontrado(NO_ENCONTRADO)
        actuaciones = self._radicados.actuaciones(radicado.id)
        nuevas = self._radicados.novedades(usuario.id, [radicado.id]).get(radicado.id, 0)
        return RadicadoDetalle(
            **self._fila(usuario, radicado, actuaciones[0] if actuaciones else None, len(actuaciones), nuevas),
            actuaciones=[
                ActuacionDelRadicado(
                    id=a.id, orden=a.orden, fecha=_dia(a.fecha_actuacion),
                    actuacion=_texto(a.actuacion) or "Actuación del juzgado", anotacion=_texto(a.anotacion),
                    inicia_termino=_dia(a.fecha_inicia_termino), finaliza_termino=_dia(a.fecha_finaliza_termino),
                    registrada=_dia(a.fecha_registro), fijacion=bool(a.es_fijacion), nueva=i < nuevas,
                )
                for i, a in enumerate(actuaciones)
            ],
            puede_consultar=_rol(usuario) == RolUsuario.ADMIN,
        )

    def marcar_revisado(self, usuario: Usuario, radicado_id: int) -> None:
        self._exigir_equipo(usuario)
        if self._radicados.obtener(radicado_id, filtro_radicados_visibles(usuario)) is None:
            raise NoEncontrado(NO_ENCONTRADO)
        self._radicados.marcar_revisado(usuario.id, radicado_id)


def _visible(usuario: Usuario, proceso: Proceso) -> bool:
    """Lo mismo que `politicas.filtro_procesos_visibles`, evaluado sobre un proceso ya cargado."""
    if proceso.abogado_id == usuario.id:
        return True
    if _rol(usuario) == RolUsuario.ABOGADO_ADMIN:
        return any(c.abogado_id == usuario.id for c in proceso.colaboradores)
    return False
