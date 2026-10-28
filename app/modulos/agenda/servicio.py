"""Agenda del equipo: audiencias, reuniones y vencimientos de tareas en un solo listado,
y el enlace .ics para verla en Google Calendar u Outlook.

El enlace lleva un token aleatorio; la base guarda solo su SHA-256. Quien lo tenga
puede leer la agenda (no cambiarla), así que se puede renovar o desactivar.
"""

import hashlib
import secrets
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.modulos.agenda.esquemas import Agenda, ElementoAgenda, EnlaceSuscripcion, Suscripcion
from app.modulos.agenda.ics import EventoIcs, calendario
from app.modulos.agenda.modelos import SuscripcionCalendario
from app.modulos.agenda.repositorio import RepositorioAgenda
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import EstadoUsuario, Usuario
from app.nucleo.errores import DatosInvalidos, NoAutenticado, SinPermiso
from app.nucleo.zona_horaria import a_colombia, inicio_del_dia_utc
from app.timezone import utc_ahora
from app.workflow_service import user_portal_url

BASE = "/gestion-procesos/abogado"
RUTA_FEED = "/api/v2/agenda/feed.ics"
MAXIMO_DIAS = 62
ETIQUETAS = {"AUDIENCIA": "Audiencia", "REUNION": "Reunión", "FIRMA_CONTRATO": "Firma de contrato", "EVENTO": "Evento"}
SOLO_FIRMA = "La agenda del equipo es para la firma."
# El feed cubre lo reciente y lo que viene: los calendarios lo vuelven a leer cada hora.
FEED_ATRAS = timedelta(days=60)
FEED_ADELANTE = timedelta(days=365)


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
