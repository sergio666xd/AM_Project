"""Resolve the public frontend endpoint used to start Vercel Workflows."""

import ipaddress
import os
from urllib.parse import urlsplit, urlunsplit


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


def _portal_origin(role: object) -> str:
    role_value = getattr(role, "value", role)
    role_name = str(role_value or "").upper()
    if role_name == "ADMIN":
        setting = "ADMIN_PORTAL_URL"
        default = "https://admin.alejandramunozabogada.com"
    elif role_name in {"CLIENTE", "ABOGADO_ADMIN"}:
        setting = "USER_PORTAL_URL"
        default = "https://panel.alejandramunozabogada.com"
    else:
        setting = ""
        default = ""

    configured = os.getenv(setting, "").strip() if setting else ""
    if not configured:
        # Local frontend origins are useful in development, but a generic
        # production site URL must not override the role-specific subdomains.
        for variable in ("FRONTEND_URL", "PUBLIC_SITE_URL", "NEXT_PUBLIC_SITE_URL"):
            candidate = os.getenv(variable, "").strip()
            if not candidate:
                continue
            if not candidate.startswith(("http://", "https://")):
                candidate = f"https://{candidate}"
            parsed_candidate = urlsplit(candidate)
            hostname = (parsed_candidate.hostname or "").lower()
            try:
                is_private_host = ipaddress.ip_address(hostname).is_private
            except ValueError:
                is_private_host = False
            if hostname in {"localhost", "127.0.0.1", "::1"} or hostname.endswith(".localhost") or is_private_host:
                configured = candidate
                break
    if not configured and os.getenv("NODE_ENV") == "development":
        configured = "http://localhost:3000"

    if not setting:
        # The SaaS lawyer portal keeps its existing origin and route scheme.
        return configured.rstrip("/") if configured else public_site_url()
    configured = configured or default
    if not configured.startswith(("http://", "https://")):
        configured = f"https://{configured}"
    parsed = urlsplit(configured)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return default
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")


def compact_portal_path(user_or_role: object, path: str) -> str:
    """Remove the role route prefix; the recipient's portal host carries the role."""
    role = getattr(user_or_role, "rol", user_or_role)
    role_value = getattr(role, "value", role)
    role_name = str(role_value or "").upper()
    route = path if path.startswith("/") else f"/{path}"
    role_prefix = {
        "CLIENTE": "/gestion-procesos/cliente",
        "ABOGADO_ADMIN": "/gestion-procesos/abogado",
        "ADMIN": "/gestion-procesos/admin",
    }.get(role_name)
    if role_prefix and (route == role_prefix or route.startswith(f"{role_prefix}/")):
        route = route[len(role_prefix):] or "/"
    auth_prefix = "/gestion-procesos/auth/"
    if route.startswith(auth_prefix):
        route = f"/{route[len(auth_prefix):]}"
    return route


def user_portal_url(user_or_role: object, path: str) -> str:
    """Build a role-aware absolute URL with a short path on the role subdomain."""
    role = getattr(user_or_role, "rol", user_or_role)
    route = compact_portal_path(role, path)
    return f"{_portal_origin(role)}{route}"


def chat_conversation_url(recipient: object, process_id: int, other_user_id: int) -> str:
    return user_portal_url(recipient, f"/chat/{process_id}/{other_user_id}")


def workflow_service_headers() -> dict[str, str]:
    token = os.getenv("WORKFLOW_SERVICE_TOKEN", "").strip()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    bypass = os.getenv("VERCEL_AUTOMATION_BYPASS_SECRET", "")
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass
    return headers
