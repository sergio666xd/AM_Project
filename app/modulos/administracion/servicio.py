"""Resumen de la administración: lo que pide atención, el estado de las integraciones y la actividad.

Las alertas no se guardan: se calculan de lo que ya está en la base (consultas
y envíos fallidos, solicitudes, cuentas sin estrenar). Desaparecen solas cuando
el problema se resuelve. Descartar una solo la oculta, con registro en la
auditoría; si el problema cambia (otro envío falla), su `id` cambia y vuelve.
"""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.message_templates import radicado_legible
from app.modulos.administracion import actividad, salud
from app.modulos.administracion.esquemas import Alerta, CifraFirma, EventoActividad, ListaAlertas, ResumenAdmin
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.administracion.repositorio import RepositorioAdministracion
from app.modulos.finanzas.repositorio import RepositorioFinanzas
from app.modulos.finanzas.servicio import ServicioFinanzas
from app.modulos.identidad.modelos import Usuario
from app.nucleo.errores import NoEncontrado
from app.timezone import utc_ahora

ADMIN = "/gestion-procesos/admin"
VENTANA_ENTREGAS = timedelta(days=30)
SIN_INGRESO_TRAS = timedelta(days=7)
CANALES = {"EMAIL": "por correo", "WHATSAPP": "por WhatsApp", "PUSH": "en el navegador"}
# Decisiones que ocultan una alerta. `atender` y `eliminar` vienen de la consola anterior.
OCULTAN = {"admin.alerta.descartar", "admin.alerta.atender", "admin.alerta.eliminar"}


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def eventos(filas) -> list[EventoActividad]:
    return [
        EventoActividad(
            id=evento.id, actor=nombre, actor_id=evento.actor_id, frase=actividad.frase(evento.accion),
            enlace=actividad.enlace(evento.tipo_recurso, evento.recurso_id), fecha=evento.created_at,
        )
        for evento, nombre in filas
    ]


