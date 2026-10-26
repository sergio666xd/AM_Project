"""Gestor de archivos del almacenamiento R2."""

from urllib.parse import quote

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, storage
from app.audit import registrar_evento_auditoria
from app.database import get_db
from app.routers.admin.comun import logger, verificar_admin

router = APIRouter(prefix="/api/admin", tags=["Administración"])


def _r2_bucket_admin(scope: str) -> str:
    if scope == "system":
        return storage.get_r2_system_bucket()
    if scope == "tp-registros":
        return storage.get_r2_tp_registros_bucket()
    raise HTTPException(status_code=400, detail="Bucket no válido.")


@router.get("/almacenamiento/archivos")
def listar_archivos_r2_admin(
    scope: str = Query("system", pattern="^(system|tp-registros)$"),
    prefix: str = Query("", max_length=1024),
    continuation_token: str | None = Query(None),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    prefix = prefix.strip("/")
    if "\\" in prefix or any(part == ".." for part in prefix.split("/")):
        raise HTTPException(status_code=400, detail="La carpeta seleccionada no es válida.")
    if prefix:
        prefix += "/"
    bucket = _r2_bucket_admin(scope)
    params = {"Bucket": bucket, "MaxKeys": 500, "Delimiter": "/", "Prefix": prefix}
    if continuation_token:
        params["ContinuationToken"] = continuation_token
    try:
        result = storage.get_r2_client().list_objects_v2(**params)
    except ClientError as exc:
        error_code = str(exc.response.get("Error", {}).get("Code") or "Unknown")
        logger.exception("R2 rechazó el listado del bucket %s en el prefijo %s (código %s).", bucket, prefix, error_code)
        if error_code in {"NoSuchBucket", "404"}:
            raise HTTPException(status_code=404, detail=f"R2 no reconoce el bucket configurado '{bucket}'. Un bucket vacío debe responder sin error; revisa el nombre y la cuenta de R2.") from exc
        if error_code in {"AccessDenied", "Unauthorized", "InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            raise HTTPException(status_code=403, detail="Las credenciales de R2 no tienen acceso de lectura a este bucket. Revisa el token y sus permisos.") from exc
        if error_code in {"InvalidToken", "InvalidArgument"} and continuation_token:
            raise HTTPException(status_code=400, detail="La página guardada ya no es válida. Vuelve a la raíz del bucket y carga de nuevo.") from exc
        raise HTTPException(status_code=502, detail=f"R2 no pudo listar el bucket (código: {error_code}).") from exc
    except BotoCoreError as exc:
        logger.exception("Error de conexión con R2 al listar el bucket %s y el prefijo %s.", bucket, prefix)
        raise HTTPException(status_code=502, detail="No fue posible conectar con R2 para listar el almacenamiento.") from exc

    contents = [item for item in result.get("Contents", []) if item.get("Key") != prefix]
    folders = [
        {"prefix": item["Prefix"], "name": item["Prefix"][len(prefix):].strip("/")}
        for item in result.get("CommonPrefixes", [])
    ]
    keys = [item["Key"] for item in contents]
    associations: dict[str, list[dict]] = {}
    matched_documents = db.query(models.DocumentoProceso).filter(models.DocumentoProceso.ruta_archivo.in_(keys)).all() if keys else []
    for document in matched_documents:
        associations.setdefault(document.ruta_archivo, []).append({
            "tipo": "documento", "id": document.id, "nombre": document.nombre_archivo,
            "proceso": document.proceso.nombre if document.proceso else None,
            "cliente": document.cliente.nombre_completo if document.cliente else None,
            "solicitud": document.solicitud.titulo if document.solicitud else None,
            "contrato_id": document.contrato_id,
        })
    matched_registrations = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.ruta_tarjeta_profesional.in_(keys)).all() if keys else []
    for request in matched_registrations:
        if request.ruta_tarjeta_profesional:
            associations.setdefault(request.ruta_tarjeta_profesional, []).append({
                "tipo": "tarjeta_profesional", "id": request.id, "nombre": "Tarjeta profesional",
                "usuario": request.usuario.nombre_completo if request.usuario else "Usuario eliminado",
            })
    files = []
    for item in contents:
        key = item["Key"]
        refs = associations.get(key, [])
        files.append({
            "key": key, "size": item.get("Size", 0),
            "last_modified": item.get("LastModified").isoformat() if item.get("LastModified") else None,
            "etag": (item.get("ETag") or "").strip('"'), "associations": refs, "orphan": not refs,
        })
    return {"scope": scope, "bucket": bucket, "prefix": prefix,
            "folders": folders, "files": files,
            "is_truncated": result.get("IsTruncated", False),
            "next_token": result.get("NextContinuationToken")}


@router.get("/almacenamiento/archivos/url-temporal")
def url_temporal_archivo_r2_admin(
    scope: str = Query("system", pattern="^(system|tp-registros)$"),
    key: str = Query(..., min_length=1, max_length=1024),
    download: bool = Query(False),
    admin: models.Usuario = Depends(verificar_admin),
):
    if "\\" in key or any(part == ".." for part in key.split("/")):
        raise HTTPException(status_code=400, detail="La clave del archivo no es válida.")
    bucket = _r2_bucket_admin(scope)
    client = storage.get_r2_client()
    try:
        metadata = client.head_object(Bucket=bucket, Key=key)
        filename = key.rsplit("/", 1)[-1]
        disposition = "attachment" if download else "inline"
        url = client.generate_presigned_url("get_object", Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
        }, ExpiresIn=900)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "NotFound", "404"}:
            raise HTTPException(status_code=404, detail="El archivo no existe en este bucket.") from exc
        raise HTTPException(status_code=502, detail="No fue posible preparar el acceso al archivo.") from exc
    except (BotoCoreError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible preparar el acceso al archivo.") from exc
    return {"url": url, "content_type": metadata.get("ContentType") or "application/octet-stream",
            "expires_in": 900, "filename": key.rsplit("/", 1)[-1]}


@router.post("/almacenamiento/carpetas/eliminar")
def eliminar_carpeta_r2_admin(
    datos: dict = Body(...), db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    scope = str(datos.get("scope") or "")
    prefix = str(datos.get("prefix") or "").strip("/")
    if not prefix or len(prefix) > 1024 or "\\" in prefix or any(part == ".." for part in prefix.split("/")):
        raise HTTPException(status_code=400, detail="Selecciona una carpeta válida; no se permite eliminar la raíz del bucket.")
    if datos.get("confirmacion") != "ELIMINAR CARPETA":
        raise HTTPException(status_code=400, detail="Escribe ELIMINAR CARPETA para confirmar la operación.")

    folder_prefix = f"{prefix}/"
    bucket = _r2_bucket_admin(scope)
    client = storage.get_r2_client()
    keys: list[str] = []
    continuation_token = None
    try:
        while True:
            params = {"Bucket": bucket, "Prefix": folder_prefix, "MaxKeys": 1000}
            if continuation_token:
                params["ContinuationToken"] = continuation_token
            result = client.list_objects_v2(**params)
            keys.extend(item["Key"] for item in result.get("Contents", []))
            if len(keys) > 10000:
                raise HTTPException(status_code=413, detail="La carpeta contiene más de 10.000 objetos. Elimínala por subcarpetas para controlar la operación.")
            if not result.get("IsTruncated"):
                break
            continuation_token = result.get("NextContinuationToken")
            if not continuation_token:
                raise RuntimeError("R2 no devolvió el token para continuar el listado.")
    except HTTPException:
        raise
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible revisar el contenido de la carpeta en R2.") from exc

    if not keys:
        return {"mensaje": "La carpeta ya está vacía.", "archivos_eliminados": 0, "asociaciones_eliminadas": 0}

    documents = db.query(models.DocumentoProceso).filter(models.DocumentoProceso.ruta_archivo.in_(keys)).all()
    requests = db.query(models.SolicitudRegistro).filter(models.SolicitudRegistro.ruta_tarjeta_profesional.in_(keys)).all()
    for document in documents:
        db.delete(document)
    for request in requests:
        request.ruta_tarjeta_profesional = None
    registrar_evento_auditoria(db, admin, "admin.r2.desvincular_carpeta", "carpeta_r2", folder_prefix,
        {"bucket": bucket, "archivos": len(keys), "documentos": len(documents), "solicitudes_registro": len(requests)})
    db.commit()

    try:
        for start in range(0, len(keys), 1000):
            response = client.delete_objects(Bucket=bucket, Delete={
                "Objects": [{"Key": key} for key in keys[start:start + 1000]],
                "Quiet": False,
            })
            errors = response.get("Errors", [])
            if errors:
                raise RuntimeError(f"R2 rechazó {len(errors)} eliminaciones.")
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="Se retiraron las asociaciones, pero R2 no confirmó la eliminación completa. Actualiza el gestor y elimina los objetos restantes.") from exc

    registrar_evento_auditoria(db, admin, "admin.r2.carpeta_eliminar", "carpeta_r2", folder_prefix,
        {"bucket": bucket, "archivos": len(keys)})
    db.commit()
    return {"mensaje": f"Carpeta eliminada: {len(keys)} archivo(s) y sus asociaciones retiradas.",
            "archivos_eliminados": len(keys), "asociaciones_eliminadas": len(documents) + len(requests)}


@router.post("/almacenamiento/archivos/eliminar")
def eliminar_archivo_r2_admin(
    datos: dict = Body(...), db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    scope, key = str(datos.get("scope") or ""), str(datos.get("key") or "")
    if not key or len(key) > 1024:
        raise HTTPException(status_code=400, detail="Indica una clave de archivo válida.")
    bucket = _r2_bucket_admin(scope)
    client = storage.get_r2_client()
    try:
        client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "NotFound", "404"}:
            raise HTTPException(status_code=404, detail="El objeto ya no existe en R2.") from exc
        raise HTTPException(status_code=502, detail="No fue posible comprobar el archivo en R2.") from exc
    except (BotoCoreError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="No fue posible comprobar el archivo en R2.") from exc

    documents = db.query(models.DocumentoProceso).filter_by(ruta_archivo=key).all()
    requests = db.query(models.SolicitudRegistro).filter_by(ruta_tarjeta_profesional=key).all()
    if (documents or requests) and datos.get("confirmar_asociaciones") is not True:
        raise HTTPException(status_code=409, detail="El archivo tiene asociaciones; confirma explícitamente que también se retiren.")
    for document in documents:
        db.delete(document)
    for request in requests:
        request.ruta_tarjeta_profesional = None
    registrar_evento_auditoria(db, admin, "admin.r2.desvincular", "archivo_r2", key,
        {"bucket": bucket, "documentos": len(documents), "solicitudes_registro": len(requests)})
    db.commit()
    try:
        client.delete_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="Se retiraron las asociaciones, pero R2 no confirmó el borrado. El objeto quedó disponible para reintentar.") from exc
    registrar_evento_auditoria(db, admin, "admin.r2.eliminar", "archivo_r2", key, {"bucket": bucket})
    db.commit()
    return {"mensaje": "Archivo eliminado de R2 y asociaciones retiradas.",
            "asociaciones_eliminadas": len(documents) + len(requests)}


