"""Archivos guardados en el almacenamiento (Cloudflare R2) de la plataforma.

Cada archivo dice qué registro lo usa. Solo se borran los huérfanos: un archivo
que pertenece a un documento o a un contrato se retira desde su expediente, para
no dejar registros que apuntan a nada.
"""

from urllib.parse import quote

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import storage
from app.audit import registrar_evento_auditoria
from app.modulos.administracion.politicas import exigir_admin
from app.modulos.identidad.modelos import Usuario
from app.modulos.operacion.integraciones import ProveedorNoDisponible
from app.modulos.sistema.esquemas import (
    ArchivoGuardado,
    CarpetaGuardada,
    ContenidoCarpeta,
    EnlaceTemporal,
    Eliminados,
    VinculoArchivo,
)
from app.modulos.sistema.repositorio import RepositorioSistema
from app.nucleo.errores import Conflicto, DatosInvalidos, ErrorDominio, NoEncontrado

ADMIN = "/gestion-procesos/admin"
POR_PAGINA = 200
MAX_CARPETA = 10_000
EXPIRA = 900
NO_EXISTE = {"NoSuchKey", "NotFound", "404"}


class AlmacenamientoSinConfigurar(ErrorDominio):
    estado = 503
    codigo = "almacenamiento_sin_configurar"


def _limpia(ruta: str, *, campo: str) -> str:
    ruta = ruta.strip().strip("/")
    if "\\" in ruta or any(parte in {"..", "."} for parte in ruta.split("/") if ruta):
        raise DatosInvalidos("Esa ruta no es válida.", campos={campo: "No es válida."})
    return ruta


def _conexion():
    """El cliente y la cubeta del sistema, o un error claro si faltan las credenciales."""
    try:
        return storage.get_r2_client(), storage.get_r2_system_bucket()
    except HTTPException as exc:
        raise AlmacenamientoSinConfigurar("El almacenamiento de archivos no está configurado.") from exc


def _vinculo(documento) -> VinculoArchivo:
    proceso = documento.proceso.nombre if documento.proceso else None
    enlace = f"{ADMIN}/procesos/{documento.proceso_id}" if documento.proceso_id else None
    if documento.contrato_id:
        return VinculoArchivo(tipo="contrato", descripcion=f"Contrato firmado{f' del proceso {proceso}' if proceso else ''}", enlace=enlace)
    return VinculoArchivo(tipo="documento", descripcion=f"{documento.nombre_archivo}{f', del proceso {proceso}' if proceso else ''}", enlace=enlace)


