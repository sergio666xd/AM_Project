import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";

// Contenido editable. Complete los datos entre corchetes antes de publicar.
export default async function PoliticaPrivacidad() {
  const content = await loadPublicPageContent("politica-de-privacidad", SITE_PAGE_DEFAULTS["politica-de-privacidad"]);
  const sections: LegalSection[] = content.sections.map((section) => ({ title: section.title, body: [...section.body] }));
  return <LegalPage title={content.title} updatedAt={content.updatedAt} sections={sections} />;
}
