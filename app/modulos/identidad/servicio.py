from sqlalchemy.orm import Session

from app import security
from app.audit import registrar_evento_auditoria
from app.modulos.identidad.modelos import EstadoUsuario, Usuario
from app.modulos.identidad.repositorio import RepositorioUsuarios
from app.nucleo.errores import DemasiadosIntentos, NoAutenticado, SinPermiso
from app.nucleo.zona_horaria import ahora_utc, utc_ahora
from app.rate_limit import VENTANA_LOGIN, clave_intento, limite_excedido, registrar_intentos

# Mismos topes que el inicio de sesión de la API v1, y comparten contador.
MAX_INTENTOS_POR_CORREO = 10
MAX_INTENTOS_POR_IP = 50

MENSAJES_ESTADO = {
    EstadoUsuario.PENDIENTE_APROBACION: ("cuenta_pendiente", "Tu cuenta aún no ha sido aprobada."),
    EstadoUsuario.SUSPENDIDO: ("cuenta_suspendida", "Tu cuenta está suspendida. Comunícate con la firma."),
    EstadoUsuario.RECHAZADO: ("cuenta_rechazada", "Tu solicitud de cuenta fue rechazada."),
}


class ServicioSesion:
    def __init__(self, db: Session, usuarios: RepositorioUsuarios):
        self._db = db
        self._usuarios = usuarios

    def iniciar(self, email: str, password: str, *, ip: str) -> Usuario:
        claves = [clave_intento("login:email", email), clave_intento("login:ip", ip)]
        topes = list(zip(claves, (MAX_INTENTOS_POR_CORREO, MAX_INTENTOS_POR_IP)))
        if limite_excedido(self._db, topes, VENTANA_LOGIN):
            raise DemasiadosIntentos("Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.")

        usuario = self._usuarios.por_email(email)
        if usuario is None or not security.verify_password(password, usuario.password_hash):
            registrar_intentos(self._db, claves)
            raise NoAutenticado("Correo o contraseña incorrectos.", codigo="credenciales_invalidas")

        if usuario.estado in MENSAJES_ESTADO:
            codigo, mensaje = MENSAJES_ESTADO[usuario.estado]
            raise SinPermiso(mensaje, codigo=codigo)

        usuario.ultimo_acceso = utc_ahora()
        self._db.commit()
        return usuario

    @staticmethod
    def emitir_token(usuario: Usuario, *, persistente: bool) -> str:
        return security.create_access_token({"sub": str(usuario.id)}, persistent=persistente)

    def cerrar_todas(self, usuario: Usuario) -> None:
        """Invalida todos los tokens emitidos hasta ahora, en cualquier dispositivo."""
        usuario.sesiones_cerradas_en = ahora_utc()
        registrar_evento_auditoria(self._db, usuario, "sesion.cerrar_todas", "usuario", usuario.id)
        self._db.commit()
