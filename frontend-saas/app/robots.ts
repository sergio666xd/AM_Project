import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/gestion-procesos/admin/",
        "/gestion-procesos/dashboard/",
        "/gestion-procesos/auth/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
