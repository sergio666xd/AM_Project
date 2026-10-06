import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { resolvePublicPageRoute } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import HomePage from "../page";
import QuienesSomosPage from "../quienes-somos/page";
import AreasDePracticaPage from "../areas-de-practica/page";
import FilosofiaPage from "../filosofia/page";
import ContactoPage from "../contacto/page";
import PolizaJuridicaPage from "../poliza-juridica/page";
import PoliticaPrivacidadPage from "../politica-de-privacidad/page";
import TratamientoDatosPage from "../tratamiento-de-datos/page";

type Props = { params: Promise<{ path: string[] }> };

async function resolvePath(params: Props["params"]) {
  const { path } = await params;
  return resolvePublicPageRoute(`/${path.join("/")}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolvePath(params);
  if (!resolved) return { title: "Página no encontrada", robots: { index: false, follow: false } };
  return generatePublicPageMetadata(resolved.slug, SITE_PAGE_DEFAULTS[resolved.slug], resolved.ruta);
}

export default async function PublicRouteAliasPage({ params }: Props) {
  const resolved = await resolvePath(params);
  if (!resolved) notFound();

  switch (resolved.slug) {
    case "inicio": return <HomePage />;
    case "quienes-somos": return <QuienesSomosPage />;
    case "areas-de-practica": return <AreasDePracticaPage />;
    case "filosofia": return <FilosofiaPage />;
    case "contacto": return <ContactoPage />;
    case "poliza-juridica": return <PolizaJuridicaPage />;
    case "politica-de-privacidad": return <PoliticaPrivacidadPage />;
    case "tratamiento-de-datos": return <TratamientoDatosPage />;
  }
}
