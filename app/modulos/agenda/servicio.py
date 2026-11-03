"""Agenda del equipo: audiencias, reuniones y vencimientos de tareas en un solo listado,
y el enlace .ics para verla en Google Calendar u Outlook.

El enlace lleva un token aleatorio; la base guarda solo su SHA-256. Quien lo tenga
puede leer la agenda (no cambiarla), así que se puede renovar o desactivar.
"""

import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app import models
from app.modulos.agenda.avisos import notificar_evento
from app.modulos.agenda.esquemas import (
    Agenda,
    CambiosEvento,
    DatosEvento,
    ElementoAgenda,
    EnlaceSuscripcion,
    EventoDelProceso,
    EventosDelProceso,
    PersonaBreve,
    Suscripcion,
)
from app.modulos.agenda.ics import EventoIcs, calendario
from app.modulos.agenda.modelos import SuscripcionCalendario
from app.modulos.agenda.repositorio import RepositorioAgenda
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import EstadoUsuario, Usuario
from app.modulos.expedientes.repositorio import RepositorioProcesos
from app.nucleo.errores import Conflicto, DatosInvalidos, NoAutenticado, NoEncontrado, SinPermiso
from app.nucleo.zona_horaria import a_colombia, inicio_del_dia_utc
from app.timezone import utc_ahora
from app.workflow_service import user_portal_url

BASE = "/gestion-procesos/abogado"
BASE_CLIENTE = "/gestion-procesos/cliente"
RUTA_FEED = "/api/v2/agenda/feed.ics"
MAXIMO_DIAS = 62
ETIQUETAS = {"AUDIENCIA": "Audiencia", "REUNION": "Reunión", "FIRMA_CONTRATO": "Firma de contrato", "EVENTO": "Evento"}
MAXIMO_DIAS_CLIENTE = 200
SOLO_FIRMA = "La agenda del equipo es para la firma."
# El feed cubre lo reciente y lo que viene: los calendarios lo vuelven a leer cada hora.
FEED_ATRAS = timedelta(days=60)
FEED_ADELANTE = timedelta(days=365)


