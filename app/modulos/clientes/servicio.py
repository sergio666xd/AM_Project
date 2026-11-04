"""Casos de uso de clientes para el equipo de la firma.

Quién ve qué: ver `clientes.politicas`. Los procesos, pendientes y avisos de
cada cliente son solo los de procesos activos que el usuario ve.

Acceso: al crear un cliente la firma no inventa la contraseña; se genera una
temporal y le llega por el canal elegido. Mientras el cliente no entre y la
cambie, la firma puede reenviarle el acceso con una contraseña nueva.
"""

import secrets
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import security
from app.audit import registrar_evento_auditoria
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.clientes import politicas
from app.modulos.clientes.esquemas import (
    Acceso,
    AccesoEnviado,
    AvisoAlCliente,
    CambioPerfil,
    CambiosPerfil,
    ClienteFicha,
    ClienteResumen,
    ContratoDelCliente,
    DatosCliente,
    DiferenciaPerfil,
    GrupoClientes,
    ListaClientes,
    NuevoCliente,
    PendienteDelCliente,
    ProcesoDelCliente,
    ResumenClientes,
    RevisionCambio,
)
from app.modulos.clientes.repositorio import RepositorioClientes
from app.modulos.documentos.modelos import SolicitudDocumento
from app.modulos.documentos.servicio import estado_de, fecha_limite_de
from app.modulos.expedientes.modelos import Proceso
from app.modulos.expedientes.politicas import _rol, filtro_procesos_visibles
from app.modulos.identidad.modelos import EstadoUsuario, RolUsuario, Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado, SinPermiso
from app.nucleo.zona_horaria import a_colombia
from app.timezone import utc_ahora
from app.workflow_service import user_portal_url

# Sin caracteres que se confunden al leerlos en un celular (0/O, 1/l/I).
ALFABETO_CLAVE = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def notificar(db: Session, destinatario: Usuario, **datos) -> None:
    """Avisos con las plantillas de la API v1 (las pruebas lo sustituyen)."""
    from app.routers.expedientes.comun import _notificar

    _notificar(db, destinatario, **datos)


def clave_temporal() -> str:
    while True:
        clave = "".join(secrets.choice(ALFABETO_CLAVE) for _ in range(12))
        if any(c.isdigit() for c in clave) and any(c.isupper() for c in clave) and any(c.islower() for c in clave):
            return clave


def hoy_colombia() -> date:
    return a_colombia(utc_ahora()).date()


def acceso_de(cliente: Usuario) -> Acceso:
    if getattr(cliente.estado, "value", cliente.estado) != EstadoUsuario.ACTIVO.value:
        return "suspendido"
    return "sin_ingreso" if cliente.debe_cambiar_password else "activo"


