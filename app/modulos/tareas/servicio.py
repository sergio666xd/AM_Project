"""Casos de uso de tareas para el equipo de la firma.

Quién ve qué: las tareas de los procesos activos que el usuario ve (ver
`expedientes.politicas`) y sus tareas generales, sin proceso. ADMIN ve también
las tareas generales de todo el equipo. Quien ve una tarea puede cambiarla,
como en la API v1.

Los recordatorios y avisos de cada cambio siguen en `app.routers.tareas`
mientras viva la API v1; aquí se llaman igual que allí.
"""

import unicodedata
from datetime import timedelta

from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.modulos.judicial.terminos import calcular
from app.modulos.tareas.esquemas import (
    AplicarPlantilla,
    AvanceSubtareas,
    CambioEnLote,
    DatosPlantilla,
    Grupo,
    ListaPlantillas,
    ListaTareas,
    PersonaBreve,
    Plantilla,
    ResultadoLote,
    ResumenTareas,
    TareaResumen,
    TareasCreadas,
)
from app.modulos.tareas.modelos import EstadoTarea, PlantillaTarea, PrioridadTarea, Tarea
from app.modulos.tareas.repositorio import ABIERTAS, RepositorioTareas
from app.nucleo.errores import ErrorDominio, NoEncontrado, SinPermiso
from app.nucleo.zona_horaria import a_colombia, fin_del_dia_utc
from app.timezone import utc_ahora

SOLO_FIRMA = "Las tareas del equipo son para la firma."
CERRADAS = (EstadoTarea.COMPLETADA, EstadoTarea.CANCELADA)


def _sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def coincide(plantilla: PlantillaTarea, texto: str) -> bool:
    """Si alguna palabra clave de la plantilla aparece en el texto, sin importar tildes ni mayúsculas."""
    texto = _sin_tildes(texto)
    return any(_sin_tildes(palabra) in texto for palabra in plantilla.palabras_clave or [] if palabra)


