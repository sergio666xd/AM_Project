"""Lo urgente del día en una sola llamada: tareas, agenda y documentos por revisar.

Los folios nuevos (actuaciones de la Rama Judicial, entregas del cliente) tienen
su propia ruta, `/folios/nuevos`, porque traen sus acciones.
"""

from datetime import datetime, time, timedelta, timezone

from app.modulos.bandeja.esquemas import Bandeja, Pendiente, ProcesoBreve, ResumenBandeja
from app.modulos.bandeja.repositorio import RepositorioBandeja
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import Usuario
from app.nucleo.errores import SinPermiso
from app.nucleo.zona_horaria import a_colombia
from app.timezone import COLOMBIA, utc_ahora

BASE = "/gestion-procesos/abogado"
MAXIMO = 20
TIPOS_EVENTO = {"AUDIENCIA": "Audiencia", "REUNION": "Reunión", "FIRMA_CONTRATO": "Firma de contrato", "EVENTO": "Evento"}
ORDEN_URGENCIA = {"vencida": 0, "hoy": 1, "por_revisar": 2, "pronto": 3}


def _fin_de_hoy_utc(ahora: datetime) -> datetime:
    """Último instante del día de hoy en Colombia, como UTC sin zona (como guarda la base)."""
    fin = datetime.combine(a_colombia(ahora).date(), time.max, COLOMBIA)
    return fin.astimezone(timezone.utc).replace(tzinfo=None)


class ServicioBandeja:
    def __init__(self, repositorio: RepositorioBandeja):
        self._repo = repositorio

    def bandeja(self, usuario: Usuario) -> Bandeja:
        if politicas.es_cliente(usuario):
            raise SinPermiso("La bandeja «Hoy» es para el equipo de la firma.")
        procesos = self._repo.procesos_activos(politicas.filtro_procesos_visibles(usuario))
        ids = list(procesos)
        ahora = utc_ahora()
        fin_de_hoy = _fin_de_hoy_utc(ahora)
        en_una_semana = ahora + timedelta(days=7)

        def proceso(proceso_id: int | None) -> ProcesoBreve | None:
            return ProcesoBreve(id=proceso_id, nombre=procesos[proceso_id]) if proceso_id in procesos else None

        pendientes: list[Pendiente] = []
        vencidas = semana = 0
        for tarea in self._repo.tareas_hasta(ids, usuario.id, en_una_semana):
            urgencia = "vencida" if tarea.fecha_limite < ahora else "hoy" if tarea.fecha_limite <= fin_de_hoy else "pronto"
            vencidas += urgencia == "vencida"
            semana += urgencia != "vencida"
            pendientes.append(Pendiente(
                clave=f"tarea:{tarea.id}", tipo="tarea", urgencia=urgencia, titulo=tarea.titulo,
                detalle="Tarea vencida" if urgencia == "vencida" else "Vence hoy" if urgencia == "hoy" else "Vence pronto",
                fecha=tarea.fecha_limite, proceso=proceso(tarea.proceso_id),
                enlace=f"{BASE}/procesos/{tarea.proceso_id}/tareas" if tarea.proceso_id else f"{BASE}/tareas",
            ))

        agenda: list[Pendiente] = []
        for evento in self._repo.eventos_entre(ids, ahora, en_una_semana):
            semana += 1
            urgencia = "hoy" if evento.fecha_inicio <= fin_de_hoy else "pronto"
            item = Pendiente(
                clave=f"evento:{evento.id}", tipo="evento", urgencia=urgencia, titulo=evento.titulo,
                detalle=TIPOS_EVENTO.get(evento.tipo, "Evento"), fecha=evento.fecha_inicio, proceso=proceso(evento.proceso_id),
                enlace=f"{BASE}/procesos/{evento.proceso_id}/agenda",
            )
            agenda.append(item)
            if urgencia == "hoy":
                pendientes.append(item)

        documentos, por_revisar = self._repo.documentos_sin_revisar(ids, MAXIMO)
        for documento, cliente in documentos:
            pendientes.append(Pendiente(
                clave=f"documento:{documento.id}", tipo="documento", urgencia="por_revisar", titulo=documento.nombre_archivo,
                detalle=f"Lo entregó {cliente}" if cliente else "Entregado por el cliente",
                fecha=documento.created_at, proceso=proceso(documento.proceso_id),
                enlace=f"{BASE}/documentos?documento={documento.id}",
            ))

        pendientes.sort(key=lambda p: (ORDEN_URGENCIA[p.urgencia], p.fecha or ahora))
        return Bandeja(
            resumen=ResumenBandeja(
                procesos_activos=len(procesos), tareas_vencidas=vencidas, vencen_esta_semana=semana,
                documentos_por_revisar=por_revisar,
            ),
            pendientes=pendientes[:MAXIMO],
            agenda=agenda[:MAXIMO],
        )