class ServicioClientes:
    def __init__(self, db: Session, repositorio: RepositorioClientes):
        self._db = db
        self._repo = repositorio

    # ---- Alcance --------------------------------------------------------

    def _equipo(self, usuario: Usuario) -> None:
        if not politicas.es_equipo(usuario):
            raise SinPermiso("Los clientes son para el equipo de la firma.")

    def _cliente(self, usuario: Usuario, cliente_id: int) -> Usuario:
        self._equipo(usuario)
        cliente = self._repo.cliente(cliente_id, politicas.filtro_clientes_visibles(usuario))
        if cliente is None:
            raise NoEncontrado("No encontramos ese cliente.")
        return cliente

    # ---- Lectura --------------------------------------------------------

    def _resumenes(self, usuario: Usuario, clientes: list[Usuario]) -> tuple[list[ClienteResumen], dict]:
        hoy = hoy_colombia()
        ids = [c.id for c in clientes]
        procesos: dict[int, list[Proceso]] = {i: [] for i in ids}
        for cliente_id, proceso in self._repo.vinculos(ids, filtro_procesos_visibles(usuario)):
            procesos[cliente_id].append(proceso)
        proceso_ids = sorted({p.id for lista in procesos.values() for p in lista})
        solicitudes: dict[int, list[SolicitudDocumento]] = {i: [] for i in ids}
        for solicitud in self._repo.solicitudes_abiertas(ids, proceso_ids):
            solicitudes[solicitud.cliente_id].append(solicitud)
        con_chat = (
            set() if _rol(usuario) == RolUsuario.ADMIN else self._repo.procesos_con_chat(usuario.id, proceso_ids)
        )
        resumenes = []
        for cliente in clientes:
            faltan = vencidas = 0
            for solicitud in solicitudes[cliente.id]:
                pendientes = len(estado_de(solicitud).faltantes)
                faltan += pendientes
                limite = fecha_limite_de(solicitud)
                vencidas += bool(pendientes and limite and limite < hoy)
            suyos = procesos[cliente.id]
            resumenes.append(ClienteResumen(
                id=cliente.id,
                nombre=cliente.nombre_completo,
                email=cliente.email,
                whatsapp=cliente.whatsapp_numero or None,
                documento=cliente.numero_documento,
                acceso=acceso_de(cliente),
                ultimo_acceso=cliente.ultimo_acceso,
                procesos=[ProcesoBreve(id=p.id, nombre=p.nombre) for p in suyos],
                documentos_pendientes=faltan,
                solicitudes_vencidas=vencidas,
                proceso_chat_id=next((p.id for p in suyos if p.id in con_chat), None),
                creado_en=cliente.created_at,
            ))
        return resumenes, {"procesos": procesos, "solicitudes": solicitudes}

    def listar(self, usuario: Usuario, grupo: GrupoClientes) -> ListaClientes:
        self._equipo(usuario)
        resumenes, _ = self._resumenes(usuario, self._repo.clientes(politicas.filtro_clientes_visibles(usuario)))
        resumen = ResumenClientes(
            total=len(resumenes),
            con_pendientes=sum(1 for c in resumenes if c.documentos_pendientes),
            sin_ingreso=sum(1 for c in resumenes if c.acceso == "sin_ingreso"),
            sin_procesos=sum(1 for c in resumenes if not c.procesos),
        )
        filtros = {
            "todos": lambda c: True,
            "con_pendientes": lambda c: c.documentos_pendientes > 0,
            "sin_ingreso": lambda c: c.acceso == "sin_ingreso",
            "sin_procesos": lambda c: not c.procesos,
        }
        return ListaClientes(items=[c for c in resumenes if filtros[grupo](c)], resumen=resumen)

    def ficha(self, usuario: Usuario, cliente_id: int) -> ClienteFicha:
        cliente = self._cliente(usuario, cliente_id)
        hoy = hoy_colombia()
        [resumen], datos = self._resumenes(usuario, [cliente])
        procesos: list[Proceso] = datos["procesos"][cliente.id]
        breves = {p.id: ProcesoBreve(id=p.id, nombre=p.nombre) for p in procesos}
        pendientes = []
        for solicitud in datos["solicitudes"][cliente.id]:
            estado = estado_de(solicitud)
            if not estado.faltantes:
                continue
            limite = fecha_limite_de(solicitud)
            pendientes.append(PendienteDelCliente(
                solicitud_id=solicitud.id,
                titulo=solicitud.titulo,
                proceso=breves[solicitud.proceso_id],
                faltan=estado.faltantes,
                total=len(estado.pedidos),
                fecha_limite=limite,
                vencida=bool(limite and limite < hoy),
            ))
        contratos = None
        if politicas.gestiona_contratos(usuario):
            contratos = [
                ContratoDelCliente(
                    id=c.id, estado=c.estado, firmado_en=c.firmado_en,
                    proceso=ProcesoBreve(id=c.proceso_id, nombre=c.proceso.nombre),
                )
                for c in self._repo.contratos(cliente.id, filtro_procesos_visibles(usuario))
            ]
        avisos = [
            AvisoAlCliente(asunto=a.asunto, proceso=breves[a.proceso_id], enviado_en=a.created_at)
            for a in self._repo.avisos(cliente.id, list(breves))
        ]
        return ClienteFicha(
            **resumen.model_dump(),
            genero=cliente.genero if cliente.genero in ("FEMENINO", "MASCULINO") else None,
            domicilio=cliente.domicilio,
            direccion=cliente.direccion,
            canal=cliente.canal_notificacion_cliente if cliente.canal_notificacion_cliente in ("EMAIL", "WHATSAPP") else None,
            expedientes=[
                ProcesoDelCliente(
                    id=p.id, nombre=p.nombre, etapa=p.etapa.nombre if p.etapa else None,
                    radicados=sorted(v.radicado.numero for v in p.radicados if v.radicado),
                    responsable=p.abogado.nombre_completo if p.abogado else "Sin responsable",
                )
                for p in procesos
            ],
            pendientes=pendientes,
            contratos=contratos,
            avisos=avisos,
        )

    # ---- Escritura ------------------------------------------------------

    def _enviar_acceso(self, actor: Usuario, cliente: Usuario, clave: str, canal: str) -> None:
        enlace = user_portal_url(cliente, "/")
        notificar(
            self._db,
            cliente,
            asunto="Acceso a sus procesos",
            cuerpo=(
                "# Su acceso al portal\n"
                f"Hola, {cliente.nombre_completo.split()[0]}:\n"
                f"{actor.nombre_completo} creó su acceso al portal de la firma. Allí puede ver sus procesos y sus documentos, y escribirnos.\n"
                "! Entre con estos datos. Al iniciar sesión, el portal le pedirá crear una contraseña nueva. No comparta estos datos con nadie.\n"
                f"Usuario: {cliente.email}\nContraseña temporal: {clave}\n"
                f"Avisos por: {'WhatsApp' if canal == 'WHATSAPP' else 'correo'}\n"
                f"Abrir enlace: Entrar al portal | {enlace}\n"
                "? Si tiene dudas, escríbanos por el chat del portal."
            ),
            tipo="ACCESO",
            origen=f"USUARIO:{cliente.id}:ACCESO",
            emisor=actor,
            # La contraseña temporal solo viaja por correo; WhatsApp avisa que la busque allí.
            incluir_email=True,
            plantilla_clave="CLIENTE_CREDENCIALES",
            variables={"nombre": cliente.nombre_completo, "actor": actor.nombre_completo,
                       "correo": cliente.email, "password": clave, "canal": canal},
            enlace_texto="Ingresar al portal",
            enlace_url=enlace,
        )

    def crear(self, usuario: Usuario, datos: NuevoCliente) -> ClienteFicha:
        self._equipo(usuario)
        email = str(datos.email).lower()
        if self._repo.correo_en_uso(email):
            raise Conflicto("Ya hay una cuenta con ese correo.", codigo="correo_en_uso", campos={"email": "Ya hay una cuenta con ese correo."})
        if datos.canal == "WHATSAPP" and not datos.whatsapp:
            raise DatosInvalidos("Falta el WhatsApp.", campos={"whatsapp": "Escribe el WhatsApp para enviarle el acceso por ese canal."})
        clave = clave_temporal()
        cliente = Usuario(
            email=email,
            nombre_completo=datos.nombre,
            whatsapp_numero=datos.whatsapp or "",
            numero_documento=datos.documento,
            genero=datos.genero,
            domicilio=datos.domicilio,
            direccion=datos.direccion,
            password_hash=security.hash_password(clave),
            rol=RolUsuario.CLIENTE,
            estado=EstadoUsuario.ACTIVO,
            creado_por_abogado_id=usuario.id,
            debe_cambiar_password=True,
            notificaciones_email=datos.canal == "EMAIL",
            notificaciones_whatsapp=datos.canal == "WHATSAPP",
            canal_notificacion_cliente=datos.canal,
        )
        self._db.add(cliente)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "cliente.crear", "usuario", cliente.id)
        self._db.commit()
        self._enviar_acceso(usuario, cliente, clave, datos.canal)
        return self.ficha(usuario, cliente.id)

    def actualizar(self, usuario: Usuario, cliente_id: int, datos: DatosCliente) -> ClienteFicha:
        cliente = self._cliente(usuario, cliente_id)
        cambios = datos.model_dump(exclude_unset=True)
        if "nombre" in cambios and not cambios["nombre"]:
            raise DatosInvalidos("Falta el nombre.", campos={"nombre": "Escribe el nombre del cliente."})
        columnas = {"nombre": "nombre_completo", "whatsapp": "whatsapp_numero", "documento": "numero_documento",
                    "genero": "genero", "domicilio": "domicilio", "direccion": "direccion"}
        for campo, valor in cambios.items():
            setattr(cliente, columnas[campo], "" if campo == "whatsapp" and valor is None else valor)
        registrar_evento_auditoria(self._db, usuario, "cliente.actualizar", "usuario", cliente.id, {"campos": sorted(cambios)})
        self._db.commit()
        return self.ficha(usuario, cliente.id)

    def reenviar_acceso(self, usuario: Usuario, cliente_id: int) -> AccesoEnviado:
        cliente = self._cliente(usuario, cliente_id)
        acceso = acceso_de(cliente)
        if acceso == "suspendido":
            raise Conflicto("La cuenta del cliente está suspendida.", codigo="cliente_suspendido")
        if acceso == "activo":
            raise Conflicto("El cliente ya entró al portal y cambió su contraseña.", codigo="ya_ingreso")
        canal = cliente.canal_notificacion_cliente if cliente.canal_notificacion_cliente in ("EMAIL", "WHATSAPP") else "EMAIL"
        if canal == "WHATSAPP" and not cliente.whatsapp_numero:
            canal = "EMAIL"
        clave = clave_temporal()
        cliente.password_hash = security.hash_password(clave)
        registrar_evento_auditoria(self._db, usuario, "cliente.reenviar_acceso", "usuario", cliente.id, {"canal": canal})
        self._db.commit()
        self._enviar_acceso(usuario, cliente, clave, canal)
        return AccesoEnviado(canal=canal, destino=cliente.whatsapp_numero if canal == "WHATSAPP" else cliente.email)

    # ---- Cambios de datos que piden los clientes ------------------------

    def _diferencias(self, solicitud) -> list[DiferenciaPerfil]:
        cliente = solicitud.cliente
        genero = {"MASCULINO": "Masculino", "FEMENINO": "Femenino"}
        filas = [
            ("nombre", "Nombre", cliente.nombre_completo, solicitud.nombre_completo_solicitado),
            ("correo", "Correo", cliente.email, solicitud.email_solicitado),
            ("whatsapp", "WhatsApp", cliente.whatsapp_numero, solicitud.whatsapp_numero_solicitado),
            ("documento", "Documento", cliente.numero_documento, solicitud.numero_documento_solicitado),
            ("genero", "Género", genero.get(cliente.genero or ""), genero.get(solicitud.genero_solicitado or "") if solicitud.genero_solicitado is not None else None),
            ("domicilio", "Ciudad de domicilio", cliente.domicilio, solicitud.domicilio_solicitado),
            ("direccion", "Dirección", cliente.direccion, solicitud.direccion_solicitada),
        ]
        diferencias = []
        for campo, etiqueta, antes, despues in filas:
            if campo in {"documento", "genero", "domicilio", "direccion"} and despues is None:
                continue  # El cliente no tocó ese dato.
            antes, despues = (antes or "").strip() or None, (despues or "").strip() or None
            if antes != despues:
                diferencias.append(DiferenciaPerfil(campo=campo, etiqueta=etiqueta, antes=antes, despues=despues))
        return diferencias

    def cambios_perfil(self, usuario: Usuario) -> CambiosPerfil:
        self._equipo(usuario)
        solicitudes = self._repo.cambios_pendientes(politicas.filtro_clientes_visibles(usuario))
        procesos: dict[int, list[ProcesoBreve]] = {}
        for cliente_id, proceso in self._repo.vinculos([s.cliente_id for s in solicitudes], filtro_procesos_visibles(usuario)):
            procesos.setdefault(cliente_id, []).append(ProcesoBreve(id=proceso.id, nombre=proceso.nombre))
        return CambiosPerfil(items=[
            CambioPerfil(
                id=s.id,
                cliente_id=s.cliente_id,
                cliente=s.cliente.nombre_completo,
                solicitada_en=s.solicitada_en,
                procesos=procesos.get(s.cliente_id, []),
                diferencias=self._diferencias(s),
            )
            for s in solicitudes
        ])

    def _cambio(self, usuario: Usuario, solicitud_id: int):
        self._equipo(usuario)
        solicitud = self._repo.cambio_pendiente(solicitud_id, politicas.filtro_clientes_visibles(usuario))
        if solicitud is None:
            raise NoEncontrado("Esa solicitud ya fue revisada o no existe.")
        return solicitud

    def aprobar_cambio(self, usuario: Usuario, solicitud_id: int, datos: RevisionCambio) -> None:
        solicitud = self._cambio(usuario, solicitud_id)
        cliente = solicitud.cliente
        correo = (solicitud.email_solicitado or "").strip().lower()
        if correo and correo != (cliente.email or "").lower() and self._db.scalar(
            select(Usuario.id).where(Usuario.email == correo, Usuario.id != cliente.id)
        ):
            raise Conflicto("El correo que pidió el cliente ya pertenece a otra cuenta.")
        cliente.email = correo or cliente.email
        cliente.nombre_completo = solicitud.nombre_completo_solicitado
        cliente.whatsapp_numero = solicitud.whatsapp_numero_solicitado or ""
        if solicitud.genero_solicitado is not None:
            cliente.genero = solicitud.genero_solicitado or None
        if solicitud.numero_documento_solicitado is not None:
            cliente.numero_documento = solicitud.numero_documento_solicitado.replace(".", "") or None
        if solicitud.domicilio_solicitado is not None:
            cliente.domicilio = solicitud.domicilio_solicitado or None
        if solicitud.direccion_solicitada is not None:
            cliente.direccion = solicitud.direccion_solicitada or None
        self._cerrar_cambio(usuario, solicitud, "APROBADA", datos.comentario)

    def rechazar_cambio(self, usuario: Usuario, solicitud_id: int, datos: RevisionCambio) -> None:
        solicitud = self._cambio(usuario, solicitud_id)
        if not (datos.comentario or "").strip():
            raise DatosInvalidos("Cuéntele al cliente por qué no se aplica el cambio.", campos={"comentario": "Escriba el motivo."})
        self._cerrar_cambio(usuario, solicitud, "RECHAZADA", datos.comentario)

    def _cerrar_cambio(self, usuario: Usuario, solicitud, estado: str, comentario: str | None) -> None:
        solicitud.estado = estado
        solicitud.revisada_por_id = usuario.id
        solicitud.revisada_en = utc_ahora()
        solicitud.comentario_revision = (comentario or "").strip() or None
        accion = "cliente.solicitud_perfil.aprobar" if estado == "APROBADA" else "cliente.solicitud_perfil.rechazar"
        registrar_evento_auditoria(self._db, usuario, accion, "solicitud_edicion_perfil", solicitud.id)
        self._db.commit()
