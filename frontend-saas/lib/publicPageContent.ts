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

export async function loadPublicPageContent<T>(slug: PublicPageSlug, defaults: T): Promise<T> {
  try {
    // Vercel service bindings are injected at request time, not while building static pages.
    await connection();
    // Vercel's service binding is server-only; browser requests continue using the /api rewrite.
    const configuredBaseUrl = process.env.BACKEND_SERVICE_URL || API_URL;
    if (!configuredBaseUrl) {
      console.error(`[publicPageContent] No hay una URL de API configurada para cargar "${slug}".`);
      return defaults;
    }
    const apiBase = new URL(configuredBaseUrl);
    const basePath = apiBase.pathname.replace(/\/+$/, "");
    const apiPath = basePath.endsWith("/api") ? basePath : `${basePath}/api`;
    apiBase.pathname = `${apiPath}/contenido-publico/${encodeURIComponent(slug)}`;
    apiBase.search = "";
    apiBase.hash = "";
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
