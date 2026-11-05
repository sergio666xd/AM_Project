from sqlalchemy import true
from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.message_templates import radicado_legible
from app.modulos.clientes.politicas import filtro_clientes_visibles
from app.modulos.clientes.repositorio import RepositorioClientes
from app.modulos.expedientes import avisos
from app.radicados import iniciar_consulta_nuevo_radicado, obtener_o_vincular_radicado, radicado_vinculado_a_usuario
from app.modulos.etapas.esquemas import DatosEtapasProceso, EtapaActual, EtapaBreve, EtapaDeLinea, PlantillaBreve
from app.modulos.etapas.linea import cargar_plantilla, es_propia, linea, linea_propia, plantilla_de, plantilla_predeterminada
from app.modulos.etapas.repositorio import RepositorioEtapas
from app.modulos.etapas.servicio import aplicar_etapas
from app.modulos.expedientes import politicas
from app.modulos.expedientes.esquemas import (
    ActividadProceso,
    CambiarEtapa,
    CambioEtapa,
    CambioMiembro,
    CambiosProceso,
    ClienteDelProceso,
    DatosProceso,
    EquipoProceso,
    MiembroEquipo,
    NuevoMiembro,
    NuevoRadicado,
    PaginaProcesos,
    PersonaBreve,
    ProcesoDetalle,
    ProcesoResumen,
    RadicadoAgregado,
    RadicadoConActuaciones,
    RadicadoDelProceso,
    RelacionesProceso,
    VincularCliente,
    VinculosProceso,
)
from app.modulos.folios.repositorio import fecha_actuacion
from app.modulos.tareas.esquemas import ActuacionBreve
from app.modulos.expedientes.modelos import EtapaProceso, Proceso
from app.modulos.expedientes.repositorio import FiltroProcesos, RepositorioProcesos
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado, SinPermiso
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.nucleo.zona_horaria import ahora_utc

NO_ENCONTRADO = "No encontramos el proceso, o no tienes acceso a él."
SOLO_EQUIPO = "Esto es para el equipo de la firma."


def _dia(texto: str | None):
    momento = fecha_actuacion(texto)
    return momento.date() if momento else None


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


