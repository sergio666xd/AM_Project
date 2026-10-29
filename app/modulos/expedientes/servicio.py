from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.modulos.etapas.esquemas import EtapaActual, EtapaBreve, PlantillaBreve
from app.modulos.etapas.linea import linea, plantilla_de, plantilla_predeterminada
from app.modulos.etapas.repositorio import RepositorioEtapas
from app.modulos.expedientes import politicas
from app.modulos.expedientes.esquemas import (
    CambiarEtapa,
    CambioEtapa,
    PaginaProcesos,
    PersonaBreve,
    ProcesoDetalle,
    ProcesoResumen,
)
from app.modulos.expedientes.modelos import EtapaProceso, Proceso
from app.modulos.expedientes.repositorio import FiltroProcesos, RepositorioProcesos
from app.modulos.identidad.modelos import Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado, SinPermiso
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.nucleo.zona_horaria import ahora_utc

NO_ENCONTRADO = "No encontramos el proceso, o no tienes acceso a él."


def _persona(usuario: Usuario) -> PersonaBreve:
    return PersonaBreve(id=usuario.id, nombre=usuario.nombre_completo)


def etapa_actual(proceso: Proceso) -> EtapaActual | None:
    if proceso.etapa is None:
        return None
    etapas = linea(proceso.plantilla_etapas or proceso.etapa.plantilla, proceso.etapa)
    posicion = next((i for i, e in enumerate(etapas, start=1) if e.id == proceso.etapa.id), 0)
    return EtapaActual(id=proceso.etapa.id, nombre=proceso.etapa.nombre, posicion=posicion, total=len(etapas))


def _datos_resumen(proceso: Proceso, usuario: Usuario) -> dict:
    return {
        "id": proceso.id,
        "nombre": proceso.nombre,
        "descripcion": proceso.descripcion,
        "responsable": _persona(proceso.abogado),
        "clientes": [_persona(vinculo.cliente) for vinculo in proceso.clientes if vinculo.cliente],
        "radicados": sorted(vinculo.radicado.numero for vinculo in proceso.radicados if vinculo.radicado),
        "etapa": etapa_actual(proceso),
        "archivado_en": proceso.archivado_en,
        "creado_en": proceso.created_at,
        "puede_administrar": politicas.puede_administrar(usuario, proceso),
    }


class ServicioProcesos:
    def __init__(self, db: Session, procesos: RepositorioProcesos):
        self._db = db
        self._procesos = procesos

    def listar(self, usuario: Usuario, filtro: FiltroProcesos, pagina: ParametrosPagina) -> PaginaProcesos:
        antes_de_id = None
        if pagina.cursor is not None:
            antes_de_id = int(pagina.cursor.get("id", 0)) or None
        # Se pide uno de más para saber si hay página siguiente sin otra consulta.
        procesos, total = self._procesos.listar(
            politicas.filtro_procesos_visibles(usuario),
            filtro,
            limite=pagina.limite + 1,
            antes_de_id=antes_de_id,
        )
        hay_mas = len(procesos) > pagina.limite
        procesos = procesos[: pagina.limite]
        return PaginaProcesos(
            items=[ProcesoResumen(**_datos_resumen(proceso, usuario)) for proceso in procesos],
            total=total,
            siguiente=codificar_cursor({"id": procesos[-1].id}) if hay_mas else None,
        )

    def obtener(self, usuario: Usuario, proceso_id: int) -> ProcesoDetalle:
        proceso = self._proceso_visible(usuario, proceso_id)
        colaboradores = [
            vinculo
            for vinculo in proceso.colaboradores
            if vinculo.abogado and (vinculo.visible_cliente or not politicas.es_cliente(usuario))
        ]
        cliente = politicas.es_cliente(usuario)
        predeterminada = plantilla_predeterminada(self._db)
        plantilla = plantilla_de(proceso, predeterminada)
        return ProcesoDetalle(
            **_datos_resumen(proceso, usuario),
            colaboradores=[_persona(vinculo.abogado) for vinculo in colaboradores],
            plantilla=PlantillaBreve(id=plantilla.id, nombre=plantilla.nombre),
            linea_etapas=[EtapaBreve(id=e.id, nombre=e.nombre) for e in linea(plantilla, proceso.etapa)],
            etapas=[
                CambioEtapa(etapa=EtapaBreve(id=cambio.etapa.id, nombre=cambio.etapa.nombre), fecha=cambio.fecha,
                            nota=None if cliente else cambio.nota, autor=autor)
                for cambio, autor in self._procesos.historial_etapas(proceso.id)
            ],
        )

    def cambiar_etapa(self, usuario: Usuario, proceso_id: int, datos: CambiarEtapa) -> ProcesoDetalle:
        if politicas.es_cliente(usuario):
            raise SinPermiso("Solo el equipo de la firma puede cambiar la etapa del proceso.")
        proceso = self._proceso_visible(usuario, proceso_id)
        etapa = RepositorioEtapas(self._db).etapa(datos.etapa_id)
        if etapa is None or not etapa.activa or not etapa.plantilla.activa:
            raise DatosInvalidos("Esa etapa ya no está disponible.", campos={"etapa_id": "Elija una etapa de la lista."})
        if proceso.etapa_id == etapa.id:
            raise Conflicto("El proceso ya está en esa etapa.", codigo="misma_etapa")
        nota = (datos.nota or "").strip() or None
        proceso.etapa = etapa
        proceso.plantilla_etapas = etapa.plantilla
        self._db.add(EtapaProceso(proceso_id=proceso.id, etapa_id=etapa.id, nota=nota, usuario_id=usuario.id,
                                  fecha=ahora_utc().replace(tzinfo=None)))
        registrar_evento_auditoria(self._db, usuario, "proceso.etapa", "proceso", proceso.id,
                                   {"etapa": etapa.nombre, "plantilla": etapa.plantilla.nombre})
        self._db.commit()
        return self.obtener(usuario, proceso_id)

    def archivar(self, usuario: Usuario, proceso_id: int) -> ProcesoDetalle:
        proceso = self._proceso_administrable(usuario, proceso_id, "archivar el proceso")
        if proceso.archivado_en is not None:
            raise Conflicto("El proceso ya está archivado.", codigo="ya_archivado")
        proceso.archivado_en = ahora_utc()
        registrar_evento_auditoria(self._db, usuario, "proceso.archivar", "proceso", proceso.id)
        self._db.commit()
        return self.obtener(usuario, proceso_id)

    def reabrir(self, usuario: Usuario, proceso_id: int) -> ProcesoDetalle:
        proceso = self._proceso_administrable(usuario, proceso_id, "reabrir el proceso")
        if proceso.archivado_en is None:
            raise Conflicto("El proceso no está archivado.", codigo="no_archivado")
        proceso.archivado_en = None
        registrar_evento_auditoria(self._db, usuario, "proceso.restaurar", "proceso", proceso.id)
        self._db.commit()
        return self.obtener(usuario, proceso_id)

    def _proceso_visible(self, usuario: Usuario, proceso_id: int) -> Proceso:
        proceso = self._procesos.obtener(proceso_id, politicas.filtro_procesos_visibles(usuario))
        if proceso is None:
            raise NoEncontrado(NO_ENCONTRADO)
        return proceso

    def _proceso_administrable(self, usuario: Usuario, proceso_id: int, accion: str) -> Proceso:
        proceso = self._proceso_visible(usuario, proceso_id)
        if not politicas.puede_administrar(usuario, proceso):
            raise SinPermiso(f"Solo el abogado responsable o la administración pueden {accion}.")
        return proceso
