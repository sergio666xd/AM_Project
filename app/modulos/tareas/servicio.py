"""Casos de uso de tareas para el equipo de la firma.

Quién ve qué: las tareas de los procesos activos que el usuario ve (ver
`expedientes.politicas`) y sus tareas generales, sin proceso. ADMIN ve también
las tareas generales de todo el equipo. Quien ve una tarea puede cambiarla.

Cada cambio reprograma los recordatorios (`recordatorios`) y le avisa a la otra
parte (`avisos`): al cliente asignado o, si no hay, al responsable.
"""

import unicodedata
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.audit import registrar_evento_auditoria
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.expedientes import politicas
from app.modulos.folios.repositorio import fecha_actuacion
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.modulos.judicial.terminos import calcular
from app.modulos.tareas import recordatorios
from app.modulos.tareas.avisos import ELIMINO, notificar_cambio, notificar_subtarea_asignada
from app.modulos.tareas.esquemas import (
    ActuacionBreve,
    AplicarPlantilla,
    AvanceSubtareas,
    CambiosRecordatorio,
    CambiosSubtarea,
    CambiosTarea,
    DatosRecordatorio,
    DatosSubtarea,
    DatosTarea,
    CambioEnLote,
    DatosPlantilla,
    Grupo,
    ListaPlantillas,
    ListaTareas,
    PersonaBreve,
    Plantilla,
    RadicadoBreve,
    Recordatorio,
    ResultadoLote,
    ResumenTareas,
    SubtareaDetalle,
    TareaDetalle,
    TareaResumen,
    TareasCreadas,
)
from app.modulos.tareas.modelos import EstadoTarea, PlantillaTarea, PrioridadTarea, Tarea
from app.modulos.tareas.repositorio import ABIERTAS, RepositorioTareas
from app.message_templates import texto_legible
from app.nucleo.errores import Conflicto, DatosInvalidos, ErrorDominio, NoEncontrado, SinPermiso
from app.nucleo.zona_horaria import a_colombia, fin_del_dia_utc
from app.reminder_workflow import momento_programado, normalizar_utc_naive
from app.timezone import format_colombia_datetime, utc_ahora

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
                recordatorios.descartar(self._db, tarea)
                notificar_cambio(self._db, tarea, usuario, "eliminó la tarea",
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
            # Igual que al editar una tarea: cerrar descarta los recordatorios, reabrir o
            # mover la fecha los vuelve a programar.
            if tarea.estado in CERRADAS:
                recordatorios.descartar(self._db, tarea)
                ids = []
            elif fecha_cambio:
                ids = recordatorios.versionar_pendientes(tarea, incluir_sistema=False)
                recordatorios.invalidar_sistema(tarea)
                ids.extend(recordatorios.crear_sistema(self._db, tarea))
            elif anterior in CERRADAS:
                ids = recordatorios.versionar_pendientes(tarea)
                recordatorios.invalidar_sistema(tarea)
                ids.extend(recordatorios.crear_sistema(self._db, tarea))
            else:
                ids = []
            por_lanzar[tarea.id] = ids
            avisos.append((tarea, "; ".join(cambios)))
            registrar_evento_auditoria(self._db, usuario, "tarea.actualizar_lote", "tarea", tarea.id)
        self._db.commit()
        for tarea, detalle in avisos:
            recordatorios.lanzar(self._db, tarea, por_lanzar[tarea.id])
            notificar_cambio(self._db, tarea, usuario, "actualizó la tarea", detalle)
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
        por_lanzar = {t.id: recordatorios.crear_sistema(self._db, t) for t in creadas}
        registrar_evento_auditoria(self._db, usuario, "plantilla_tarea.aplicar", "proceso", proceso.id)
        self._db.commit()
        for tarea in creadas:
            recordatorios.lanzar(self._db, tarea, por_lanzar[tarea.id])
            self._db.refresh(tarea)
        return TareasCreadas(items=[self._resumen(t, procesos, ahora) for t in creadas])


    # ---- Una tarea ------------------------------------------------------

    def _tarea(self, usuario: Usuario, tarea_id: int) -> tuple[Tarea, dict[int, str]]:
        procesos, visibles = self._alcance(usuario)
        tarea = self._repo.tarea(visibles, tarea_id)
        if tarea is None:
            raise NoEncontrado("No encontramos la tarea, o no la puede ver.")
        return tarea, procesos

    def obtener(self, usuario: Usuario, tarea_id: int) -> TareaDetalle:
        tarea, procesos = self._tarea(usuario, tarea_id)
        return self._detalle(tarea, procesos)

    def _detalle(self, tarea: Tarea, procesos: dict[int, str]) -> TareaDetalle:
        ahora = utc_ahora()
        resumen = self._resumen(tarea, procesos, ahora)
        actuacion = tarea.actuacion_rel
        abierta = tarea.estado not in CERRADAS
        automaticos = sorted(
            momento for r in tarea.recordatorios
            if r.interno_sistema and r.activo and r.enviado_en is None and abierta
            and (momento := momento_programado(r, tarea)) and momento > ahora
        )
        return TareaDetalle(
            **resumen.model_dump(include={"id", "titulo", "descripcion", "estado", "prioridad", "fecha_limite",
                                          "completada_en", "vencida", "proceso", "cliente", "responsable"}),
            creada_en=tarea.created_at,
            actualizada_en=tarea.updated_at,
            radicado=RadicadoBreve(id=tarea.radicado.id, numero=tarea.radicado.numero) if tarea.radicado else None,
            actuacion=ActuacionBreve(id=actuacion.id, texto=actuacion.actuacion or "Actuación del juzgado",
                                     fecha=_fecha(actuacion.fecha_actuacion)) if actuacion else None,
            subtareas=[self._subtarea(s) for s in tarea.subtareas],
            recordatorios=[
                Recordatorio(
                    id=r.id, fecha_hora=r.fecha_hora, anticipacion_minutos=r.anticipacion_minutos,
                    cuando=momento_programado(r, tarea), correo=r.notificar_email, whatsapp=r.notificar_whatsapp,
                    activo=r.activo, enviado_en=r.enviado_en,
                )
                for r in sorted(
                    (r for r in tarea.recordatorios if not r.interno_sistema),
                    key=lambda r: momento_programado(r, tarea) or datetime.max,
                )
            ],
            avisos_automaticos=automaticos,
        )

    def _subtarea(self, subtarea: models.Subtarea) -> SubtareaDetalle:
        cliente = self._db.get(models.Usuario, subtarea.cliente_id) if subtarea.asignada_cliente and subtarea.cliente_id else None
        return SubtareaDetalle(
            id=subtarea.id, titulo=subtarea.titulo, completada=subtarea.completada, completada_en=subtarea.completada_en,
            cliente=PersonaBreve(id=cliente.id, nombre=cliente.nombre_completo) if cliente else None,
            avisar_correo=subtarea.notificar_email, avisar_whatsapp=subtarea.notificar_whatsapp,
        )

    def _vinculos(self, procesos: dict[int, str], proceso_id: int | None, radicado_id: int | None,
                  actuacion_id: int | None, cliente_id: int | None) -> tuple[int | None, int | None]:
        """Valida proceso, radicado, actuación y cliente; devuelve el radicado y la actuación que quedan."""
        if proceso_id is None:
            if radicado_id or actuacion_id or cliente_id:
                raise DatosInvalidos("Una tarea sin proceso no lleva radicado, actuación ni cliente.",
                                     campos={"proceso_id": "Elija primero el proceso."})
            return None, None
        if proceso_id not in procesos:
            raise NoEncontrado("No encontramos ese proceso entre los activos que usted ve.",
                               campos={"proceso_id": "Elija un proceso activo."})
        radicados = self._repo.radicados_de(proceso_id)
        if actuacion_id is not None:
            actuacion = self._db.get(models.Actuacion, actuacion_id)
            if actuacion is None or actuacion.radicado_id not in radicados:
                raise DatosInvalidos("Esa actuación no es de un radicado del proceso.",
                                     campos={"actuacion_id": "Elija una actuación de la lista."})
            if radicado_id is not None and radicado_id != actuacion.radicado_id:
                raise DatosInvalidos("La actuación no es de ese radicado.", campos={"actuacion_id": "Elija una actuación del radicado."})
            radicado_id = actuacion.radicado_id
        if radicado_id is not None and radicado_id not in radicados:
            raise DatosInvalidos("Ese radicado no está vinculado al proceso.", campos={"radicado_id": "Elija un radicado del proceso."})
        if cliente_id is not None and cliente_id not in self._repo.clientes_de(proceso_id):
            raise DatosInvalidos("Esa persona no es cliente del proceso.", campos={"cliente_id": "Elija un cliente del proceso."})
        return radicado_id, actuacion_id

    def crear(self, usuario: Usuario, datos: DatosTarea) -> TareaDetalle:
        procesos, _visibles = self._alcance(usuario)
        radicado_id, actuacion_id = self._vinculos(procesos, datos.proceso_id, datos.radicado_id,
                                                   datos.actuacion_id, datos.cliente_id)
        responsable_id = usuario.id
        if datos.proceso_id is not None:
            proceso = self._db.get(models.Proceso, datos.proceso_id)
            equipo = {proceso.abogado_id, *(v.abogado_id for v in proceso.colaboradores)}
            responsable_id = usuario.id if usuario.id in equipo else proceso.abogado_id
        tarea = Tarea(
            usuario_id=responsable_id, proceso_id=datos.proceso_id, radicado_id=radicado_id, actuacion_id=actuacion_id,
            cliente_id=datos.cliente_id, titulo=datos.titulo, descripcion=datos.descripcion,
            prioridad=PrioridadTarea(datos.prioridad), fecha_limite=self._fin_del_dia(datos.fecha_limite),
        )
        self._db.add(tarea)
        self._db.flush()
        por_lanzar = recordatorios.crear_sistema(self._db, tarea)
        registrar_evento_auditoria(self._db, usuario, "tarea.crear", "tarea", tarea.id)
        self._db.commit()
        self._db.refresh(tarea)
        recordatorios.lanzar(self._db, tarea, por_lanzar)
        notificar_cambio(self._db, tarea, usuario, "creó una tarea asignada",
                         "Se creó una nueva actividad con la fecha, prioridad y contexto indicados.")
        return self.obtener(usuario, tarea.id)

    @staticmethod
    def _fin_del_dia(dia: date | None):
        if dia is None:
            return None
        if dia < _hoy():
            raise ErrorDominio("La fecha límite ya pasó.", codigo="fecha_pasada",
                               campos={"fecha_limite": "Elija hoy o una fecha futura."})
        return fin_del_dia_utc(dia)

    def editar(self, usuario: Usuario, tarea_id: int, datos: CambiosTarea) -> TareaDetalle:
        tarea, procesos = self._tarea(usuario, tarea_id)
        campos = datos.model_fields_set
        anterior_estado, anterior_fecha = tarea.estado, tarea.fecha_limite
        cambios: list[str] = []
        if "titulo" in campos and datos.titulo != tarea.titulo:
            tarea.titulo = datos.titulo
            cambios.append("título")
        if "descripcion" in campos and datos.descripcion != tarea.descripcion:
            tarea.descripcion = datos.descripcion
            cambios.append("notas")
        if "prioridad" in campos and datos.prioridad != tarea.prioridad.value:
            tarea.prioridad = PrioridadTarea(datos.prioridad)
            cambios.append(f"prioridad {texto_legible(datos.prioridad)}")
        if "estado" in campos and datos.estado != tarea.estado.value:
            tarea.estado = EstadoTarea(datos.estado)
            tarea.completada_en = utc_ahora() if tarea.estado == EstadoTarea.COMPLETADA else None
            cambios.append(f"estado «{texto_legible(datos.estado)}»")
        if "fecha_limite" in campos:
            nueva = None if datos.fecha_limite is None else fin_del_dia_utc(datos.fecha_limite)
            if nueva != tarea.fecha_limite:
                if datos.fecha_limite is not None and datos.fecha_limite < _hoy():
                    raise ErrorDominio("La fecha límite ya pasó.", codigo="fecha_pasada",
                                       campos={"fecha_limite": "Elija hoy o una fecha futura."})
                tarea.fecha_limite = nueva
                cambios.append("vencimiento actualizado desde "
                               + (format_colombia_datetime(anterior_fecha) if anterior_fecha else "sin fecha"))
        relacion = {"proceso_id", "radicado_id", "actuacion_id", "cliente_id"}
        if campos & relacion:
            proceso_id = datos.proceso_id if "proceso_id" in campos else tarea.proceso_id
            radicado_id = datos.radicado_id if "radicado_id" in campos else tarea.radicado_id
            actuacion_id = datos.actuacion_id if "actuacion_id" in campos else tarea.actuacion_id
            cliente_id = datos.cliente_id if "cliente_id" in campos else tarea.cliente_id
            if "radicado_id" in campos and "actuacion_id" not in campos and radicado_id != tarea.radicado_id:
                actuacion_id = None
            if proceso_id != tarea.proceso_id:
                # Lo que era del proceso anterior no sigue a la tarea si no se eligió de nuevo.
                radicados = self._repo.radicados_de(proceso_id) if proceso_id else set()
                clientes = self._repo.clientes_de(proceso_id) if proceso_id else set()
                if "radicado_id" not in campos and "actuacion_id" not in campos and radicado_id not in radicados:
                    radicado_id = actuacion_id = None
                if "cliente_id" not in campos and cliente_id not in clientes:
                    cliente_id = None
            radicado_id, actuacion_id = self._vinculos(procesos, proceso_id, radicado_id, actuacion_id, cliente_id)
            nuevos = (proceso_id, radicado_id, actuacion_id, cliente_id)
            if nuevos != (tarea.proceso_id, tarea.radicado_id, tarea.actuacion_id, tarea.cliente_id):
                tarea.proceso_id, tarea.radicado_id, tarea.actuacion_id, tarea.cliente_id = nuevos
                cambios.append("proceso, radicado o cliente")
        if not cambios:
            return self._detalle(tarea, procesos)
        self._db.flush()
        self._db.expire(tarea, ["proceso", "radicado", "actuacion_rel", "cliente_asignado"])
        por_lanzar = recordatorios.reprogramar(
            self._db, tarea, estado_anterior=anterior_estado,
            fecha_cambio=tarea.fecha_limite != anterior_fecha, estado_cambio=tarea.estado != anterior_estado,
        )
        registrar_evento_auditoria(self._db, usuario, "tarea.actualizar", "tarea", tarea.id)
        self._db.commit()
        recordatorios.lanzar(self._db, tarea, por_lanzar)
        self._db.refresh(tarea)
        notificar_cambio(self._db, tarea, usuario, "actualizó la tarea", "; ".join(cambios).capitalize() + ".")
        return self.obtener(usuario, tarea_id)

    def eliminar(self, usuario: Usuario, tarea_id: int) -> None:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        recordatorios.descartar(self._db, tarea)
        notificar_cambio(self._db, tarea, usuario, ELIMINO, "La tarea y sus recordatorios se eliminaron.")
        registrar_evento_auditoria(self._db, usuario, "tarea.eliminar", "tarea", tarea.id)
        self._db.delete(tarea)
        self._db.commit()

    # ---- Subtareas ------------------------------------------------------

    def _cliente_de_subtarea(self, tarea: Tarea, cliente_id: int | None) -> int | None:
        if cliente_id is None:
            return None
        if tarea.proceso_id is None or cliente_id not in self._repo.clientes_de(tarea.proceso_id):
            raise DatosInvalidos("Solo se le puede pedir a un cliente del proceso de la tarea.",
                                 campos={"cliente_id": "Elija un cliente del proceso."})
        return cliente_id

    def crear_subtarea(self, usuario: Usuario, tarea_id: int, datos: DatosSubtarea) -> TareaDetalle:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        cliente_id = self._cliente_de_subtarea(tarea, datos.cliente_id)
        subtarea = models.Subtarea(
            tarea_id=tarea.id, titulo=datos.titulo, orden=max((s.orden for s in tarea.subtareas), default=-1) + 1,
            proceso_id=tarea.proceso_id, radicado_id=tarea.radicado_id, actuacion_id=tarea.actuacion_id,
            asignada_cliente=cliente_id is not None, cliente_id=cliente_id,
            notificar_email=datos.avisar_correo, notificar_whatsapp=datos.avisar_whatsapp,
        )
        self._db.add(subtarea)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "subtarea.crear", "subtarea", subtarea.id)
        self._db.commit()
        notificar_subtarea_asignada(self._db, subtarea, usuario)
        return self.obtener(usuario, tarea_id)

    def _subtarea_de(self, tarea: Tarea, subtarea_id: int) -> models.Subtarea:
        subtarea = next((s for s in tarea.subtareas if s.id == subtarea_id), None)
        if subtarea is None:
            raise NoEncontrado("No encontramos esa subtarea.")
        return subtarea

    def editar_subtarea(self, usuario: Usuario, tarea_id: int, subtarea_id: int, datos: CambiosSubtarea) -> TareaDetalle:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        subtarea = self._subtarea_de(tarea, subtarea_id)
        campos = datos.model_fields_set
        antes = (subtarea.cliente_id if subtarea.asignada_cliente else None, subtarea.notificar_email, subtarea.notificar_whatsapp)
        if "titulo" in campos and datos.titulo:
            subtarea.titulo = datos.titulo
        if "completada" in campos and datos.completada is not None and datos.completada != subtarea.completada:
            subtarea.completada = datos.completada
            subtarea.completada_en = utc_ahora() if datos.completada else None
        if "orden" in campos and datos.orden is not None:
            subtarea.orden = datos.orden
        if "cliente_id" in campos:
            subtarea.cliente_id = self._cliente_de_subtarea(tarea, datos.cliente_id)
            subtarea.asignada_cliente = subtarea.cliente_id is not None
        if "avisar_correo" in campos and datos.avisar_correo is not None:
            subtarea.notificar_email = datos.avisar_correo
        if "avisar_whatsapp" in campos and datos.avisar_whatsapp is not None:
            subtarea.notificar_whatsapp = datos.avisar_whatsapp
        registrar_evento_auditoria(self._db, usuario, "subtarea.actualizar", "subtarea", subtarea.id)
        self._db.commit()
        despues = (subtarea.cliente_id if subtarea.asignada_cliente else None, subtarea.notificar_email, subtarea.notificar_whatsapp)
        # Se avisa al cliente si se le acaba de pedir o si se activó un canal que antes no tenía.
        if despues[0] and (despues[0] != antes[0] or (despues[1] and not antes[1]) or (despues[2] and not antes[2])):
            notificar_subtarea_asignada(self._db, subtarea, usuario)
        return self.obtener(usuario, tarea_id)

    def eliminar_subtarea(self, usuario: Usuario, tarea_id: int, subtarea_id: int) -> TareaDetalle:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        subtarea = self._subtarea_de(tarea, subtarea_id)
        registrar_evento_auditoria(self._db, usuario, "subtarea.eliminar", "subtarea", subtarea.id)
        tarea.subtareas.remove(subtarea)
        self._db.commit()
        return self.obtener(usuario, tarea_id)

    # ---- Recordatorios --------------------------------------------------

    def _abierta(self, tarea: Tarea) -> None:
        if tarea.estado in CERRADAS:
            raise Conflicto("La tarea ya está cerrada; reábrala para programar avisos.", codigo="tarea_cerrada")

    def _validar_programacion(self, tarea: Tarea, fecha_hora, anticipacion: int | None) -> None:
        if anticipacion is not None and tarea.fecha_limite is None:
            raise DatosInvalidos("Para avisar con anticipación, la tarea necesita fecha límite.",
                                 campos={"anticipacion_minutos": "Ponga primero una fecha límite."})
        if fecha_hora is not None and normalizar_utc_naive(fecha_hora) <= utc_ahora():
            raise DatosInvalidos("Ese momento ya pasó.", campos={"fecha_hora": "Elija un momento futuro."})

    def crear_recordatorio(self, usuario: Usuario, tarea_id: int, datos: DatosRecordatorio) -> TareaDetalle:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        self._abierta(tarea)
        self._validar_programacion(tarea, datos.fecha_hora, datos.anticipacion_minutos)
        if datos.whatsapp and not (tarea.usuario.whatsapp_numero or "").strip():
            raise DatosInvalidos(f"{tarea.usuario.nombre_completo} no tiene WhatsApp registrado.",
                                 campos={"whatsapp": "Use el correo o registre el número en el perfil."})
        recordatorio = models.RecordatorioTarea(
            tarea_id=tarea.id, canal=models.CanalRecordatorio.WHATSAPP, notificar_email=datos.correo,
            notificar_whatsapp=datos.whatsapp, activo=True, fecha_hora=normalizar_utc_naive(datos.fecha_hora),
            anticipacion_minutos=datos.anticipacion_minutos,
        )
        self._db.add(recordatorio)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "recordatorio.crear", "recordatorio_tarea", recordatorio.id)
        self._db.commit()
        recordatorios.lanzar(self._db, tarea, [recordatorio.id])
        return self.obtener(usuario, tarea_id)

    def _recordatorio_de(self, tarea: Tarea, recordatorio_id: int) -> models.RecordatorioTarea:
        recordatorio = next((r for r in tarea.recordatorios if r.id == recordatorio_id and not r.interno_sistema), None)
        if recordatorio is None:
            raise NoEncontrado("No encontramos ese recordatorio.")
        return recordatorio

    def editar_recordatorio(self, usuario: Usuario, tarea_id: int, recordatorio_id: int,
                            datos: CambiosRecordatorio) -> TareaDetalle:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        self._abierta(tarea)
        recordatorio = self._recordatorio_de(tarea, recordatorio_id)
        campos = datos.model_fields_set
        fecha_hora = normalizar_utc_naive(datos.fecha_hora) if "fecha_hora" in campos else recordatorio.fecha_hora
        anticipacion = datos.anticipacion_minutos if "anticipacion_minutos" in campos else recordatorio.anticipacion_minutos
        if "fecha_hora" in campos and datos.fecha_hora is not None and "anticipacion_minutos" not in campos:
            anticipacion = None
        if "anticipacion_minutos" in campos and datos.anticipacion_minutos is not None and "fecha_hora" not in campos:
            fecha_hora = None
        if (fecha_hora is None) == (anticipacion is None):
            raise DatosInvalidos("El recordatorio necesita un momento exacto o una anticipación, no las dos.")
        reprogramado = (fecha_hora, anticipacion) != (recordatorio.fecha_hora, recordatorio.anticipacion_minutos)
        if reprogramado:
            self._validar_programacion(tarea, fecha_hora, anticipacion)
            recordatorio.fecha_hora, recordatorio.anticipacion_minutos = fecha_hora, anticipacion
        if "activo" in campos and datos.activo is not None and datos.activo != recordatorio.activo:
            recordatorio.activo = datos.activo
            reprogramado = True
        if reprogramado:
            recordatorio.version += 1
        registrar_evento_auditoria(self._db, usuario, "recordatorio.actualizar", "recordatorio_tarea", recordatorio.id)
        self._db.commit()
        if reprogramado and recordatorio.activo and recordatorio.enviado_en is None:
            recordatorios.lanzar(self._db, tarea, [recordatorio.id])
        return self.obtener(usuario, tarea_id)

    def eliminar_recordatorio(self, usuario: Usuario, tarea_id: int, recordatorio_id: int) -> TareaDetalle:
        tarea, _procesos = self._tarea(usuario, tarea_id)
        recordatorio = self._recordatorio_de(tarea, recordatorio_id)
        registrar_evento_auditoria(self._db, usuario, "recordatorio.eliminar", "recordatorio_tarea", recordatorio.id)
        self._db.delete(recordatorio)
        self._db.commit()
        self._db.expire(tarea, ["recordatorios"])
        return self.obtener(usuario, tarea_id)


def _fecha(texto: str | None) -> date | None:
    momento = fecha_actuacion(texto)
    return momento.date() if momento else None


def _hoy():
    return a_colombia(utc_ahora()).date()


def _plural(n: int, singular: str, plural: str) -> str:
    return f"1 {singular}" if n == 1 else f"{n} {plural}"
