"""Cuentas de la plataforma vistas por la administración.

Acceso: como con los clientes que crea el abogado, la administración no
inventa contraseñas. Al crear una cuenta se genera una temporal que llega por
correo; mientras la persona no entre, se le puede reenviar con otra nueva. A
quien ya entró se le envía un enlace para que cree una contraseña nueva.

Las cuentas ADMIN se ven pero no se cambian desde aquí. Eliminar solo se
permite a cuentas sin información de la firma (creadas por error); las demás
se suspenden, y suspender cierra sus sesiones abiertas.
"""

from sqlalchemy import ColumnElement, and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, security
from app.audit import registrar_evento_auditoria
from app.modulos.administracion.esquemas import (
    AccesoEnviado,
    CambioEstado,
    CambioEstadoVarios,
    CambioUsuario,
    ConteoUsuarios,
    EstadoActualizado,
    FichaUsuario,
    GrupoUsuarios,
    NuevoUsuario,
    PaginaUsuarios,
    PersonaBreve,
    ProcesoDelUsuario,
    TotalesUsuario,
    UsuarioFila,
)
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.administracion.repositorio import ROLES_EQUIPO, RepositorioAdministracion
from app.modulos.administracion.servicio import eventos
from app.modulos.clientes.servicio import clave_temporal
from app.modulos.identidad.modelos import EstadoUsuario, RolUsuario, Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado
from app.nucleo.paginacion import ParametrosPagina, codificar_cursor
from app.nucleo.zona_horaria import ahora_utc
from app.password_reset import password_reset_url, send_password_reset_email
from app.workflow_service import user_portal_url

ESTADOS = {
    EstadoUsuario.ACTIVO: "activo", EstadoUsuario.SUSPENDIDO: "suspendido",
    EstadoUsuario.PENDIENTE_APROBACION: "pendiente", EstadoUsuario.RECHAZADO: "rechazado",
}
ESTADO_DE_TEXTO = {texto: estado for estado, texto in ESTADOS.items()}
GRUPOS: dict[str, ColumnElement[bool]] = {
    "equipo": Usuario.rol.in_(ROLES_EQUIPO),
    "clientes": Usuario.rol == RolUsuario.CLIENTE,
    "administradores": Usuario.rol == RolUsuario.ADMIN,
}
NOMBRE_FIRMA = "Alejandra Muñoz Abogada y Asociados"


def notificar(db: Session, destinatario: Usuario, **datos) -> None:
    """Avisos con las plantillas de la API v1 (las pruebas lo sustituyen)."""
    from app.routers.expedientes.comun import _notificar

    _notificar(db, destinatario, **datos)


def enviar_enlace_contrasena(email: str, enlace: str) -> None:
    """Correo con el enlace para crear una contraseña nueva (las pruebas lo sustituyen)."""
    send_password_reset_email(email, enlace)


def _rol(usuario: Usuario) -> RolUsuario:
    return RolUsuario(getattr(usuario.rol, "value", usuario.rol))


def _estado(usuario: Usuario) -> EstadoUsuario:
    return EstadoUsuario(getattr(usuario.estado, "value", usuario.estado))


def acceso_de(usuario: Usuario) -> str:
    if _estado(usuario) != EstadoUsuario.ACTIVO:
        return "suspendido"
    return "sin_ingreso" if usuario.debe_cambiar_password else "activo"


