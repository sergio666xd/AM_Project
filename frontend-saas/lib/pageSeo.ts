import type { Metadata } from "next";
import { cargarPagina } from "@/lib/sitioPublico";
import type { PublicPageSlug } from "@/lib/sitePageDefaults";

type PageSeo = {
  title?: string;
  description?: string;
  keywords?: string;
  noIndex?: boolean;
};

export async function generatePublicPageMetadata<T extends { seo?: PageSeo }>(
  slug: PublicPageSlug,
  defaults: T,
  pathname: string,
): Promise<Metadata> {
  const content = await cargarPagina(slug, defaults);
  const seo = content.seo ?? defaults.seo ?? {};
  const title = seo.title?.trim() || "Alejandra Muñoz Abogada y Asociados";
  const description = seo.description?.trim()
    || "Asesoría jurídica preventiva, estratégica y cercana en Sabaneta y toda Colombia.";
  const canonicalRoute = (content as T & { route?: string }).route?.trim() || pathname;
  const canonical = canonicalRoute === "/" ? "/" : canonicalRoute.replace(/\/$/, "");
  const keywords = seo.keywords?.split(",").map((keyword) => keyword.trim()).filter(Boolean);

  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "es_CO",
      siteName: "Alejandra Muñoz Abogada y Asociados",
      title,
      description,
      url: canonical,
    },
    twitter: { card: "summary", title, description },
    robots: { index: !seo.noIndex, follow: !seo.noIndex },
  };
}