def _utc(momento: datetime | None) -> datetime | None:
    """La base guarda la hora en UTC sin zona."""
    if momento is None:
        return None
    return momento.astimezone(timezone.utc).replace(tzinfo=None)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class ServicioAgenda:
    def __init__(self, db: Session, repositorio: RepositorioAgenda):
        self._db = db
        self._repo = repositorio

    def _procesos(self, usuario: Usuario) -> dict[int, str]:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_FIRMA)
        return self._repo.procesos_activos(politicas.filtro_procesos_visibles(usuario))

    def agenda(self, usuario: Usuario, desde: date, hasta: date) -> Agenda:
        if hasta < desde:
            raise DatosInvalidos("La fecha final va después de la inicial.", campos={"hasta": "Va después de «desde»."})
        if (hasta - desde).days > MAXIMO_DIAS:
            raise DatosInvalidos(f"Consulta como máximo {MAXIMO_DIAS} días.", campos={"hasta": "El rango es muy largo."})
        procesos = self._procesos(usuario)
        items = self._elementos(usuario, procesos, inicio_del_dia_utc(desde), inicio_del_dia_utc(hasta + timedelta(days=1)))
        return Agenda(desde=desde, hasta=hasta, items=items)

    def _elementos(self, usuario: Usuario, procesos: dict[int, str], desde: datetime, hasta: datetime) -> list[ElementoAgenda]:
        ahora = utc_ahora()

        def proceso(proceso_id: int | None) -> ProcesoBreve | None:
            return ProcesoBreve(id=proceso_id, nombre=procesos[proceso_id]) if proceso_id in procesos else None

        items: list[ElementoAgenda] = []
        for evento in self._repo.eventos(list(procesos), desde, hasta):
            items.append(ElementoAgenda(
                clave=f"evento:{evento.id}", tipo="evento", etiqueta=ETIQUETAS.get(evento.tipo, "Evento"),
                titulo=evento.titulo, detalle=evento.descripcion, inicio=evento.fecha_inicio, fin=evento.fecha_fin,
                todo_el_dia=False, estado=evento.estado, proceso=proceso(evento.proceso_id),
                responsable=evento.responsable.nombre_completo if evento.responsable else None,
                enlace=f"{BASE}/procesos/{evento.proceso_id}/agenda",
            ))
        for tarea in self._repo.tareas(list(procesos), usuario.id, desde, hasta):
            items.append(ElementoAgenda(
                clave=f"tarea:{tarea.id}", tipo="tarea", etiqueta="Vence tarea", titulo=tarea.titulo,
                detalle=tarea.descripcion, inicio=tarea.fecha_limite, todo_el_dia=True,
                estado=tarea.estado.value, vencida=tarea.fecha_limite < ahora, proceso=proceso(tarea.proceso_id),
                responsable=tarea.usuario.nombre_completo if tarea.usuario else None,
                enlace=f"{BASE}/tareas/{tarea.id}",
            ))
        items.sort(key=lambda item: item.inicio)
        return items

    def agenda_cliente(self, usuario: Usuario, desde: date, hasta: date) -> Agenda:
        """Lo que el cliente tiene en sus procesos: audiencias, reuniones y firmas, y lo que la firma le pidió."""
        if not politicas.es_cliente(usuario):
            raise SinPermiso("Esta es la agenda del portal del cliente.")
        if hasta < desde:
            raise DatosInvalidos("La fecha final va después de la inicial.", campos={"hasta": "Va después de «desde»."})
        if (hasta - desde).days > MAXIMO_DIAS_CLIENTE:
            raise DatosInvalidos(f"Consulte como máximo {MAXIMO_DIAS_CLIENTE} días.", campos={"hasta": "El rango es muy largo."})
        inicio, fin, ahora = inicio_del_dia_utc(desde), inicio_del_dia_utc(hasta + timedelta(days=1)), utc_ahora()
        items = [
            ElementoAgenda(
                clave=f"evento:{e.id}", tipo="evento", etiqueta=ETIQUETAS.get(e.tipo, "Evento"), titulo=e.titulo,
                detalle=e.descripcion, inicio=e.fecha_inicio, fin=e.fecha_fin, todo_el_dia=False, estado=e.estado,
                proceso=ProcesoBreve(id=e.proceso_id, nombre=e.proceso.nombre),
                responsable=e.responsable.nombre_completo if e.responsable else None,
                enlace=f"{BASE_CLIENTE}/procesos/{e.proceso_id}",
            )
            for e in self._repo.eventos_cliente(usuario.id, inicio, fin)
        ] + [
            ElementoAgenda(
                clave=f"tarea:{t.id}", tipo="tarea", etiqueta="Vence", titulo=t.titulo, detalle=t.descripcion,
                inicio=t.fecha_limite, todo_el_dia=True, estado=t.estado.value, vencida=t.fecha_limite < ahora,
                proceso=ProcesoBreve(id=t.proceso_id, nombre=t.proceso.nombre),
                enlace=f"{BASE_CLIENTE}/pendientes#tarea-{t.id}",
            )
            for t in self._repo.tareas_cliente(usuario.id, inicio, fin)
        ]
        items.sort(key=lambda item: item.inicio)
        return Agenda(desde=desde, hasta=hasta, items=items)

    # ---- Eventos de un proceso --------------------------------------------

    def _proceso(self, usuario: Usuario, proceso_id: int, *, para_cambiar: bool = False) -> models.Proceso:
        if politicas.es_cliente(usuario):
            raise SinPermiso(SOLO_FIRMA)
        proceso = RepositorioProcesos(self._db).obtener(proceso_id, politicas.filtro_procesos_visibles(usuario))
        if proceso is None:
            raise NoEncontrado("No encontramos el proceso, o no tiene acceso a él.")
        if para_cambiar and proceso.archivado_en is not None:
            raise Conflicto("Reabra el proceso para cambiar su agenda.", codigo="proceso_archivado")
        return proceso

    @staticmethod
    def _cliente(proceso: models.Proceso, cliente_id: int | None) -> models.Usuario | None:
        if cliente_id is None:
            return None
        cliente = next((v.cliente for v in proceso.clientes if v.cliente_id == cliente_id and v.cliente), None)
        if cliente is None:
            raise DatosInvalidos("Elija un cliente del proceso.", campos={"cliente_id": "No está vinculado al proceso."})
        return cliente

    @staticmethod
    def _vista(evento: models.EventoAgenda) -> EventoDelProceso:
        return EventoDelProceso(
            id=evento.id, tipo=evento.tipo, etiqueta=ETIQUETAS.get(evento.tipo, "Evento"), titulo=evento.titulo,
            descripcion=evento.descripcion, inicio=evento.fecha_inicio, fin=evento.fecha_fin, estado=evento.estado,
            proceso=ProcesoBreve(id=evento.proceso.id, nombre=evento.proceso.nombre),
            responsable=PersonaBreve(id=evento.responsable.id, nombre=evento.responsable.nombre_completo) if evento.responsable else None,
            cliente=PersonaBreve(id=evento.cliente.id, nombre=evento.cliente.nombre_completo) if evento.cliente else None,
            contrato_id=evento.contrato_id,
        )

    def eventos_de_proceso(self, usuario: Usuario, proceso_id: int) -> EventosDelProceso:
        self._proceso(usuario, proceso_id)
        ahora = utc_ahora()
        eventos = self._repo.eventos_de_proceso(proceso_id)
        proximos = [e for e in eventos if e.fecha_inicio >= ahora]
        pasados = sorted((e for e in eventos if e.fecha_inicio < ahora), key=lambda e: e.fecha_inicio, reverse=True)
        return EventosDelProceso(items=[self._vista(e) for e in proximos + pasados])

    def _evento(self, usuario: Usuario, evento_id: int) -> tuple[models.EventoAgenda, models.Proceso]:
        evento = self._repo.evento(evento_id)
        if evento is None or evento.proceso_id is None:
            raise NoEncontrado("No encontramos ese evento.")
        return evento, self._proceso(usuario, evento.proceso_id, para_cambiar=True)

    def crear_evento(self, usuario: Usuario, datos: DatosEvento) -> EventoDelProceso:
        proceso = self._proceso(usuario, datos.proceso_id, para_cambiar=True)
        cliente = self._cliente(proceso, datos.cliente_id)
        evento = models.EventoAgenda(
            titulo=datos.titulo, descripcion=datos.descripcion, tipo=datos.tipo, estado="PROGRAMADO",
            fecha_inicio=_utc(datos.inicio), fecha_fin=_utc(datos.fin), responsable_id=usuario.id,
            proceso_id=proceso.id, cliente_id=cliente.id if cliente else None, creado_por_id=usuario.id,
        )
        self._db.add(evento)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "proceso.evento_agenda.crear", "proceso", proceso.id)
        self._db.commit()
        self._db.refresh(evento)
        notificar_evento(self._db, proceso, evento, usuario, "programó", cliente)
        return self._vista(evento)

    def editar_evento(self, usuario: Usuario, evento_id: int, datos: CambiosEvento) -> EventoDelProceso:
        evento, proceso = self._evento(usuario, evento_id)
        cambios = datos.model_dump(exclude_unset=True)
        firma = evento.tipo == "FIRMA_CONTRATO"
        if firma and ("tipo" in cambios or "cliente_id" in cambios):
            raise Conflicto("El tipo y el cliente de una firma se cambian desde el contrato.", codigo="evento_de_firma")
        cliente_anterior = evento.cliente
        if "cliente_id" in cambios:
            cliente = self._cliente(proceso, cambios["cliente_id"])
            evento.cliente_id = cliente.id if cliente else None
        inicio = _utc(cambios["inicio"]) if "inicio" in cambios else evento.fecha_inicio
        fin = _utc(cambios["fin"]) if "fin" in cambios else evento.fecha_fin
        if fin is not None and fin <= inicio:
            raise DatosInvalidos("La hora final va después del inicio.", campos={"fin": "Va después del inicio."})
        evento.fecha_inicio, evento.fecha_fin = inicio, fin
        for campo in ("tipo", "titulo", "descripcion", "estado"):
            if campo in cambios:
                setattr(evento, campo, cambios[campo])
        registrar_evento_auditoria(self._db, usuario, "proceso.evento_agenda.actualizar", "proceso", proceso.id)
        self._db.commit()
        self._db.refresh(evento)
        accion = "canceló" if cambios.get("estado") == "CANCELADO" else "actualizó"
        notificar_evento(self._db, proceso, evento, usuario, accion, evento.cliente or cliente_anterior)
        return self._vista(evento)

    def eliminar_evento(self, usuario: Usuario, evento_id: int) -> None:
        evento, proceso = self._evento(usuario, evento_id)
        if evento.contrato_id is not None:
            raise Conflicto("Las firmas de contrato se cancelan desde el contrato.", codigo="evento_de_firma")
        if evento.estado == "PROGRAMADO" and evento.fecha_inicio >= utc_ahora():
            notificar_evento(self._db, proceso, evento, usuario, "canceló", evento.cliente)
        registrar_evento_auditoria(self._db, usuario, "proceso.evento_agenda.eliminar", "proceso", proceso.id)
        self._db.delete(evento)
        self._db.commit()

    # ---- Suscripción ----------------------------------------------------

    def suscripcion(self, usuario: Usuario) -> Suscripcion:
        self._procesos(usuario)
        actual = self._repo.suscripcion(usuario.id)
        if actual is None:
            return Suscripcion(activa=False)
        return Suscripcion(activa=True, creada_en=actual.created_at, ultimo_uso=actual.ultimo_uso)

    def crear_suscripcion(self, usuario: Usuario) -> EnlaceSuscripcion:
        """Crea el enlace o lo reemplaza: el anterior deja de funcionar."""
        self._procesos(usuario)
        token = secrets.token_urlsafe(32)
        actual = self._repo.suscripcion(usuario.id)
        if actual is None:
            actual = SuscripcionCalendario(usuario_id=usuario.id, token_hash=_hash(token))
            self._db.add(actual)
            accion = "agenda.suscripcion.crear"
        else:
            actual.token_hash = _hash(token)
            actual.created_at = utc_ahora()
            actual.ultimo_uso = None
            accion = "agenda.suscripcion.renovar"
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, accion, "usuario", usuario.id)
        self._db.commit()
        return EnlaceSuscripcion(ruta=f"{RUTA_FEED}?token={token}", creada_en=actual.created_at)

    def eliminar_suscripcion(self, usuario: Usuario) -> None:
        self._procesos(usuario)
        actual = self._repo.suscripcion(usuario.id)
        if actual is not None:
            registrar_evento_auditoria(self._db, usuario, "agenda.suscripcion.eliminar", "usuario", usuario.id)
            self._db.delete(actual)
            self._db.commit()

    def feed(self, token: str) -> str:
        suscripcion = self._repo.suscripcion_por_hash(_hash(token)) if token else None
        usuario = self._db.get(Usuario, suscripcion.usuario_id) if suscripcion else None
        if usuario is None or usuario.estado != EstadoUsuario.ACTIVO or politicas.es_cliente(usuario):
            raise NoAutenticado("El enlace del calendario no es válido. Genera uno nuevo desde la agenda.", codigo="enlace_invalido")
        ahora = utc_ahora()
        # Una escritura por hora como mucho: los calendarios consultan seguido.
        if suscripcion.ultimo_uso is None or ahora - suscripcion.ultimo_uso > timedelta(hours=1):
            suscripcion.ultimo_uso = ahora
            self._db.commit()
        procesos = self._repo.procesos_activos(politicas.filtro_procesos_visibles(usuario))
        eventos = []
        for item in self._elementos(usuario, procesos, ahora - FEED_ATRAS, ahora + FEED_ADELANTE):
            if item.estado == "CANCELADO":
                continue
            partes = [p for p in (item.proceso.nombre if item.proceso else None, item.detalle) if p]
            eventos.append(EventoIcs(
                uid=f"{item.clave.replace(':', '-')}@alejandramunozabogada",
                titulo=f"{item.etiqueta}: {item.titulo}" if item.tipo == "evento" else f"Vence: {item.titulo}",
                inicio=a_colombia(item.inicio).date() if item.todo_el_dia else item.inicio,
                fin=item.fin, descripcion="\n\n".join(partes) or None,
                url=user_portal_url(usuario, item.enlace),
            ))
        return calendario("Agenda · Alejandra Muñoz Abogada", eventos, ahora)
