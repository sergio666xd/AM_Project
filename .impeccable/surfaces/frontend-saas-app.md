---
version: 1
slug: "frontend-saas-app"
primary_target: "frontend-saas/app"
related_targets: []
---

# Surface brief: paneles de Gestión de Procesos (prototipo Fase 0)

Scope: app panels (abogado, cliente, administración) plus login; visitor mode Operate. Public marketing site is a separate Persuade surface (later round).

Audience and job: lawyer on desktop at the office reviewing new court actuaciones and acting on them; same lawyer on mobile for quick actions; clients mostly over 40 reading case status and delivering documents.

Constraints: logo mark fixed (layout may change), Georgia is the logo face, navy/gold stay in the logo's range. Standard web controls and navigation.

Unresolved: public site direction; billing rules (plan.md).

## Direction contract

THESIS: Each case is one continuous, foliated expediente. Every actuación, document, task, message and contract takes the next folio number in a single sequence, so the history reads like the court file a lawyer already trusts. Refuses the category default of KPI tiles and disconnected module pages.

OWN-WORLD: Navy shell rail from the logo; pale manila ground for carátula surfaces (case headers, filters) against bright white sheets for content; gold reserved for folio stamps, the active tab edge and "what the firm awaits". Georgia for titles and folio numerals (old-style figures), Public Sans for interface and reading, Roboto Mono for radicados. Medium density for the lawyer, larger type and spacing for the client.

STORY: The lawyer opens Hoy, sees the folios added since their last visit grouped by expediente, and acts in place: notify the client, create a task, compute the deadline. Opening a case shows its carátula and the continuous folio history behind tabs.

FIRST VIEWPORT: Desktop Hoy: navy left rail (logo lockup, grouped navigation), top bar with global search and bell; main column "Folios nuevos" listing new actuaciones per expediente, each with a gold folio stamp at the right margin and inline actions; right column "Vence pronto" with business-day countdown and today's agenda. Primary action sits on each folio row. Mobile: same queue, bottom bar with four sections plus Más.

FORM: Expediente foliado, candidate 1 of my ordered list, chosen by the user over the assigned candidate 7 (membrete). seed:cc52763ddccab8f4

Signature interaction: folio stamps plus "ir al folio" jump; new folios since last visit marked with a gold edge that settles after review.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
