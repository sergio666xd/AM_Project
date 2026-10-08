"""Resolve the public frontend endpoint used to start Vercel Workflows."""

import os


def workflow_401_reason(response) -> str:
    content_type = response.headers.get("content-type", "").lower()
    if "html" in content_type or "text/" in content_type:
        return "DEPLOYMENT_PROTECTION_OR_PROXY"
    if "json" in content_type:
        try:
            body = response.json()
        except (ValueError, AttributeError):
            body = {}
        protection = body.get("protection") or {}
        if (
            body.get("message") == "Protected by Vercel Authentication"
            or protection.get("vercel_auth_enabled") is True
        ):
            return "VERCEL_DEPLOYMENT_PROTECTED"
        code = body.get("code")
        if code in {
            "WORKFLOW_SERVICE_TOKEN_MISSING",
            "AUTHORIZATION_HEADER_MISSING",
            "WORKFLOW_SERVICE_TOKEN_MISMATCH",
        }:
            return code
    return "AUTH_REJECTED_WITHOUT_LAUNCHER_CODE"


def workflow_frontend_url() -> str:
    configured = os.getenv("WORKFLOW_FRONTEND_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    if os.getenv("NODE_ENV") == "development":
        return "http://localhost:3000"
    deployment_host = os.getenv("VERCEL_URL", "").strip()
    if deployment_host:
        return f"https://{deployment_host.removeprefix('https://').removeprefix('http://').rstrip('/')}"
    return ""


def public_site_url() -> str:
    """Return the canonical frontend origin used in user-facing notifications."""
    configured = (
        os.getenv("PUBLIC_SITE_URL", "").strip()
        or os.getenv("NEXT_PUBLIC_SITE_URL", "").strip()
        or os.getenv("VERCEL_PROJECT_PRODUCTION_URL", "").strip()
    )
    if not configured and os.getenv("NODE_ENV") == "development":
        configured = "http://localhost:3000"
    if not configured:
        configured = "https://www.alejandramunozabogada.com"
    if not configured.startswith(("http://", "https://")):
        configured = f"https://{configured}"
    return configured.rstrip("/")


def workflow_service_headers() -> dict[str, str]:
    token = os.getenv("WORKFLOW_SERVICE_TOKEN", "").strip()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    bypass = os.getenv("VERCEL_AUTOMATION_BYPASS_SECRET", "")
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass
    return headers
