import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PORTAL_HOST, USER_PORTAL_HOST, isLocalPortalHost, isPreviewHost } from "@/lib/portalHosts";

const PUBLIC_HOSTS = new Set(["alejandramunozabogada.com", "www.alejandramunozabogada.com"]);
const PUBLIC_SITE_HOST = "www.alejandramunozabogada.com";
const ADMIN_LOGIN_PATH = "/gestion-procesos/auth/admin";
const CLIENT_LOGIN_PATH = "/gestion-procesos/auth/login";
const AUTH_ROUTES: Record<string, string> = {
  "/login": CLIENT_LOGIN_PATH,
  "/recuperar-password": "/gestion-procesos/auth/recuperar-password",
  "/restablecer-password": "/gestion-procesos/auth/restablecer-password",
  "/cambiar-password": "/gestion-procesos/auth/cambiar-password",
};

function redirectToHost(request: NextRequest, host: string, pathname: string) {
  const destination = request.nextUrl.clone();
  const localTarget = isLocalPortalHost(host);
  destination.protocol = localTarget ? request.nextUrl.protocol : "https:";
  destination.hostname = host;
  destination.port = localTarget ? request.nextUrl.port : "";
  destination.pathname = pathname;
  return NextResponse.redirect(destination);
}

function redirectToPath(request: NextRequest, pathname: string) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  return NextResponse.redirect(destination);
}

function stripPrefix(pathname: string, prefix: string) {
  return pathname.slice(prefix.length) || "/";
}

function compactAuthPath(pathname: string) {
  if (pathname === "/gestion-procesos/auth/admin") return "/login";
  const prefix = "/gestion-procesos/auth/";
  return pathname.startsWith(prefix) ? `/${pathname.slice(prefix.length)}` : pathname;
}

function rewrite(request: NextRequest, pathname: string) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  return NextResponse.rewrite(destination);
}

function roleFor(request: NextRequest) {
  return request.cookies.get("portal_role")?.value || "";
}

function internalRoute(area: string, path: string) {
  if (path === "/") return `/gestion-procesos/${area}`;
  if (path === "/procesos") return `/gestion-procesos/${area}/procesos`;
  if (path.startsWith("/procesos/")) {
    const suffix = path.slice("/procesos/".length);
    if (area === "abogado" && /^\d+$/.test(suffix)) return `/gestion-procesos/abogado/procesos/${suffix}/resumen`;
    return `/gestion-procesos/${area}/procesos/${suffix}`;
  }
  if (path === "/tareas" || path.startsWith("/tareas?")) return `/gestion-procesos/${area}/tareas`;
  if (path.startsWith("/tareas/")) return `/gestion-procesos/${area}/tareas/${path.slice("/tareas/".length)}`;
  if (path === "/chat" || path.startsWith("/chat/")) return `/gestion-procesos/${area}/chat${path.slice("/chat".length)}`;
  if (path === "/agenda") return `/gestion-procesos/${area}/${area === "cliente" ? "calendario" : "agenda"}`;
  if (path === "/calendario") return "/gestion-procesos/cliente/calendario";
  if (path === "/documentos" || path.startsWith("/documentos/")) return `/gestion-procesos/${area}${path}`;
  if (path === "/radicados" || path.startsWith("/radicados/")) return `/gestion-procesos/${area}${path}`;
  if (path === "/clientes" || path.startsWith("/clientes/")) return `/gestion-procesos/${area}${path}`;
  if (path === "/contratos" || path.startsWith("/contratos/")) return `/gestion-procesos/${area}${path}`;
  if (path === "/perfil" || path.startsWith("/perfil/")) return `/gestion-procesos/${area}${path}`;
  if (path === "/configuracion" || path.startsWith("/configuracion/")) return `/gestion-procesos/${area}${path}`;
  if (path === "/notificaciones" || path.startsWith("/notificaciones/")) return `/gestion-procesos/${area}${path}`;
  return `/gestion-procesos/${area}${path}`;
}

