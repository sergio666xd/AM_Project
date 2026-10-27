import { API_URL } from "@/lib/api";
import { connection } from "next/server";
import type { PublicPageSlug } from "@/lib/sitePageDefaults";

function mergeContent<T>(defaults: T, override: unknown): T {
  if (Array.isArray(override)) return override as T;
  if (
    defaults !== null && typeof defaults === "object" &&
    override !== null && typeof override === "object"
  ) {
    const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      merged[key] = key in merged ? mergeContent(merged[key], value) : value;
    }
    return merged as T;
  }
  return (override ?? defaults) as T;
}

// URL absoluta de la API para peticiones hechas desde el servidor.
export function serverApiUrl(path: string): URL | null {
  const configuredBaseUrl = process.env.BACKEND_SERVICE_URL || API_URL;
  if (!configuredBaseUrl) return null;
  const apiBase = new URL(configuredBaseUrl);
  const basePath = apiBase.pathname.replace(/\/+$/, "");
  const apiPath = basePath.endsWith("/api") ? basePath : `${basePath}/api`;
  apiBase.pathname = `${apiPath}${path}`;
  apiBase.search = "";
  apiBase.hash = "";
  return apiBase;
}

export async function loadPublicPageContent<T>(slug: PublicPageSlug, defaults: T): Promise<T> {
  try {
    // Vercel service bindings are injected at request time, not while building static pages.
    await connection();
    // Vercel's service binding is server-only; browser requests continue using the /api rewrite.
    const apiBase = serverApiUrl(`/contenido-publico/${encodeURIComponent(slug)}`);
    if (!apiBase) {
      console.error(`[publicPageContent] No hay una URL de API configurada para cargar "${slug}".`);
      return defaults;
    }
    const response = await fetch(apiBase, { cache: "no-store" });
    if (!response.ok) {
      console.error(`[publicPageContent] La API respondió ${response.status} al cargar "${slug}".`);
      return defaults;
    }
    const data: { contenido?: unknown } = await response.json();
    return mergeContent(defaults, data.contenido);
  } catch (error) {
    console.error(`[publicPageContent] No se pudo cargar "${slug}" desde la API.`, error);
    return defaults;
  }
}