class ServicioUsuariosAdmin:
    def __init__(self, db: Session, repositorio: RepositorioAdministracion):
        self._db = db
        self._repo = repositorio

    # ---- Lectura --------------------------------------------------------

    def _editable(self, usuario_id: int, *, bloquear: bool = False) -> Usuario:
        cuenta = self._repo.usuario(usuario_id, bloquear=bloquear)
        if cuenta is None:
            raise NoEncontrado("No encontramos esa cuenta.")
        if _rol(cuenta) == RolUsuario.ADMIN:
            raise Conflicto("Las cuentas de administración no se cambian desde aquí.", codigo="cuenta_admin")
        return cuenta

    def _filas(self, cuentas: list[Usuario]) -> list[UsuarioFila]:
        procesos = self._repo.procesos_activos_por_usuario([c.id for c in cuentas])
        nombres = self._repo.nombres({c.creado_por_abogado_id for c in cuentas if c.creado_por_abogado_id and _rol(c) == RolUsuario.CLIENTE})
        filas = []
        for c in cuentas:
            responsable = c.creado_por_abogado_id if _rol(c) == RolUsuario.CLIENTE else None
            filas.append(UsuarioFila(
                id=c.id, nombre=c.nombre_completo, email=c.email, whatsapp=c.whatsapp_numero or None, rol=_rol(c).value,
                estado=ESTADOS[_estado(c)], acceso=acceso_de(c), ultimo_acceso=c.ultimo_acceso, creado_en=c.created_at,
                procesos=procesos.get(c.id, 0),
                responsable=PersonaBreve(id=responsable, nombre=nombres[responsable]) if responsable in nombres else None,
            ))
        return filas

    def listar(self, admin: Usuario, *, grupo: GrupoUsuarios, estado: str | None, acceso: str | None, q: str | None,
               pagina: ParametrosPagina) -> PaginaUsuarios:
        exigir_admin(admin)
        condiciones = [GRUPOS[grupo]]
        if estado:
            condiciones.append(Usuario.estado == ESTADO_DE_TEXTO[estado])
        if acceso == "sin_ingreso":
            condiciones += [Usuario.estado == EstadoUsuario.ACTIVO, Usuario.debe_cambiar_password.is_(True)]
        elif acceso == "activo":
            condiciones += [Usuario.estado == EstadoUsuario.ACTIVO, Usuario.debe_cambiar_password.is_(False)]
        texto = " ".join((q or "").split())
        if texto:
            patron = f"%{texto.lower()}%"
            condiciones.append(or_(
                func.lower(Usuario.nombre_completo).like(patron), func.lower(Usuario.email).like(patron),
                Usuario.whatsapp_numero.like(f"%{texto}%"),
            ))
        condicion = and_(*condiciones)
        despues = None
        if pagina.cursor:
            try:
                despues = (str(pagina.cursor["n"]), int(pagina.cursor["id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise DatosInvalidos("El cursor de la página no es válido.", campos={"cursor": "No es válido."}) from exc
        cuentas = self._repo.usuarios(condicion, despues=despues, limite=pagina.limite + 1)
        hay_mas = len(cuentas) > pagina.limite
        cuentas = cuentas[: pagina.limite]
        siguiente = codificar_cursor({"n": cuentas[-1].nombre_completo.lower(), "id": cuentas[-1].id}) if hay_mas else None
        sin_admin = Usuario.rol != RolUsuario.ADMIN
        return PaginaUsuarios(
            items=self._filas(cuentas), total=self._repo.contar_usuarios(condicion), siguiente=siguiente,
            conteo=ConteoUsuarios(
                equipo=self._repo.contar_usuarios(GRUPOS["equipo"]),
                clientes=self._repo.contar_usuarios(GRUPOS["clientes"]),
                administradores=self._repo.contar_usuarios(GRUPOS["administradores"]),
                sin_ingreso=self._repo.contar_usuarios(and_(sin_admin, Usuario.estado == EstadoUsuario.ACTIVO, Usuario.debe_cambiar_password.is_(True))),
                suspendidos=self._repo.contar_usuarios(and_(sin_admin, Usuario.estado == EstadoUsuario.SUSPENDIDO)),
            ),
        )

    def ficha(self, admin: Usuario, usuario_id: int) -> FichaUsuario:
        exigir_admin(admin)
        cuenta = self._repo.usuario(usuario_id)
        if cuenta is None:
            raise NoEncontrado("No encontramos esa cuenta.")
        fila = self._filas([cuenta])[0]
        procesos = self._repo.procesos_del_usuario(cuenta.id)
        con_informacion = self._repo.tiene_informacion(cuenta.id)
        es_admin = _rol(cuenta) == RolUsuario.ADMIN
        return FichaUsuario(
            **fila.model_dump(),
            debe_cambiar_password=cuenta.debe_cambiar_password,
            totales=TotalesUsuario(
                procesos=fila.procesos, tareas_abiertas=self._repo.tareas_abiertas(cuenta.id),
                documentos=self._repo.documentos(cuenta.id), cuentas_cobro=self._repo.cuentas_cobro(cuenta.id),
            ),
            procesos_detalle=[
                ProcesoDelUsuario(id=p.id, nombre=p.nombre, papel=papel, archivado=p.archivado_en is not None, responsable=responsable)
                for p, papel, responsable in procesos
            ],
            actividad=eventos(self._repo.actividad(actor_id=cuenta.id, limite=15)),
            puede_eliminarse=not es_admin and not con_informacion,
            puede_cambiar_rol=not es_admin and not con_informacion and _estado(cuenta) == EstadoUsuario.ACTIVO,
        )

    # ---- Escritura ------------------------------------------------------

    def _responsable(self, responsable_id: int | None) -> Usuario:
        responsable = self._repo.usuario(responsable_id) if responsable_id else None
        if responsable is None or _rol(responsable) not in ROLES_EQUIPO or _estado(responsable) != EstadoUsuario.ACTIVO:
            raise DatosInvalidos("Elija el abogado a cargo.", campos={"responsable_id": "Elija un abogado activo de la firma."})
        return responsable

    def _nombre_firma(self) -> str:
        config = self._db.get(models.ConfiguracionFirma, 1)
        return (config.nombre if config and config.nombre else NOMBRE_FIRMA).strip()

    def _enviar_credenciales(self, admin: Usuario, cuenta: Usuario, clave: str) -> None:
        enlace = user_portal_url(cuenta, "/")
        cliente = _rol(cuenta) == RolUsuario.CLIENTE
        notificar(
            self._db,
            cuenta,
            asunto="Su acceso al portal del despacho",
            cuerpo=(
                f"Hola {cuenta.nombre_completo},\n\nSe creó su acceso al portal de gestión de procesos.\n\n"
                f"Usuario: {cuenta.email}\nContraseña temporal: {clave}\n\n"
                f"Al entrar, el portal le pedirá crear una contraseña nueva.\n\nAbrir enlace: Entrar al portal | {enlace}"
            ),
            tipo="ACCESO",
            origen=f"USUARIO:{cuenta.id}:ACCESO",
            emisor=admin,
            # La contraseña temporal solo viaja por correo.
            incluir_email=True,
            plantilla_clave="CLIENTE_CREDENCIALES" if cliente else "ABOGADO_CREDENCIALES",
            variables={"nombre": cuenta.nombre_completo, "actor": self._nombre_firma(), "correo": cuenta.email,
                       "password": clave, "canal": "correo"},
            enlace_texto="Entrar al portal",
            enlace_url=enlace,
        )

    def crear(self, admin: Usuario, datos: NuevoUsuario) -> FichaUsuario:
        exigir_admin(admin)
        email = str(datos.email).lower()
        if self._repo.correo_en_uso(email):
            raise Conflicto("Ya hay una cuenta con ese correo.", codigo="correo_en_uso", campos={"email": "Ya hay una cuenta con ese correo."})
        rol = RolUsuario(datos.rol)
        responsable = self._responsable(datos.responsable_id) if rol == RolUsuario.CLIENTE else None
        clave = clave_temporal()
        cuenta = Usuario(
            email=email, nombre_completo=datos.nombre, whatsapp_numero=datos.whatsapp or "",
            password_hash=security.hash_password(clave), rol=rol, estado=EstadoUsuario.ACTIVO,
            creado_por_abogado_id=responsable.id if responsable else None, debe_cambiar_password=True,
            notificaciones_email=True, notificaciones_whatsapp=False,
            canal_notificacion_cliente="EMAIL" if rol == RolUsuario.CLIENTE else None,
        )
        self._db.add(cuenta)
        self._db.flush()
        registrar_evento_auditoria(self._db, admin, "admin.usuario.crear", "usuario", cuenta.id, {"rol": rol.value})
        self._db.commit()
        self._enviar_credenciales(admin, cuenta, clave)
        return self.ficha(admin, cuenta.id)

    def cambiar(self, admin: Usuario, usuario_id: int, datos: CambioUsuario) -> FichaUsuario:
        exigir_admin(admin)
        cuenta = self._editable(usuario_id, bloquear=True)
        cambios = datos.model_dump(exclude_unset=True)
        if "nombre" in cambios:
            if not cambios["nombre"]:
                raise DatosInvalidos("Falta el nombre.", campos={"nombre": "Escriba el nombre completo."})
            cuenta.nombre_completo = cambios["nombre"]
        if "whatsapp" in cambios:
            cuenta.whatsapp_numero = cambios["whatsapp"] or ""
        rol_nuevo = RolUsuario(cambios["rol"]) if cambios.get("rol") else _rol(cuenta)
        if rol_nuevo != _rol(cuenta):
            if self._repo.tiene_informacion(cuenta.id) or _estado(cuenta) != EstadoUsuario.ACTIVO:
                raise Conflicto(
                    "Esta cuenta ya tiene información de la firma; no se le puede cambiar el rol.", codigo="rol_con_informacion",
                    campos={"rol": "Cree una cuenta nueva con el rol que necesita."},
                )
            cuenta.rol = rol_nuevo
            cuenta.plan_id = None
            cuenta.canal_notificacion_cliente = "EMAIL" if rol_nuevo == RolUsuario.CLIENTE else None
            if rol_nuevo != RolUsuario.CLIENTE:
                cuenta.creado_por_abogado_id = None
        if rol_nuevo == RolUsuario.CLIENTE and ("responsable_id" in cambios or not cuenta.creado_por_abogado_id):
            cuenta.creado_por_abogado_id = self._responsable(cambios.get("responsable_id")).id
        registrar_evento_auditoria(self._db, admin, "admin.usuario.actualizar", "usuario", cuenta.id, {"campos": sorted(cambios)})
        self._db.commit()
        return self.ficha(admin, cuenta.id)

    def _aplicar_estado(self, admin: Usuario, cuenta: Usuario, estado: str) -> bool:
        nuevo = ESTADO_DE_TEXTO[estado]
        if _estado(cuenta) == nuevo:
            return False
        reactivada = _estado(cuenta) == EstadoUsuario.SUSPENDIDO and nuevo == EstadoUsuario.ACTIVO
        cuenta.estado = nuevo
        if nuevo == EstadoUsuario.SUSPENDIDO:
            cuenta.sesiones_cerradas_en = ahora_utc()
        registrar_evento_auditoria(self._db, admin, f"admin.usuario.estado.{nuevo.value}", "usuario", cuenta.id)
        return reactivada

    def _ponerse_al_dia(self, admin: Usuario, cuenta: Usuario) -> None:
        """Al reactivar una cuenta le llegan los avisos de agenda que se perdió (como en la API v1)."""
        from app.routers.admin.agenda import _notificar_agenda_tras_reactivacion

        _notificar_agenda_tras_reactivacion(self._db, cuenta, admin)

    def cambiar_estado(self, admin: Usuario, usuario_id: int, datos: CambioEstado) -> FichaUsuario:
        exigir_admin(admin)
        cuenta = self._editable(usuario_id, bloquear=True)
        reactivada = self._aplicar_estado(admin, cuenta, datos.estado)
        self._db.commit()
        if reactivada:
            self._ponerse_al_dia(admin, cuenta)
        return self.ficha(admin, cuenta.id)

    def cambiar_estado_varios(self, admin: Usuario, datos: CambioEstadoVarios) -> EstadoActualizado:
        exigir_admin(admin)
        cuentas = [c for c in (self._repo.usuario(i, bloquear=True) for i in sorted(set(datos.ids))) if c and _rol(c) != RolUsuario.ADMIN]
        if not cuentas:
            raise NoEncontrado("No encontramos esas cuentas.")
        actualizados, reactivadas = 0, []
        for cuenta in cuentas:
            if _estado(cuenta) != ESTADO_DE_TEXTO[datos.estado]:
                actualizados += 1
                if self._aplicar_estado(admin, cuenta, datos.estado):
                    reactivadas.append(cuenta)
        self._db.commit()
        for cuenta in reactivadas:
            self._ponerse_al_dia(admin, cuenta)
        return EstadoActualizado(actualizados=actualizados)

    def reenviar_acceso(self, admin: Usuario, usuario_id: int) -> AccesoEnviado:
        exigir_admin(admin)
        cuenta = self._editable(usuario_id, bloquear=True)
        acceso = acceso_de(cuenta)
        if acceso == "suspendido":
            raise Conflicto("La cuenta está suspendida. Reactívela primero.", codigo="cuenta_suspendida")
        if acceso == "activo":
            raise Conflicto("Esta persona ya entró y creó su contraseña. Envíele un enlace para cambiarla.", codigo="ya_ingreso")
        clave = clave_temporal()
        cuenta.password_hash = security.hash_password(clave)
        registrar_evento_auditoria(self._db, admin, "admin.usuario.acceso_reenviado", "usuario", cuenta.id)
        self._db.commit()
        self._enviar_credenciales(admin, cuenta, clave)
        return AccesoEnviado(destino=cuenta.email)

    def enviar_enlace(self, admin: Usuario, usuario_id: int) -> AccesoEnviado:
        exigir_admin(admin)
        cuenta = self._editable(usuario_id)
        acceso = acceso_de(cuenta)
        if acceso == "suspendido":
            raise Conflicto("La cuenta está suspendida. Reactívela primero.", codigo="cuenta_suspendida")
        if acceso == "sin_ingreso":
            raise Conflicto("Esta persona aún no ha entrado. Reenvíele el acceso.", codigo="sin_ingreso")
        token = security.create_password_reset_token(cuenta.id, cuenta.password_hash)
        registrar_evento_auditoria(self._db, admin, "admin.usuario.password.restablecimiento_enviado", "usuario", cuenta.id)
        self._db.commit()
        enviar_enlace_contrasena(cuenta.email, password_reset_url(token, cuenta.rol))
        return AccesoEnviado(destino=cuenta.email)

    def cerrar_sesiones(self, admin: Usuario, usuario_id: int) -> FichaUsuario:
        exigir_admin(admin)
        cuenta = self._editable(usuario_id, bloquear=True)
        cuenta.sesiones_cerradas_en = ahora_utc()
        registrar_evento_auditoria(self._db, admin, "admin.usuario.sesiones_cerradas", "usuario", cuenta.id)
        self._db.commit()
        return self.ficha(admin, cuenta.id)

    def eliminar(self, admin: Usuario, usuario_id: int) -> None:
        exigir_admin(admin)
        cuenta = self._editable(usuario_id, bloquear=True)
        if self._repo.tiene_informacion(cuenta.id):
            raise Conflicto("Esta cuenta ya tiene información de la firma. Suspéndala en lugar de eliminarla.", codigo="cuenta_con_informacion")
        registrar_evento_auditoria(self._db, admin, "admin.usuario.eliminar", "usuario", cuenta.id, {"email": cuenta.email})
        self._db.delete(cuenta)
        try:
            self._db.commit()
        except IntegrityError as exc:
            self._db.rollback()
            raise Conflicto("Esta cuenta ya tiene información de la firma. Suspéndala en lugar de eliminarla.", codigo="cuenta_con_informacion") from exc

