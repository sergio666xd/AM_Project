"""Cliente privado para Cloudflare R2 mediante su API compatible con S3."""

import os
from functools import lru_cache

import boto3
from botocore.client import Config
from fastapi import HTTPException, status


@lru_cache
def get_r2_client():
    """Crea un cliente S3 para R2 sin exponer nunca sus credenciales al navegador."""
    account_id = os.getenv("R2_ACCOUNT_ID", "")
    access_key_id = os.getenv("R2_ACCESS_KEY_ID", "")
    secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY", "")

    if not all([account_id, access_key_id, secret_access_key]):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El almacenamiento de documentos no está configurado.",
        )

    endpoint_url = os.getenv("R2_ENDPOINT_URL") or f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def get_r2_system_bucket() -> str:
    """Bucket for files belonging to the case-management system."""
    bucket = os.getenv("R2_SYSTEM_BUCKET_NAME") or os.getenv("R2_BUCKET_NAME", "")
    if not bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El almacenamiento de documentos no está configurado.",
        )
    return bucket


def get_r2_tp_registros_bucket() -> str:
    """Bucket reserved for professional registration documents."""
    bucket = os.getenv("R2_TP_REGISTROS_BUCKET_NAME") or os.getenv("R2_BUCKET_NAME", "")
    if not bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El almacenamiento de registros profesionales no está configurado.",
        )
    return bucket


def get_r2_bucket() -> str:
    """Backward-compatible name for the system bucket."""
    return get_r2_system_bucket()
