import { DocumentoLegal } from "@/components/sitio/DocumentoLegal";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { valoresPolitica } from "@/lib/datosResponsable";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("tratamiento-de-datos", SITE_PAGE_DEFAULTS["tratamiento-de-datos"], "/tratamiento-de-datos");
}

// El texto lo edita la administración en Sitio público › Contenido.
export default async function TratamientoDatos() {
  const [contenido, contacto] = await Promise.all([cargarPagina("tratamiento-de-datos", SITE_PAGE_DEFAULTS["tratamiento-de-datos"]), cargarContacto()]);
  return (
    <DocumentoLegal
      titulo={contenido.title}
      actualizada={contenido.updatedAt}
      secciones={contenido.sections}
      valores={valoresPolitica(contacto)}
      otro={{ href: "/politica-de-privacidad", label: "Política de privacidad" }}
    />
  );
}
