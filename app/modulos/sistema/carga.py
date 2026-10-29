"""Carga de trabajo del equipo: procesos activos y tareas abiertas por persona."""

from datetime import timedelta

from app import models
from app.modulos.administracion.esquemas import PersonaBreve
from app.modulos.expedientes.politicas import _rol
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.modulos.sistema.esquemas import CargaPersona, PanelCarga
from app.modulos.sistema.repositorio import RepositorioSistema
from app.nucleo.errores import SinPermiso
from app.timezone import utc_ahora

PUEDEN_VER = {RolUsuario.ADMIN.value, RolUsuario.ABOGADO_ADMIN.value}


class ServicioCarga:
    def __init__(self, repositorio: RepositorioSistema):
        self._repo = repositorio

    def panel(self, usuario: Usuario) -> PanelCarga:
        if _rol(usuario) not in PUEDEN_VER:
            raise SinPermiso("Solo la administración y la abogada directora ven la carga del equipo.")
        ahora = utc_ahora()
        procesos = self._repo.procesos_por_responsable()
        tareas = self._repo.tareas_por_responsable(ahora, ahora + timedelta(days=7))
        personas = []
        for persona in self._repo.personas_de_carga(set(procesos) | set(tareas)):
            abiertas, vencidas, proximas = tareas.get(persona.id, (0, 0, 0))
            personas.append(CargaPersona(
                persona=PersonaBreve(id=persona.id, nombre=persona.nombre_completo),
                activa=persona.estado == models.EstadoUsuario.ACTIVO,
                procesos=procesos.get(persona.id, 0), tareas_abiertas=abiertas, vencidas=vencidas, proximas=proximas,
            ))
        personas.sort(key=lambda c: (-c.vencidas, -c.tareas_abiertas, -c.procesos, c.persona.nombre.lower()))
        return PanelCarga(
            personas=personas,
            procesos=sum(c.procesos for c in personas),
            tareas_abiertas=sum(c.tareas_abiertas for c in personas),
            vencidas=sum(c.vencidas for c in personas),
            proximas=sum(c.proximas for c in personas),
        )
