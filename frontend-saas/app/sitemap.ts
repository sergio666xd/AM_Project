import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS, type PublicPageSlug } from "@/lib/sitePageDefaults";

// Solo rutas públicas: no incluir login, paneles administrativos ni dashboards.
const publicPages = [
  { path: "/", slug: "inicio" as const, changeFrequency: "weekly" as const, priority: 1 },
  { path: "/areas-de-practica", slug: "areas-de-practica" as const, changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/quienes-somos", slug: "quienes-somos" as const, changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/filosofia", slug: "filosofia" as const, changeFrequency: "monthly" as const, priority: 0.7 },
  { path: "/contacto", slug: "contacto" as const, changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/gestion-procesos", changeFrequency: "weekly" as const, priority: 0.9 },
  { path: "/poliza-juridica", slug: "poliza-juridica" as const, changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/politica-de-privacidad", slug: "politica-de-privacidad" as const, changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/tratamiento-de-datos", slug: "tratamiento-de-datos" as const, changeFrequency: "yearly" as const, priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const visiblePages = await Promise.all(publicPages.map(async ({ slug, ...page }) => {
    if (!slug) return page;
    const content = await loadPublicPageContent(slug as PublicPageSlug, SITE_PAGE_DEFAULTS[slug]);
    return (content as { seo?: { noIndex?: boolean } }).seo?.noIndex ? null : page;
  }));

  return visiblePages.filter((page) => page !== null).map(({ path, changeFrequency, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
