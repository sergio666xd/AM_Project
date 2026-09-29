import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

// Solo rutas públicas: no incluir login, paneles administrativos ni dashboards.
const publicPages = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1 },
  { path: "/areas-de-practica", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/quienes-somos", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/filosofia", changeFrequency: "monthly" as const, priority: 0.7 },
  { path: "/contacto", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/gestion-procesos", changeFrequency: "weekly" as const, priority: 0.9 },
  { path: "/poliza-juridica", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/politica-de-privacidad", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/tratamiento-de-datos", changeFrequency: "yearly" as const, priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