export function proxy(request: NextRequest) {
  // El encabezado Host refleja el dominio real (incluidos los previews de
  // Vercel); nextUrl.hostname puede ser el del servidor en local.
  const host = (request.headers.get("host") || request.nextUrl.hostname).split(":")[0].toLowerCase();
  const pathname = request.nextUrl.pathname;
  const local = isLocalPortalHost(host);

  // Vista previa: sin subdominios. El sitio público queda en "/" y los paneles
  // se abren en /gestion-procesos/...; solo se traducen las rutas cortas de ingreso.
  if (isPreviewHost(host)) {
    if (pathname === "/login") return rewrite(request, CLIENT_LOGIN_PATH);
    if (pathname in AUTH_ROUTES) return rewrite(request, AUTH_ROUTES[pathname]);
    return NextResponse.next();
  }
  const role = roleFor(request);
  const adminHost = host === ADMIN_PORTAL_HOST || host === "admin.localhost" || ((host === "localhost" || host === "127.0.0.1") && role === "ADMIN");
  const userHost = host === USER_PORTAL_HOST || host === "panel.localhost" || ((host === "localhost" || host === "127.0.0.1") && !adminHost);

  if (adminHost) {
    if (pathname === "/") return rewrite(request, role === "ADMIN" ? "/gestion-procesos/admin" : ADMIN_LOGIN_PATH);
    if (pathname === "/login") return rewrite(request, ADMIN_LOGIN_PATH);
    if (pathname === "/recuperar-password" || pathname === "/restablecer-password" || pathname === "/cambiar-password") {
      return rewrite(request, AUTH_ROUTES[pathname]);
    }
    if (pathname === ADMIN_LOGIN_PATH || pathname === "/gestion-procesos/auth/login") return redirectToPath(request, "/login");
    if (pathname.startsWith("/gestion-procesos/auth/")) return redirectToPath(request, compactAuthPath(pathname));
    if (pathname === "/gestion-procesos/admin" || pathname.startsWith("/gestion-procesos/admin/")) {
      return redirectToPath(request, stripPrefix(pathname, "/gestion-procesos/admin"));
    }
    if (pathname.startsWith("/gestion-procesos/")) return NextResponse.next();
    return rewrite(request, `/gestion-procesos/admin${pathname}`);
  }

  if (userHost) {
    if (pathname === "/") {
      if (role === "ADMIN") return redirectToHost(request, local ? "admin.localhost" : ADMIN_PORTAL_HOST, "/");
      const area = role === "ABOGADO_ADMIN" ? "abogado" : role === "ABOGADO" ? "dashboard" : "cliente";
      return rewrite(request, role ? `/gestion-procesos/${area}` : CLIENT_LOGIN_PATH);
    }
    if (pathname === "/login") return rewrite(request, CLIENT_LOGIN_PATH);
    if (pathname in AUTH_ROUTES && pathname !== "/login") return rewrite(request, AUTH_ROUTES[pathname]);
    if (pathname === "/gestion-procesos/admin" || pathname.startsWith("/gestion-procesos/admin/")) {
      return redirectToHost(request, local ? "admin.localhost" : ADMIN_PORTAL_HOST, stripPrefix(pathname, "/gestion-procesos/admin"));
    }
    if (pathname === ADMIN_LOGIN_PATH) {
      if (local && host !== "panel.localhost") return NextResponse.next();
      return redirectToHost(request, local ? "admin.localhost" : ADMIN_PORTAL_HOST, "/login");
    }
    if (pathname === CLIENT_LOGIN_PATH || pathname === "/gestion-procesos/auth/login") return redirectToPath(request, "/login");
    if (pathname.startsWith("/gestion-procesos/auth/")) return redirectToPath(request, compactAuthPath(pathname));
    if (pathname === "/gestion-procesos/cliente" || pathname.startsWith("/gestion-procesos/cliente/")) {
      return redirectToPath(request, stripPrefix(pathname, "/gestion-procesos/cliente"));
    }
    if ((pathname === "/gestion-procesos/abogado" || pathname.startsWith("/gestion-procesos/abogado/")) && role !== "ABOGADO") {
      return redirectToPath(request, stripPrefix(pathname, "/gestion-procesos/abogado"));
    }
    if (!local && pathname === "/gestion-procesos/auth/registro") return redirectToHost(request, PUBLIC_SITE_HOST, pathname);

    if (pathname.startsWith("/gestion-procesos/")) return NextResponse.next();
    const lawyerRoute = /^\/procesos\/\d+(?:\/(?:resumen|folios|agenda|documentos|radicados|tareas|relaciones|actividad))?$/.test(pathname)
      || /^\/(?:tareas|radicados|documentos)(?:\/|$)/.test(pathname)
      || pathname === "/agenda";
    const area = role === "ABOGADO_ADMIN" || (!role && lawyerRoute) ? "abogado" : role === "ABOGADO" ? "dashboard" : "cliente";
    return rewrite(request, internalRoute(area, pathname));
  }

  if (!local && PUBLIC_HOSTS.has(host)) {
    if (pathname === ADMIN_LOGIN_PATH) return redirectToHost(request, ADMIN_PORTAL_HOST, "/login");
    if (pathname === "/gestion-procesos/admin" || pathname.startsWith("/gestion-procesos/admin/")) {
      return redirectToHost(request, ADMIN_PORTAL_HOST, stripPrefix(pathname, "/gestion-procesos/admin"));
    }
    if (pathname === "/gestion-procesos/cliente" || pathname.startsWith("/gestion-procesos/cliente/")) {
      return redirectToHost(request, USER_PORTAL_HOST, stripPrefix(pathname, "/gestion-procesos/cliente"));
    }
    if (pathname === "/gestion-procesos/abogado" || pathname.startsWith("/gestion-procesos/abogado/")) {
      return redirectToHost(request, USER_PORTAL_HOST, stripPrefix(pathname, "/gestion-procesos/abogado"));
    }
    if (pathname === CLIENT_LOGIN_PATH || pathname === "/login") return redirectToHost(request, USER_PORTAL_HOST, "/login");
    if (pathname in AUTH_ROUTES && pathname !== "/login") return redirectToHost(request, USER_PORTAL_HOST, pathname);
    if (pathname.startsWith("/gestion-procesos/auth/")) {
      const compactPath = compactAuthPath(pathname);
      const targetHost = pathname === ADMIN_LOGIN_PATH ? ADMIN_PORTAL_HOST : USER_PORTAL_HOST;
      return redirectToHost(request, targetHost, compactPath);
    }
  }

  if (!local && host !== ADMIN_PORTAL_HOST && pathname === ADMIN_LOGIN_PATH) {
    return redirectToHost(request, ADMIN_PORTAL_HOST, "/login");
  }

  return NextResponse.next();
}

export const config = {
  // Portal URLs son rutas arbitrarias de primer nivel (/usuarios, /operacion,
  // /ayuda, etc.). Interceptar todas evita que caigan en el 404 público de Next.
  // API, assets, Workflow y archivos estáticos mantienen su manejo propio.
  matcher: ["/((?!api/|_next/|\\.well-known/|robots\\.txt$|sitemap\\.xml$|favicon\\.ico$|.*\\.[^/]+$).*)"],
};