@router.post("/almacenamiento/archivos/mover-a-sistema")
def mover_archivo_r2_a_sistema_admin(
    datos: dict = Body(...), db: Session = Depends(get_db),
    admin: models.Usuario = Depends(verificar_admin),
):
    key = str(datos.get("key") or "")
    if not key or len(key) > 1024:
        raise HTTPException(status_code=400, detail="Indica una clave de archivo válida.")
    source, target = storage.get_r2_tp_registros_bucket(), storage.get_r2_system_bucket()
    if source == target:
        raise HTTPException(status_code=409, detail="Configura buckets distintos antes de migrar archivos.")
    if db.query(models.SolicitudRegistro.id).filter_by(ruta_tarjeta_profesional=key).first():
        raise HTTPException(status_code=409, detail="Las tarjetas profesionales deben permanecer en el bucket tp-registros.")
    client = storage.get_r2_client()
    try:
        client.head_object(Bucket=source, Key=key)
        try:
            client.head_object(Bucket=target, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {"NoSuchKey", "NotFound", "404"}:
                raise
        else:
            raise HTTPException(status_code=409, detail="Ya existe esa clave en el bucket del sistema.")
        client.copy_object(Bucket=target, Key=key, CopySource={"Bucket": source, "Key": key})
        client.head_object(Bucket=target, Key=key)
        client.delete_object(Bucket=source, Key=key)
    except HTTPException:
        raise
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail="No se pudo mover el archivo al bucket del sistema.") from exc
    registrar_evento_auditoria(db, admin, "admin.r2.mover_a_sistema", "archivo_r2", key,
        {"desde": source, "hacia": target})
    db.commit()
    return {"mensaje": "Archivo movido al bucket del sistema.", "bucket": target, "key": key}
