"""Consultas a la Rama Judicial vistas por la administración: programación, ejecuciones y errores.

Las consultas manuales se lanzan desde el panel con el launcher de Workflows
(`/workflow-admin/consultas`); aquí solo se programa y se revisa lo que pasó.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.message_templates import radicado_legible
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.operacion.esquemas import (
    CambioConsultas,
    ConfiguracionConsultas,
    DetalleEjecucion,
    Ejecucion,
    PaginaEjecuciones,
    PanelConsultas,
    RadicadoConError,
    RadicadoConsultable,
    ResultadoRadicado,
)
from app.modulos.operacion.repositorio import RepositorioOperacion
from app.nucleo.errores import DatosInvalidos, NoEncontrado
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor

ZONA = ZoneInfo("America/Bogota")
HORAS = (12, 17)
ESTADOS = {
    "ENCOLADA": "en_cola", "EN_PROCESO": "en_proceso", "REINTENTANDO": "en_proceso",
    "COMPLETADA": "completada", "COMPLETADA_CON_ERRORES": "con_errores", "ERROR": "fallida",
}
RESULTADOS = {"COMPLETADA": "consultado", "ERROR": "con_error"}


def proxima_consulta(activa: bool, dias: list[int], ahora: datetime | None = None) -> datetime | None:
    if not activa or not dias:
        return None
    ahora = ahora or datetime.now(ZONA)
    for desplazamiento in range(8):
        fecha = (ahora + timedelta(days=desplazamiento)).date()
        if fecha.weekday() not in dias:
            continue
        for hora in HORAS:
            candidata = datetime(fecha.year, fecha.month, fecha.day, hora, tzinfo=ZONA)
            if candidata > ahora:
                return candidata
    return None


def ejecucion(e) -> Ejecucion:
    return Ejecucion(
        id=e.id, manual=e.tipo == "MANUAL", estado=ESTADOS.get(e.estado, "en_proceso"), inicio=e.inicio,
        fin=e.finalizacion, total=e.total_radicados, procesados=e.procesados, errores=e.errores,
        actuaciones_nuevas=e.actuaciones_nuevas,
    )


class ServicioConsultas:
    def __init__(self, db: Session, repositorio: RepositorioOperacion):
        self._db = db
        self._repo = repositorio

    def _configuracion(self, config) -> ConfiguracionConsultas:
        dias = sorted(set(config.dias_habilitados or []))
        return ConfiguracionConsultas(
            activa=config.activa, dias=dias, horas=[f"{h}:00" for h in HORAS], proxima=proxima_consulta(config.activa, dias),
        )

    def panel(self, admin: Usuario) -> PanelConsultas:
        exigir_admin(admin)
        configuracion = self._configuracion(self._repo.configuracion_consultas())
        self._db.commit()
        return PanelConsultas(
            configuracion=configuracion,
            con_error=[
                RadicadoConError(
                    radicado_id=consulta.radicado_id, numero=radicado_legible(numero), proceso=proceso, proceso_id=proceso_id,
                    error=(consulta.error or "").strip()[:300] or None, fecha=consulta.finalizacion or consulta.inicio,
                )
                for consulta, numero, proceso_id, proceso in self._repo.consultas_con_error()
            ],
        )

    def programar(self, admin: Usuario, datos: CambioConsultas) -> ConfiguracionConsultas:
        exigir_admin(admin)
        if datos.activa and not datos.dias:
            raise DatosInvalidos("Elija al menos un día.", campos={"dias": "Elija al menos un día para consultar."})
        config = self._repo.configuracion_consultas(bloquear=True)
        config.activa = datos.activa
        config.dias_habilitados = datos.dias
        config.actualizado_por_id = admin.id
        registrar_evento_auditoria(self._db, admin, "admin.consultas.configuracion.actualizar", "configuracion_consultas", 1)
        self._db.commit()
        return self._configuracion(config)

    def ejecuciones(self, admin: Usuario, pagina: ParametrosPagina) -> PaginaEjecuciones:
        exigir_admin(admin)
        despues = None
        if pagina.cursor:
            try:
                despues = (datetime.fromisoformat(str(pagina.cursor["i"])), str(pagina.cursor["id"]))
            except (KeyError, ValueError) as exc:
                raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
        filas = self._repo.ejecuciones(despues=despues, limite=pagina.limite + 1)
        hay_mas = len(filas) > pagina.limite
        filas = filas[: pagina.limite]
        return PaginaEjecuciones(
            items=[ejecucion(e) for e in filas], total=self._repo.contar_ejecuciones(),
            siguiente=codificar_cursor({"i": filas[-1].inicio.isoformat(), "id": filas[-1].id}) if hay_mas else None,
        )

    def detalle(self, admin: Usuario, ejecucion_id: str) -> DetalleEjecucion:
        exigir_admin(admin)
        e = self._repo.ejecucion(ejecucion_id)
        if e is None:
            raise NoEncontrado("No encontramos esa consulta.")
        return DetalleEjecucion(
            **ejecucion(e).model_dump(),
            radicados=[
                ResultadoRadicado(
                    radicado_id=r.radicado_id, numero=radicado_legible(numero), estado=RESULTADOS.get(r.estado, "pendiente"),
                    actuaciones_nuevas=r.actuaciones_nuevas, error=(r.error or "").strip()[:300] or None,
                )
                for r, numero in self._repo.resultados(e.id)
            ],
        )

    def radicados(self, admin: Usuario, q: str | None, limite: int = 25) -> list[RadicadoConsultable]:
        exigir_admin(admin)
        texto = " ".join((q or "").split())
        return [
            RadicadoConsultable(id=r.id, numero=radicado_legible(r.numero), proceso=proceso)
            for r, proceso in self._repo.radicados(texto, limite)
        ]
