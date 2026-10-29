import { DocumentoLegal } from "@/components/sitio/DocumentoLegal";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("tratamiento-de-datos", SITE_PAGE_DEFAULTS["tratamiento-de-datos"], "/tratamiento-de-datos");
}

// El texto lo edita la administración en Sitio público › Contenido.
export default async function TratamientoDatos() {
  const contenido = await cargarPagina("tratamiento-de-datos", SITE_PAGE_DEFAULTS["tratamiento-de-datos"]);
  return (
    <DocumentoLegal
      titulo={contenido.title}
      actualizada={contenido.updatedAt}
      secciones={contenido.sections}
      otro={{ href: "/politica-de-privacidad", label: "Política de privacidad" }}
    />
  );
}