def _admite_equipo(proceso: Proceso) -> bool:
    """Los procesos de la firma (responsable ABOGADO_ADMIN) admiten colaboradores; los de un abogado asociado (ABOGADO) no."""
    return proceso.abogado is not None and politicas._rol(proceso.abogado) == RolUsuario.ABOGADO_ADMIN


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
        actividad = {} if politicas.es_cliente(usuario) else self._procesos.actividad(
            [p.id for p in procesos], ahora_utc().replace(tzinfo=None)
        )
        return PaginaProcesos(
            items=[
                ProcesoResumen(
                    **_datos_resumen(proceso, usuario),
                    actividad=ActividadProceso(**actividad[proceso.id]) if proceso.id in actividad else None,
                )
                for proceso in procesos
            ],
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
            etapas_propias=es_propia(plantilla, proceso),
            linea_etapas=[
                EtapaDeLinea(id=e.id, nombre=e.nombre, explicacion=e.explicacion) for e in linea(plantilla, proceso.etapa)
            ],
            etapas=[
                CambioEtapa(etapa=EtapaBreve(id=cambio.etapa.id, nombre=cambio.etapa.nombre), fecha=cambio.fecha,
                            nota=None if cliente else cambio.nota, autor=autor)
                for cambio, autor in self._procesos.historial_etapas(proceso.id)
            ],
        )

    def vinculos(self, usuario: Usuario, proceso_id: int) -> VinculosProceso:
        if politicas.es_cliente(usuario):
            raise SinPermiso("Los vínculos del proceso son para el equipo de la firma.")
        proceso = self._proceso_visible(usuario, proceso_id)
        radicados = sorted((v.radicado for v in proceso.radicados if v.radicado), key=lambda r: r.numero)
        actuaciones = self._procesos.actuaciones_recientes([r.id for r in radicados])
        return VinculosProceso(
            clientes=sorted((_persona(v.cliente) for v in proceso.clientes if v.cliente), key=lambda p: p.nombre),
            radicados=[
                RadicadoConActuaciones(id=r.id, numero=r.numero, actuaciones=[
                    ActuacionBreve(id=a.id, texto=a.actuacion or "Actuación del juzgado", fecha=_dia(a.fecha_actuacion))
                    for a in actuaciones[r.id]
                ])
                for r in radicados
            ],
        )

    def cambiar_etapa(self, usuario: Usuario, proceso_id: int, datos: CambiarEtapa) -> ProcesoDetalle:
        if politicas.es_cliente(usuario):
            raise SinPermiso("Solo el equipo de la firma puede cambiar la etapa del proceso.")
        proceso = self._proceso_visible(usuario, proceso_id)
        etapa = RepositorioEtapas(self._db).etapa(datos.etapa_id)
        ajena = etapa is not None and etapa.plantilla.proceso_id not in (None, proceso.id)
        if etapa is None or ajena or not etapa.activa or not etapa.plantilla.activa:
            raise DatosInvalidos("Esa etapa ya no está disponible.", campos={"etapa_id": "Elija una etapa de la lista."})
        if proceso.etapa_id == etapa.id:
            raise Conflicto("El proceso ya está en esa etapa.", codigo="misma_etapa")
        actual = plantilla_de(proceso, plantilla_predeterminada(self._db))
        if etapa.plantilla_id != actual.id and es_propia(actual, proceso):
            # Pasa a otra plantilla: sus etapas reemplazan las propias del proceso.
            mapa = cargar_plantilla(self._db, proceso, actual, etapa.plantilla)
            etapa = self._db.get(models.EtapaPlantilla, mapa[etapa.id])
        nota = (datos.nota or "").strip() or None
        proceso.etapa = etapa
        proceso.plantilla_etapas = etapa.plantilla
        self._db.add(EtapaProceso(proceso_id=proceso.id, etapa_id=etapa.id, nota=nota, usuario_id=usuario.id,
                                  fecha=ahora_utc().replace(tzinfo=None)))
        registrar_evento_auditoria(self._db, usuario, "proceso.etapa", "proceso", proceso.id,
                                   {"etapa": etapa.nombre, "plantilla": etapa.plantilla.nombre})
        self._db.commit()
        return self.obtener(usuario, proceso_id)

    def editar_etapas(self, usuario: Usuario, proceso_id: int, datos: DatosEtapasProceso) -> ProcesoDetalle:
        """Ajusta las etapas solo de este proceso: agregar, renombrar, reordenar o quitar."""
        if politicas.es_cliente(usuario):
            raise SinPermiso("Solo el equipo de la firma puede cambiar las etapas del proceso.")
        proceso = self._proceso_visible(usuario, proceso_id)
        propia, mapa = linea_propia(self._db, proceso)
        etapas = [e.model_copy(update={"id": mapa.get(e.id, e.id)}) if e.id is not None else e for e in datos.etapas]
        if proceso.etapa_id is not None and proceso.etapa_id not in {e.id for e in etapas if e.activa}:
            raise DatosInvalidos(
                "La etapa actual del proceso no se puede quitar.",
                campos={"etapas": "Cambie primero el proceso a otra etapa y después quite esta."},
            )
        aplicar_etapas(RepositorioEtapas(self._db), propia, etapas)
        registrar_evento_auditoria(self._db, usuario, "proceso.etapas.editar", "proceso", proceso.id,
                                   {"etapas": [e.nombre for e in etapas if e.activa]})
        self._db.commit()
        self._db.expire_all()
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

    # ---- Crear y editar ------------------------------------------------

    def crear(self, usuario: Usuario, datos: DatosProceso) -> ProcesoDetalle:
        if politicas.es_cliente(usuario):
            raise SinPermiso("Los procesos los crea el equipo de la firma.")
        proceso = Proceso(abogado_id=usuario.id, nombre=datos.nombre, descripcion=datos.descripcion)
        self._db.add(proceso)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "proceso.crear", "proceso", proceso.id)
        self._db.commit()
        return self.obtener(usuario, proceso.id)

    def editar(self, usuario: Usuario, proceso_id: int, datos: CambiosProceso) -> ProcesoDetalle:
        proceso = self._proceso_administrable(usuario, proceso_id, "editar el proceso")
        if proceso.archivado_en is not None:
            raise Conflicto("Reabra el proceso para editarlo.", codigo="proceso_archivado")
        cambios = datos.model_dump(exclude_unset=True)
        cambios = {campo: valor for campo, valor in cambios.items() if getattr(proceso, campo) != valor}
        if not cambios:
            return self.obtener(usuario, proceso_id)
        for campo, valor in cambios.items():
            setattr(proceso, campo, valor)
        registrar_evento_auditoria(self._db, usuario, "proceso.actualizar", "proceso", proceso.id,
                                   {"campos": sorted(cambios)})
        self._db.commit()
        if "nombre" in cambios:
            avisos.notificar_clientes(self._db, proceso, usuario, f"Actualización del proceso {proceso.nombre}",
                                      "cambió el nombre del proceso", f"Ahora se llama: {proceso.nombre}")
        return self.obtener(usuario, proceso_id)

    # ---- Clientes y radicados -------------------------------------------

    def _proceso_del_equipo(self, usuario: Usuario, proceso_id: int) -> Proceso:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_EQUIPO)
        proceso = self._proceso_visible(usuario, proceso_id)
        if proceso.archivado_en is not None:
            raise Conflicto("Reabra el proceso para cambiarlo.", codigo="proceso_archivado")
        return proceso

    def relaciones(self, usuario: Usuario, proceso_id: int) -> RelacionesProceso:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_EQUIPO)
        proceso = self._proceso_visible(usuario, proceso_id)
        return self._relaciones(proceso)

    def _relaciones(self, proceso: Proceso) -> RelacionesProceso:
        clientes = sorted((v.cliente for v in proceso.clientes if v.cliente), key=lambda c: c.nombre_completo.casefold())
        radicados = sorted((v.radicado for v in proceso.radicados if v.radicado), key=lambda r: r.numero)
        ids = [r.id for r in radicados]
        recientes = self._procesos.actuaciones_recientes(ids, por_radicado=5)
        totales = self._procesos.total_actuaciones(ids)
        return RelacionesProceso(
            clientes=[ClienteDelProceso(id=c.id, nombre=c.nombre_completo, email=c.email, whatsapp=c.whatsapp_numero or None)
                      for c in clientes],
            radicados=[
                RadicadoDelProceso(
                    id=r.id, numero=r.numero, estado_consulta=r.estado_consulta, total_actuaciones=totales.get(r.id, 0),
                    actuaciones=[
                        ActuacionBreve(id=a.id, texto=a.actuacion or "Actuación del juzgado", fecha=_dia(a.fecha_actuacion))
                        for a in recientes[r.id]
                    ],
                )
                for r in radicados
            ],
            puede_editar=proceso.archivado_en is None,
        )

    def _recargar(self, proceso_id: int) -> Proceso:
        self._db.expire_all()
        proceso = self._procesos.obtener(proceso_id, true())
        if proceso is None:
            raise NoEncontrado(NO_ENCONTRADO)
        return proceso

    def vincular_cliente(self, usuario: Usuario, proceso_id: int, datos: VincularCliente) -> RelacionesProceso:
        proceso = self._proceso_del_equipo(usuario, proceso_id)
        cliente = RepositorioClientes(self._db).cliente(datos.cliente_id, filtro_clientes_visibles(usuario))
        if cliente is None:
            raise NoEncontrado("No encontramos ese cliente.")
        if any(v.cliente_id == cliente.id for v in proceso.clientes):
            raise Conflicto(f"{cliente.nombre_completo} ya tiene acceso a este proceso.", codigo="cliente_vinculado")
        self._db.add(models.ProcesoCliente(proceso_id=proceso.id, cliente_id=cliente.id))
        registrar_evento_auditoria(self._db, usuario, "proceso.cliente.asignar", "proceso_cliente", f"{proceso.id}:{cliente.id}")
        self._db.commit()
        if cliente.estado == models.EstadoUsuario.ACTIVO:
            detalle = f"Responsable: {proceso.abogado.nombre_completo}"
            if proceso.descripcion:
                detalle += f"\nDescripción: {proceso.descripcion}"
            avisos.notificar_clientes(self._db, proceso, usuario, f"Proceso asignado: {proceso.nombre}",
                                      "le dio acceso a este proceso en el portal", detalle, cliente=cliente)
        return self._relaciones(self._recargar(proceso_id))

    def retirar_cliente(self, usuario: Usuario, proceso_id: int, cliente_id: int) -> RelacionesProceso:
        proceso = self._proceso_del_equipo(usuario, proceso_id)
        vinculo = next((v for v in proceso.clientes if v.cliente_id == cliente_id), None)
        if vinculo is None:
            raise NoEncontrado("Ese cliente no tiene acceso a este proceso.")
        registrar_evento_auditoria(self._db, usuario, "proceso.cliente.retirar", "proceso_cliente", f"{proceso.id}:{cliente_id}")
        self._db.delete(vinculo)
        self._db.commit()
        return self._relaciones(self._recargar(proceso_id))

    def agregar_radicado(self, usuario: Usuario, proceso_id: int, datos: NuevoRadicado) -> RadicadoAgregado:
        """Crea el radicado en la firma o reutiliza el que ya existe, y lo vincula al proceso."""
        proceso = self._proceso_del_equipo(usuario, proceso_id)
        responsable = proceso.abogado
        try:
            seguido_antes = radicado_vinculado_a_usuario(self._db, responsable, datos.numero)
            radicado, creado = obtener_o_vincular_radicado(self._db, responsable, datos.numero)
            if usuario.id != responsable.id and politicas._rol(usuario) != RolUsuario.ADMIN:
                obtener_o_vincular_radicado(self._db, usuario, datos.numero)
        except ValueError as error:
            raise DatosInvalidos(str(error), campos={"numero": str(error)}) from error
        if any(v.radicado_id == radicado.id for v in proceso.radicados):
            self._db.rollback()
            raise Conflicto("Ese radicado ya está en este proceso.", codigo="radicado_vinculado")
        self._db.add(models.ProcesoRadicado(proceso_id=proceso.id, radicado_id=radicado.id))
        accion = "radicado.crear_en_proceso" if creado else "radicado.vincular_en_proceso"
        registrar_evento_auditoria(self._db, usuario, accion, "radicado", radicado.id)
        self._db.commit()
        avisos.notificar_clientes(self._db, proceso, usuario, f"Radicado asociado: {radicado.numero}",
                                  "asoció un radicado judicial al proceso", f"Radicado: {radicado_legible(radicado.numero)}",
                                  tipo="ACTUACIONES")
        mensaje = "Radicado agregado al proceso."
        consulta_id = None
        if creado or not seguido_antes:
            texto, consulta_id = iniciar_consulta_nuevo_radicado(self._db, responsable, radicado)
            mensaje = f"{mensaje} {texto}" if consulta_id is None else f"{mensaje} Lo consultamos en la Rama Judicial."
        return RadicadoAgregado(relaciones=self._relaciones(self._recargar(proceso_id)), radicado_id=radicado.id,
                                consulta_id=consulta_id, mensaje=mensaje)

    def retirar_radicado(self, usuario: Usuario, proceso_id: int, radicado_id: int) -> RelacionesProceso:
        proceso = self._proceso_del_equipo(usuario, proceso_id)
        vinculo = next((v for v in proceso.radicados if v.radicado_id == radicado_id), None)
        if vinculo is None:
            raise NoEncontrado("Ese radicado no está en este proceso.")
        registrar_evento_auditoria(self._db, usuario, "proceso.radicado.retirar", "proceso_radicado", f"{proceso.id}:{radicado_id}")
        self._db.delete(vinculo)
        self._db.commit()
        return self._relaciones(self._recargar(proceso_id))

    # ---- Equipo ---------------------------------------------------------

    def equipo(self, usuario: Usuario, proceso_id: int) -> EquipoProceso:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_EQUIPO)
        return self._equipo(usuario, self._proceso_visible(usuario, proceso_id))

    def _equipo(self, usuario: Usuario, proceso: Proceso) -> EquipoProceso:
        admite = _admite_equipo(proceso)
        miembros = sorted(
            (v for v in proceso.colaboradores if v.abogado and v.abogado.rol == RolUsuario.ABOGADO_ADMIN),
            key=lambda v: v.abogado.nombre_completo.casefold(),
        )
        ocupados = {proceso.abogado_id, *(v.abogado_id for v in miembros)}
        puede = admite and proceso.archivado_en is None and politicas.puede_administrar(usuario, proceso)
        return EquipoProceso(
            admite_equipo=admite,
            puede_gestionar=puede,
            responsable=_persona(proceso.abogado),
            miembros=[MiembroEquipo(id=v.abogado.id, nombre=v.abogado.nombre_completo, visible_cliente=v.visible_cliente)
                      for v in miembros],
            disponibles=[_persona(a) for a in self._procesos.abogados_de_la_firma() if a.id not in ocupados] if puede else [],
        )

    def _proceso_de_equipo_gestionable(self, usuario: Usuario, proceso_id: int) -> Proceso:
        proceso = self._proceso_administrable(usuario, proceso_id, "cambiar el equipo del proceso")
        if not _admite_equipo(proceso):
            raise Conflicto("Este proceso no admite colaboradores.", codigo="sin_equipo")
        if proceso.archivado_en is not None:
            raise Conflicto("Reabra el proceso para cambiar su equipo.", codigo="proceso_archivado")
        return proceso

    def agregar_miembro(self, usuario: Usuario, proceso_id: int, datos: NuevoMiembro) -> EquipoProceso:
        proceso = self._proceso_de_equipo_gestionable(usuario, proceso_id)
        if datos.abogado_id == proceso.abogado_id:
            raise Conflicto("El responsable ya está en el equipo del proceso.", codigo="es_responsable")
        abogado = next((a for a in self._procesos.abogados_de_la_firma() if a.id == datos.abogado_id), None)
        if abogado is None:
            raise DatosInvalidos("Elija un abogado activo de la firma.", campos={"abogado_id": "Elija un abogado de la lista."})
        if self._procesos.colaboracion(proceso.id, abogado.id):
            raise Conflicto(f"{abogado.nombre_completo} ya está en el equipo.", codigo="ya_en_equipo")
        self._db.add(models.ProcesoColaborador(proceso_id=proceso.id, abogado_id=abogado.id,
                                               asignado_por_id=usuario.id, visible_cliente=datos.visible_cliente))
        registrar_evento_auditoria(self._db, usuario, "proceso.colaborador.asignar", "proceso", proceso.id)
        self._db.commit()
        avisos.avisar_miembro_agregado(self._db, proceso, abogado, usuario, datos.visible_cliente)
        return self._equipo(usuario, self._recargar(proceso_id))

    def cambiar_miembro(self, usuario: Usuario, proceso_id: int, abogado_id: int, datos: CambioMiembro) -> EquipoProceso:
        proceso = self._proceso_de_equipo_gestionable(usuario, proceso_id)
        colaboracion = self._procesos.colaboracion(proceso.id, abogado_id)
        if colaboracion is None:
            raise NoEncontrado("Ese abogado no está en el equipo del proceso.")
        if colaboracion.visible_cliente != datos.visible_cliente:
            colaboracion.visible_cliente = datos.visible_cliente
            registrar_evento_auditoria(self._db, usuario, "proceso.colaborador.actualizar_permiso", "proceso", proceso.id)
            self._db.commit()
        return self._equipo(usuario, self._recargar(proceso_id))

    def retirar_miembro(self, usuario: Usuario, proceso_id: int, abogado_id: int) -> EquipoProceso:
        proceso = self._proceso_de_equipo_gestionable(usuario, proceso_id)
        colaboracion = self._procesos.colaboracion(proceso.id, abogado_id)
        if colaboracion is None:
            raise NoEncontrado("Ese abogado no está en el equipo del proceso.")
        registrar_evento_auditoria(self._db, usuario, "proceso.colaborador.retirar", "proceso", proceso.id)
        self._db.delete(colaboracion)
        self._db.commit()
        return self._equipo(usuario, self._recargar(proceso_id))

    # ---- Acceso ---------------------------------------------------------

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
