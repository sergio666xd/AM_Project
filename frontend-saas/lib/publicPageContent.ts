// import { API_URL } from "@/lib/api";
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
    const response = await fetch(`https://alejandramunozabogada.vercel.app/api/contenido-publico/${slug}`, { cache: "no-store" });
    if (!response.ok) return defaults;
    const data: { contenido?: unknown } = await response.json();
    return mergeContent(defaults, data.contenido);
  } catch {
    return defaults;
  }
}