class ServicioTareas:
    def __init__(self, db: Session, repositorio: RepositorioTareas):
        self._db = db
        self._repo = repositorio

    # ---- Consulta -------------------------------------------------------

    def _alcance(self, usuario: Usuario):
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_FIRMA)
        procesos = self._repo.procesos_activos(politicas.filtro_procesos_visibles(usuario))
        toda_la_firma = getattr(usuario.rol, "value", usuario.rol) == RolUsuario.ADMIN.value
        return procesos, self._repo.condicion_visibles(list(procesos), usuario.id, toda_la_firma)

    def listar(self, usuario: Usuario, grupo: Grupo, proceso_id: int | None, solo_mias: bool) -> ListaTareas:
        procesos, visibles = self._alcance(usuario)
        ahora = utc_ahora()
        filtros = []
        if proceso_id is not None:
            filtros.append(Tarea.proceso_id == proceso_id)
        if solo_mias:
            filtros.append(Tarea.usuario_id == usuario.id)
        base = list(filtros)
        if grupo == "abiertas":
            filtros.append(self._repo.abiertas())
        elif grupo == "vencidas":
            filtros.extend(self._repo.vencidas(ahora))
        elif grupo == "semana":
            filtros.extend([self._repo.abiertas(), Tarea.fecha_limite >= ahora, Tarea.fecha_limite <= ahora + timedelta(days=7)])
        elif grupo == "completadas":
            filtros.append(Tarea.estado == EstadoTarea.COMPLETADA)
        tareas, total = self._repo.listar(visibles, filtros)
        resumen = ResumenTareas(
            abiertas=self._repo.contar(visibles, *base, self._repo.abiertas()),
            vencidas=self._repo.contar(visibles, *base, *self._repo.vencidas(ahora)),
            semana=self._repo.contar(visibles, *base, self._repo.abiertas(), Tarea.fecha_limite >= ahora,
                                     Tarea.fecha_limite <= ahora + timedelta(days=7)),
            completadas=self._repo.contar(visibles, *base, Tarea.estado == EstadoTarea.COMPLETADA,
                                          Tarea.completada_en >= ahora - timedelta(days=30)),
        )
        return ListaTareas(items=[self._resumen(t, procesos, ahora) for t in tareas], total=total, resumen=resumen)

    @staticmethod
    def _resumen(tarea: Tarea, procesos: dict[int, str], ahora) -> TareaResumen:
        estado = getattr(tarea.estado, "value", tarea.estado)
        cliente = tarea.cliente_asignado
        return TareaResumen(
            id=tarea.id,
            titulo=tarea.titulo,
            descripcion=tarea.descripcion,
            estado=estado,
            prioridad=getattr(tarea.prioridad, "value", tarea.prioridad),
            fecha_limite=tarea.fecha_limite,
            completada_en=tarea.completada_en,
            vencida=bool(tarea.fecha_limite and tarea.fecha_limite < ahora and tarea.estado in ABIERTAS),
            proceso=ProcesoBreve(id=tarea.proceso_id, nombre=procesos[tarea.proceso_id]) if tarea.proceso_id in procesos else None,
            radicado=tarea.radicado.numero if tarea.radicado else None,
            cliente=PersonaBreve(id=cliente.id, nombre=cliente.nombre_completo) if cliente else None,
            responsable=PersonaBreve(id=tarea.usuario.id, nombre=tarea.usuario.nombre_completo),
            subtareas=AvanceSubtareas(total=len(tarea.subtareas), hechas=sum(1 for s in tarea.subtareas if s.completada)),
        )

    # ---- Cambios en lote -----------------------------------------------

    def cambiar_en_lote(self, usuario: Usuario, datos: CambioEnLote) -> ResultadoLote:
        from app.routers.tareas import (
            _crear_recordatorios_sistema,
            _descartar_recordatorios_tarea,
            _invalidar_recordatorios_sistema,
            _lanzar_recordatorios_pendientes,
            _notificar_cambio_tarea,
            _versionar_recordatorios_pendientes,
        )

        _procesos, visibles = self._alcance(usuario)
        tareas = self._repo.por_ids(visibles, datos.ids)
        faltan = sorted(set(datos.ids) - {t.id for t in tareas})
        if faltan:
            raise NoEncontrado(
                "Algunas tareas ya no existen o no las puedes ver. Actualiza la lista e inténtalo de nuevo.",
                campos={"ids": ", ".join(map(str, faltan))},
            )
        campos = datos.model_fields_set
        ahora = utc_ahora()
        fecha_limite = None
        if "fecha_limite" in campos and datos.fecha_limite is not None:
            fecha_limite = fin_del_dia_utc(datos.fecha_limite)
            if fecha_limite <= ahora:
                raise ErrorDominio("La fecha límite ya pasó.", codigo="fecha_pasada",
                                   campos={"fecha_limite": "Elige hoy o una fecha futura."})

        if datos.eliminar:
            for tarea in tareas:
                _descartar_recordatorios_tarea(self._db, tarea)
                _notificar_cambio_tarea(self._db, tarea, usuario, "eliminó la tarea",
                                        "La tarea y sus recordatorios asociados se eliminaron del sistema.")
                registrar_evento_auditoria(self._db, usuario, "tarea.eliminar", "tarea", tarea.id)
                self._db.delete(tarea)
            self._db.commit()
            return ResultadoLote(ids=datos.ids, mensaje=_plural(len(tareas), "tarea eliminada", "tareas eliminadas"))

        por_lanzar: dict[int, list[int]] = {}
        avisos: list[tuple[Tarea, str]] = []
        for tarea in tareas:
            anterior = tarea.estado
            cambios = []
            if datos.estado is not None and tarea.estado.value != datos.estado:
                tarea.estado = EstadoTarea(datos.estado)
                tarea.completada_en = ahora if tarea.estado == EstadoTarea.COMPLETADA else None
                cambios.append(f"estado {datos.estado}")
            if datos.prioridad is not None and tarea.prioridad.value != datos.prioridad:
                tarea.prioridad = PrioridadTarea(datos.prioridad)
                cambios.append(f"prioridad {datos.prioridad}")
            fecha_cambio = "fecha_limite" in campos and tarea.fecha_limite != fecha_limite
            if fecha_cambio:
                tarea.fecha_limite = fecha_limite
                cambios.append("vencimiento actualizado")
            if not cambios:
                continue
            # Igual que `PUT /api/tareas/{id}`: cerrar descarta los recordatorios, reabrir o
            # mover la fecha los vuelve a programar.
            if tarea.estado in CERRADAS:
                _descartar_recordatorios_tarea(self._db, tarea)
                ids = []
            elif fecha_cambio:
                ids = _versionar_recordatorios_pendientes(tarea, incluir_sistema=False)
                _invalidar_recordatorios_sistema(tarea)
                ids.extend(_crear_recordatorios_sistema(self._db, tarea))
            elif anterior in CERRADAS:
                ids = _versionar_recordatorios_pendientes(tarea)
                _invalidar_recordatorios_sistema(tarea)
                ids.extend(_crear_recordatorios_sistema(self._db, tarea))
            else:
                ids = []
            por_lanzar[tarea.id] = ids
            avisos.append((tarea, "; ".join(cambios)))
            registrar_evento_auditoria(self._db, usuario, "tarea.actualizar_lote", "tarea", tarea.id)
        self._db.commit()
        for tarea, detalle in avisos:
            _lanzar_recordatorios_pendientes(self._db, tarea, por_lanzar[tarea.id])
            _notificar_cambio_tarea(self._db, tarea, usuario, "actualizó la tarea", detalle)
        return ResultadoLote(ids=datos.ids, mensaje=_plural(len(avisos), "tarea actualizada", "tareas actualizadas"))

    # ---- Plantillas -----------------------------------------------------

    def plantillas(self, usuario: Usuario, para: str | None) -> ListaPlantillas:
        self._alcance(usuario)
        items = [self._plantilla(p, usuario, para) for p in self._repo.plantillas()]
        items.sort(key=lambda p: not p.coincide)
        return ListaPlantillas(items=items)

    @staticmethod
    def _puede_editar(plantilla: PlantillaTarea, usuario: Usuario) -> bool:
        # Las sembradas no tienen autor: las edita cualquiera que administre.
        rol = getattr(usuario.rol, "value", usuario.rol)
        return rol in {RolUsuario.ADMIN.value, RolUsuario.ABOGADO_ADMIN.value} or plantilla.creado_por_id == usuario.id

    def _plantilla(self, plantilla: PlantillaTarea, usuario: Usuario, para: str | None = None) -> Plantilla:
        return Plantilla(
            id=plantilla.id, nombre=plantilla.nombre, descripcion=plantilla.descripcion,
            palabras_clave=plantilla.palabras_clave or [], pasos=plantilla.pasos or [],
            coincide=bool(para) and coincide(plantilla, para), puede_editar=self._puede_editar(plantilla, usuario),
        )

    def crear_plantilla(self, usuario: Usuario, datos: DatosPlantilla) -> Plantilla:
        self._alcance(usuario)
        plantilla = PlantillaTarea(creado_por_id=usuario.id, **self._columnas(datos))
        self._db.add(plantilla)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "plantilla_tarea.crear", "plantilla_tarea", plantilla.id)
        self._db.commit()
        return self._plantilla(plantilla, usuario)

    def editar_plantilla(self, usuario: Usuario, plantilla_id: int, datos: DatosPlantilla) -> Plantilla:
        plantilla = self._plantilla_editable(usuario, plantilla_id)
        for campo, valor in self._columnas(datos).items():
            setattr(plantilla, campo, valor)
        registrar_evento_auditoria(self._db, usuario, "plantilla_tarea.editar", "plantilla_tarea", plantilla.id)
        self._db.commit()
        return self._plantilla(plantilla, usuario)

    def eliminar_plantilla(self, usuario: Usuario, plantilla_id: int) -> None:
        plantilla = self._plantilla_editable(usuario, plantilla_id)
        registrar_evento_auditoria(self._db, usuario, "plantilla_tarea.eliminar", "plantilla_tarea", plantilla.id)
        self._db.delete(plantilla)
        self._db.commit()

    @staticmethod
    def _columnas(datos: DatosPlantilla) -> dict:
        return {
            "nombre": datos.nombre, "descripcion": (datos.descripcion or "").strip() or None,
            "palabras_clave": datos.palabras_clave, "pasos": [paso.model_dump() for paso in datos.pasos],
        }

    def _plantilla_editable(self, usuario: Usuario, plantilla_id: int) -> PlantillaTarea:
        self._alcance(usuario)
        plantilla = self._repo.plantilla(plantilla_id)
        if plantilla is None:
            raise NoEncontrado("No encontramos la plantilla.")
        if not self._puede_editar(plantilla, usuario):
            raise SinPermiso("Solo quien creó la plantilla o quien administra la firma puede cambiarla.")
        return plantilla

    def aplicar_plantilla(self, usuario: Usuario, plantilla_id: int, datos: AplicarPlantilla) -> TareasCreadas:
        from app.routers.tareas import _crear_recordatorios_sistema, _lanzar_recordatorios_pendientes

        procesos, _visibles = self._alcance(usuario)
        plantilla = self._repo.plantilla(plantilla_id)
        if plantilla is None:
            raise NoEncontrado("No encontramos la plantilla.")
        proceso = self._db.get(models.Proceso, datos.proceso_id) if datos.proceso_id in procesos else None
        if proceso is None:
            raise NoEncontrado("No encontramos el proceso.", campos={"proceso_id": "Elige un proceso activo."})
        equipo = {proceso.abogado_id, *(v.abogado_id for v in proceso.colaboradores)}
        responsable_id = usuario.id if usuario.id in equipo else proceso.abogado_id
        origen = f"del folio {datos.folio}" if datos.folio else f"notificada el {datos.notificacion.strftime('%d/%m/%Y')}"
        ahora = utc_ahora()
        creadas: list[Tarea] = []
        for paso in plantilla.pasos or []:
            dias = paso.get("dias_habiles")
            fecha_limite = fin_del_dia_utc(calcular(datos.notificacion, dias).vence) if dias else None
            tarea = Tarea(
                usuario_id=responsable_id, proceso_id=proceso.id, titulo=paso["titulo"],
                descripcion=f"Plantilla «{plantilla.nombre}», actuación {origen}.",
                prioridad=PrioridadTarea(paso.get("prioridad") or "MEDIA"),
                # Un paso cuyo plazo ya venció queda sin hora pasada: vence hoy y sale como urgente.
                fecha_limite=max(fecha_limite, fin_del_dia_utc(_hoy())) if fecha_limite else None,
            )
            self._db.add(tarea)
            creadas.append(tarea)
        if not creadas:
            raise ErrorDominio("La plantilla no tiene pasos.", codigo="plantilla_vacia")
        self._db.flush()
        por_lanzar = {t.id: _crear_recordatorios_sistema(self._db, t) for t in creadas}
        registrar_evento_auditoria(self._db, usuario, "plantilla_tarea.aplicar", "proceso", proceso.id)
        self._db.commit()
        for tarea in creadas:
            _lanzar_recordatorios_pendientes(self._db, tarea, por_lanzar[tarea.id])
            self._db.refresh(tarea)
        return TareasCreadas(items=[self._resumen(t, procesos, ahora) for t in creadas])


def _hoy():
    return a_colombia(utc_ahora()).date()


def _plural(n: int, singular: str, plural: str) -> str:
    return f"1 {singular}" if n == 1 else f"{n} {plural}"
