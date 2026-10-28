"""Busca procesos, clientes y tareas dentro de lo que el usuario puede ver.

La visibilidad sale de `expedientes.politicas`: un cliente solo encuentra lo
suyo y un abogado, los procesos de los que es responsable o colaborador.
"""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import models
from app.modulos.busqueda.esquemas import Resultado, Resultados
from app.modulos.expedientes import politicas
from app.modulos.expedientes.modelos import Proceso, ProcesoCliente
from app.modulos.expedientes.repositorio import FiltroProcesos, RepositorioProcesos
from app.modulos.identidad.modelos import RolUsuario, Usuario

POR_GRUPO = 6


def _area(usuario: Usuario) -> str:
    rol = RolUsuario(getattr(usuario.rol, "value", usuario.rol))
    return {RolUsuario.ADMIN: "admin", RolUsuario.CLIENTE: "cliente"}.get(rol, "abogado")


def _patron(texto: str) -> str:
    escapado = texto.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escapado}%"


class ServicioBusqueda:
    def __init__(self, db: Session, procesos: RepositorioProcesos):
        self._db = db
        self._procesos = procesos

    def buscar(self, usuario: Usuario, texto: str) -> Resultados:
        area = _area(usuario)
        visibles = politicas.filtro_procesos_visibles(usuario)
        items = self._buscar_procesos(visibles, texto, area)
        if area != "cliente":
            items += self._clientes(usuario, visibles, texto, area)
        items += self._tareas(usuario, visibles, texto, area)
        return Resultados(items=items)

    def _buscar_procesos(self, visibles, texto: str, area: str) -> list[Resultado]:
        procesos, _total = self._procesos.listar(visibles, FiltroProcesos(texto=texto), limite=POR_GRUPO)
        resultados = []
        for proceso in procesos:
            radicados = sorted(v.radicado.numero for v in proceso.radicados if v.radicado)
            clientes = ", ".join(v.cliente.nombre_completo for v in proceso.clientes if v.cliente)
            resultados.append(Resultado(
                tipo="proceso",
                id=proceso.id,
                titulo=proceso.nombre,
                detalle=clientes or (proceso.abogado.nombre_completo if proceso.abogado else None),
                radicado=radicados[0] if radicados else None,
                href=f"/gestion-procesos/{area}/procesos/{proceso.id}",
            ))
        return resultados

    def _clientes(self, usuario: Usuario, visibles, texto: str, area: str) -> list[Resultado]:
        patron = _patron(texto)
        vinculados = select(ProcesoCliente.cliente_id).join(Proceso, Proceso.id == ProcesoCliente.proceso_id).where(visibles)
        # Un abogado también encuentra los clientes que creó aunque aún no tengan proceso.
        alcance = models.Usuario.id.in_(vinculados)
        if area == "abogado":
            alcance = or_(alcance, models.Usuario.creado_por_abogado_id == usuario.id)
        consulta = (
            select(models.Usuario)
            .where(
                models.Usuario.rol == models.RolUsuario.CLIENTE,
                alcance,
                or_(
                    func.lower(models.Usuario.nombre_completo).like(patron, escape="\\"),
                    func.lower(models.Usuario.email).like(patron, escape="\\"),
                    func.lower(func.coalesce(models.Usuario.numero_documento, "")).like(patron, escape="\\"),
                ),
            )
            .order_by(models.Usuario.nombre_completo)
            .limit(POR_GRUPO)
        )
        ruta = "usuarios" if area == "admin" else "clientes"
        return [
            Resultado(tipo="cliente", id=c.id, titulo=c.nombre_completo, detalle=c.numero_documento or c.email,
                      href=f"/gestion-procesos/{area}/{ruta}/{c.id}")
            for c in self._db.scalars(consulta)
        ]

    def _tareas(self, usuario: Usuario, visibles, texto: str, area: str) -> list[Resultado]:
        patron = _patron(texto)
        procesos_visibles = select(Proceso.id).where(visibles)
        consulta = select(models.Tarea).where(
            models.Tarea.estado != models.EstadoTarea.CANCELADA,
            func.lower(models.Tarea.titulo).like(patron, escape="\\"),
        )
        if area == "cliente":
            consulta = consulta.where(models.Tarea.cliente_id == usuario.id, models.Tarea.proceso_id.in_(procesos_visibles))
        elif area == "abogado":
            consulta = consulta.where(or_(models.Tarea.proceso_id.in_(procesos_visibles), models.Tarea.usuario_id == usuario.id))
        tareas = self._db.scalars(consulta.order_by(models.Tarea.updated_at.desc()).limit(POR_GRUPO)).all()
        return [
            Resultado(
                tipo="tarea",
                id=t.id,
                titulo=t.titulo,
                detalle=t.proceso.nombre if t.proceso else None,
                href=f"/gestion-procesos/abogado/tareas/{t.id}" if area == "abogado" else f"/gestion-procesos/{area}/tareas",
            )
            for t in tareas
        ]
