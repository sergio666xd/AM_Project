import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";

// Contenido editable. Debe revisarse y completarse con los datos reales de la firma antes de publicación.
export default async function TratamientoDatos() {
  const content = await loadPublicPageContent("tratamiento-de-datos", SITE_PAGE_DEFAULTS["tratamiento-de-datos"]);
  const sections: LegalSection[] = content.sections.map((section) => ({ title: section.title, body: [...section.body] }));
  return <LegalPage title={content.title} updatedAt={content.updatedAt} sections={sections} />;
}
