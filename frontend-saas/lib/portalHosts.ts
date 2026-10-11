export const ADMIN_PORTAL_HOST = "admin.alejandramunozabogada.com";
export const USER_PORTAL_HOST = "panel.alejandramunozabogada.com";

const ADMIN_HOME = "/";
const CLIENT_HOME = "/";

export function homePathForRole(role: string) {
  if (role === "ADMIN") return ADMIN_HOME;
  if (role === "ABOGADO") return "/gestion-procesos/dashboard";
  if (role === "ABOGADO_ADMIN") return "/";
  if (role === "CLIENTE") return CLIENT_HOME;
  return "/gestion-procesos/auth/login";
}

export function portalHrefForRole(role: string, path?: string) {
  const destination = path || homePathForRole(role);
  if (typeof window === "undefined") return destination;

  const hostname = window.location.hostname.toLowerCase();
  if (hostname.endsWith(".localhost")) {
    const localHost = role === "ADMIN" ? "admin.localhost" : "panel.localhost";
    if (hostname === localHost) return destination;
    return `${window.location.protocol}//${localHost}${window.location.port ? `:${window.location.port}` : ""}${destination}`;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    if (destination === "/login") return role === "ADMIN" ? "/gestion-procesos/auth/admin" : "/gestion-procesos/auth/login";
    return destination;
  }

  const host = role === "ADMIN" ? ADMIN_PORTAL_HOST : USER_PORTAL_HOST;
  if (hostname === host) return destination;
  return `${window.location.protocol}//${host}${destination}`;
}

export function isLocalPortalHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized.endsWith(".localhost");
}
