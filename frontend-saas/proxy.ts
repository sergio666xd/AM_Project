import { NextResponse, type NextRequest } from "next/server";

const STATIC_PUBLIC_PATHS = new Set([
  "/",
  "/quienes-somos",
  "/areas-de-practica",
  "/filosofia",
  "/contacto",
  "/poliza-juridica",
  "/politica-de-privacidad",
  "/tratamiento-de-datos",
]);

const PUBLIC_PAGE_SLUGS = new Set([
  "inicio",
  "quienes-somos",
  "areas-de-practica",
  "filosofia",
  "contacto",
  "poliza-juridica",
  "politica-de-privacidad",
  "tratamiento-de-datos",
]);

function routeResolverUrl(route: string): URL | null {
  const configuredBaseUrl = process.env.BACKEND_SERVICE_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!configuredBaseUrl) return null;

  try {
    const apiBase = new URL(configuredBaseUrl);
    const basePath = apiBase.pathname.replace(/\/+$/, "");
    const apiPath = basePath.endsWith("/api") ? basePath : `${basePath}/api`;
    apiBase.pathname = `${apiPath}/contenido-publico/ruta/resolver`;
    apiBase.search = new URLSearchParams({ ruta: route }).toString();
    apiBase.hash = "";
    return apiBase;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  if (STATIC_PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const resolverUrl = routeResolverUrl(pathname);
  if (!resolverUrl) return NextResponse.next();

  try {
    const response = await fetch(resolverUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return NextResponse.next();

    const result: { slug?: string } = await response.json();
    if (!result.slug || !PUBLIC_PAGE_SLUGS.has(result.slug)) return NextResponse.next();

    const destination = request.nextUrl.clone();
    destination.pathname = result.slug === "inicio" ? "/" : `/${result.slug}`;
    return NextResponse.rewrite(destination);
  } catch {
    // Unknown paths should continue to Next's normal 404 handling if the API is unavailable.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!api/|_next/|gestion-procesos/|robots.txt|sitemap.xml|favicon.ico|.*\\.[^/]+$).*)"],
};
