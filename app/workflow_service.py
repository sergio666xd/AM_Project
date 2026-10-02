"""Resolve the public frontend endpoint used to start Vercel Workflows."""

import os


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


def workflow_service_headers() -> dict[str, str]:
    token = os.getenv("WORKFLOW_SERVICE_TOKEN", "").strip()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    bypass = os.getenv("VERCEL_AUTOMATION_BYPASS_SECRET", "")
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass
    return headers