class ServicioAlmacenamiento:
    def __init__(self, db: Session, repositorio: RepositorioSistema):
        self._db = db
        self._repo = repositorio

    def contenido(self, admin: Usuario, ruta: str, siguiente: str | None) -> ContenidoCarpeta:
        exigir_admin(admin)
        ruta = _limpia(ruta, campo="ruta")
        prefijo = f"{ruta}/" if ruta else ""
        cliente, cubeta = _conexion()
        parametros = {"Bucket": cubeta, "Prefix": prefijo, "Delimiter": "/", "MaxKeys": POR_PAGINA}
        if siguiente:
            parametros["ContinuationToken"] = siguiente
        try:
            resultado = cliente.list_objects_v2(**parametros)
        except ClientError as exc:
            if siguiente and exc.response.get("Error", {}).get("Code") in {"InvalidToken", "InvalidArgument"}:
                raise DatosInvalidos("La página pedida ya no es válida. Vuelva a abrir la carpeta.") from exc
            raise ProveedorNoDisponible("El almacenamiento no respondió. Intente de nuevo en unos minutos.") from exc
        except BotoCoreError as exc:
            raise ProveedorNoDisponible("No fue posible conectar con el almacenamiento.") from exc

        objetos = [o for o in resultado.get("Contents", []) if o.get("Key") != prefijo]
        documentos = self._repo.documentos_por_ruta([o["Key"] for o in objetos])
        vinculos = {d.ruta_archivo: _vinculo(d) for d in documentos}
        return ContenidoCarpeta(
            ruta=ruta,
            carpetas=[
                CarpetaGuardada(ruta=p["Prefix"].rstrip("/"), nombre=p["Prefix"][len(prefijo):].strip("/"))
                for p in resultado.get("CommonPrefixes", [])
            ],
            archivos=[
                ArchivoGuardado(
                    clave=o["Key"], nombre=o["Key"].rsplit("/", 1)[-1], tamano=o.get("Size", 0),
                    modificado=o.get("LastModified"), vinculo=vinculos.get(o["Key"]),
                )
                for o in objetos
            ],
            siguiente=resultado.get("NextContinuationToken") if resultado.get("IsTruncated") else None,
        )

    def enlace(self, admin: Usuario, clave: str) -> EnlaceTemporal:
        exigir_admin(admin)
        clave = _limpia(clave, campo="clave")
        cliente, cubeta = _conexion()
        try:
            cliente.head_object(Bucket=cubeta, Key=clave)
            url = cliente.generate_presigned_url("get_object", ExpiresIn=EXPIRA, Params={
                "Bucket": cubeta, "Key": clave,
                "ResponseContentDisposition": f"inline; filename*=UTF-8''{quote(clave.rsplit('/', 1)[-1])}",
            })
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in NO_EXISTE:
                raise NoEncontrado("Ese archivo ya no está en el almacenamiento.") from exc
            raise ProveedorNoDisponible("No fue posible preparar el archivo.") from exc
        except BotoCoreError as exc:
            raise ProveedorNoDisponible("No fue posible conectar con el almacenamiento.") from exc
        return EnlaceTemporal(url=url, expira_en=EXPIRA)

    def eliminar_archivo(self, admin: Usuario, clave: str) -> Eliminados:
        exigir_admin(admin)
        clave = _limpia(clave, campo="clave")
        if self._repo.rutas_vinculadas([clave]):
            raise Conflicto("Este archivo pertenece a un documento. Retírelo desde el expediente.", codigo="archivo_vinculado")
        cliente, cubeta = _conexion()
        try:
            cliente.head_object(Bucket=cubeta, Key=clave)
            cliente.delete_object(Bucket=cubeta, Key=clave)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in NO_EXISTE:
                raise NoEncontrado("Ese archivo ya no está en el almacenamiento.") from exc
            raise ProveedorNoDisponible("El almacenamiento no confirmó el borrado. Intente de nuevo.") from exc
        except BotoCoreError as exc:
            raise ProveedorNoDisponible("No fue posible conectar con el almacenamiento.") from exc
        registrar_evento_auditoria(self._db, admin, "admin.r2.eliminar", "archivo_r2", clave, {"bucket": cubeta})
        self._db.commit()
        return Eliminados(archivos=1)

    def eliminar_carpeta(self, admin: Usuario, ruta: str, confirmacion: str) -> Eliminados:
        exigir_admin(admin)
        ruta = _limpia(ruta, campo="ruta")
        if not ruta:
            raise DatosInvalidos("La raíz del almacenamiento no se puede borrar.", campos={"ruta": "Elija una carpeta."})
        nombre = ruta.rsplit("/", 1)[-1]
        if confirmacion.strip() != nombre:
            raise DatosInvalidos(f"Escriba «{nombre}» para confirmar.", campos={"confirmacion": f"Escriba «{nombre}»."})
        cliente, cubeta = _conexion()
        claves: list[str] = []
        token = None
        try:
            while True:
                parametros = {"Bucket": cubeta, "Prefix": f"{ruta}/", "MaxKeys": 1000}
                if token:
                    parametros["ContinuationToken"] = token
                resultado = cliente.list_objects_v2(**parametros)
                claves.extend(o["Key"] for o in resultado.get("Contents", []))
                if len(claves) > MAX_CARPETA:
                    raise Conflicto("La carpeta tiene más de 10.000 archivos. Bórrela por partes, carpeta por carpeta.",
                                    codigo="carpeta_muy_grande")
                token = resultado.get("NextContinuationToken") if resultado.get("IsTruncated") else None
                if not token:
                    break
        except (ClientError, BotoCoreError) as exc:
            raise ProveedorNoDisponible("No fue posible revisar la carpeta en el almacenamiento.") from exc
        if not claves:
            return Eliminados(archivos=0)
        vinculadas = self._repo.rutas_vinculadas(claves)
        if vinculadas:
            cuantos = len(vinculadas)
            raise Conflicto(
                f"{'Un archivo de esta carpeta pertenece' if cuantos == 1 else f'{cuantos} archivos de esta carpeta pertenecen'} "
                "a documentos de un expediente. Retírelos desde el expediente antes de borrar la carpeta.",
                codigo="carpeta_con_vinculos",
            )
        borrados = 0
        try:
            for inicio in range(0, len(claves), 1000):
                lote = claves[inicio:inicio + 1000]
                respuesta = cliente.delete_objects(Bucket=cubeta, Delete={"Objects": [{"Key": c} for c in lote], "Quiet": True})
                borrados += len(lote) - len(respuesta.get("Errors", []))
        except (ClientError, BotoCoreError) as exc:
            raise ProveedorNoDisponible("El almacenamiento no confirmó el borrado completo. Abra la carpeta y revise qué quedó.") from exc
        registrar_evento_auditoria(self._db, admin, "admin.r2.carpeta_eliminar", "carpeta_r2", f"{ruta}/",
                                   {"bucket": cubeta, "archivos": borrados})
        self._db.commit()
        if borrados < len(claves):
            raise ProveedorNoDisponible(f"Se borraron {borrados} de {len(claves)} archivos. Abra la carpeta y revise qué quedó.")
        return Eliminados(archivos=borrados)