class ServicioAdministracion:
    def __init__(self, db: Session, repositorio: RepositorioAdministracion):
        self._db = db
        self._repo = repositorio

    def _alertas(self) -> list[Alerta]:
        ahora = utc_ahora()
        decisiones = self._repo.disposiciones()
        alertas: list[dict] = []

        for consulta, numero, proceso in self._repo.consultas_fallidas():
            alertas.append({
                "id": f"consulta:{consulta.id}", "tipo": "consulta_fallida", "gravedad": "alta",
                "titulo": f"No se pudo consultar el radicado {radicado_legible(numero)}",
                "detalle": f"{proceso}. {(consulta.error or '').strip()[:200]}".strip(),
                "enlace": f"{ADMIN}/operacion/consultas", "accion": "Ver consultas",
                "fecha": consulta.finalizacion or consulta.inicio,
            })
        for canal, total, ultima_id, error, cuando in self._repo.entregas_fallidas(ahora - VENTANA_ENTREGAS):
            alertas.append({
                "id": f"entregas:{canal}:{ultima_id}", "tipo": "entrega_fallida", "gravedad": "alta",
                "titulo": f"{_plural(total, 'aviso', 'avisos')} {CANALES.get(canal, canal.lower())} no "
                          f"{'llegó' if total == 1 else 'llegaron'} tras tres intentos",
                "detalle": (error or "").strip()[:200] or None,
                "enlace": f"{ADMIN}/operacion/notificaciones", "accion": "Ver envíos", "fecha": cuando,
            })
        for solicitud, nombre in self._repo.solicitudes_perfil():
            alertas.append({
                "id": f"perfil:{solicitud.id}", "tipo": "solicitud_perfil", "gravedad": "media",
                "titulo": f"{nombre} pidió corregir sus datos", "detalle": None,
                "enlace": f"{ADMIN}/solicitudes-perfil", "accion": "Revisar", "fecha": solicitud.solicitada_en,
            })
        sin_ingreso = self._repo.sin_ingreso(ahora - SIN_INGRESO_TRAS)
        if sin_ingreso:
            n = len(sin_ingreso)
            nombres = ", ".join(u.nombre_completo for u in sin_ingreso[:3]) + (f" y {n - 3} más" if n > 3 else "")
            grupo = "clientes" if any(getattr(u.rol, "value", u.rol) == "CLIENTE" for u in sin_ingreso) else "equipo"
            alertas.append({
                "id": f"sin_ingreso:{sin_ingreso[-1].id}-{n}", "tipo": "sin_ingreso", "gravedad": "media",
                "titulo": f"{_plural(n, 'cuenta no ha', 'cuentas no han')} entrado en más de una semana",
                "detalle": f"{nombres}. Puede {'reenviarle' if n == 1 else 'reenviarles'} el acceso.",
                "enlace": f"{ADMIN}/usuarios?grupo={grupo}&acceso=sin_ingreso", "accion": "Ver cuentas",
                "fecha": max(u.created_at for u in sin_ingreso if u.created_at) if any(u.created_at for u in sin_ingreso) else None,
            })

        orden = {"alta": 0, "media": 1}
        alertas.sort(key=lambda a: (orden[a["gravedad"]], -(a["fecha"].timestamp() if a["fecha"] else 0)))
        return [Alerta(**a, descartada=decisiones.get(a["id"]) in OCULTAN) for a in alertas]

    def _cifras(self, usuario: Usuario) -> list[CifraFirma]:
        procesos = self._repo.procesos_activos()
        tareas = self._repo.tareas_vencidas(utc_ahora())
        documentos = self._repo.documentos_por_revisar()
        cobros = ServicioFinanzas(self._db, RepositorioFinanzas(self._db)).listar(usuario, "vencidas").resumen.cuentas_vencidas
        return [
            CifraFirma(clave="procesos_activos", cantidad=procesos, atencion=False, enlace=f"{ADMIN}/procesos",
                       texto=_plural(procesos, "proceso activo", "procesos activos")),
            CifraFirma(clave="tareas_vencidas", cantidad=tareas, atencion=tareas > 0, enlace=f"{ADMIN}/tareas",
                       texto=_plural(tareas, "tarea vencida", "tareas vencidas") if tareas else "Ninguna tarea vencida"),
            CifraFirma(clave="documentos_por_revisar", cantidad=documentos, atencion=documentos > 0, enlace=f"{ADMIN}/documentos",
                       texto=_plural(documentos, "documento por revisar", "documentos por revisar") if documentos else "Ningún documento por revisar"),
            CifraFirma(clave="cuentas_vencidas", cantidad=cobros, atencion=cobros > 0, enlace=f"{ADMIN}/cobros",
                       texto=_plural(cobros, "cuenta de cobro vencida", "cuentas de cobro vencidas") if cobros else "Ninguna cuenta de cobro vencida"),
        ]

    def resumen(self, usuario: Usuario) -> ResumenAdmin:
        exigir_admin(usuario)
        alertas = self._alertas()
        return ResumenAdmin(
            alertas=[a for a in alertas if not a.descartada],
            alertas_descartadas=sum(a.descartada for a in alertas),
            integraciones=salud.estado_integraciones(self._db),
            firma=self._cifras(usuario),
            actividad=eventos(self._repo.actividad()),
        )

    def alertas(self, usuario: Usuario, *, descartadas: bool) -> ListaAlertas:
        exigir_admin(usuario)
        alertas = self._alertas()
        return ListaAlertas(items=[a for a in alertas if a.descartada == descartadas], descartadas=sum(a.descartada for a in alertas))

    def decidir(self, usuario: Usuario, alerta_id: str, *, descartar: bool) -> ListaAlertas:
        exigir_admin(usuario)
        if alerta_id not in {a.id for a in self._alertas()}:
            raise NoEncontrado("Esa alerta ya no está vigente.", codigo="alerta_no_vigente")
        registrar_evento_auditoria(self._db, usuario, "admin.alerta.descartar" if descartar else "admin.alerta.restaurar", "alerta", alerta_id)
        self._db.commit()
        return self.alertas(usuario, descartadas=not descartar)
