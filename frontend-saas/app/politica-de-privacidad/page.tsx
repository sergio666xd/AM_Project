import { DocumentoLegal } from "@/components/sitio/DocumentoLegal";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { valoresPolitica } from "@/lib/datosResponsable";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("politica-de-privacidad", SITE_PAGE_DEFAULTS["politica-de-privacidad"], "/politica-de-privacidad");
}

// El texto lo edita la administración en Sitio público › Contenido.
export default async function PoliticaPrivacidad() {
  const [contenido, contacto] = await Promise.all([cargarPagina("politica-de-privacidad", SITE_PAGE_DEFAULTS["politica-de-privacidad"]), cargarContacto()]);
  return (
    <DocumentoLegal
      titulo={contenido.title}
      actualizada={contenido.updatedAt}
      secciones={contenido.sections}
      valores={valoresPolitica(contacto, { responsable: contenido.responsable, documento: contenido.documento })}
      otro={{ href: "/tratamiento-de-datos", label: "Política de tratamiento de datos personales" }}
    />
  );
}
