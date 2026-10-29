---
version: 1
slug: "frontend-saas-components-sitio"
primary_target: "frontend-saas/components/sitio"
related_targets: ["frontend-saas/app/page.tsx"]
---

# Surface brief: sitio público de la firma

Scope: public site at www.alejandramunozabogada.com (inicio, áreas de práctica, póliza jurídica, quiénes somos, filosofía, contacto, páginas legales, 404). Visitor mode Persuade, inside the established expediente world of the app. The admin login lives at its own address and is never linked from here.

Audience and job: people and small businesses near Sabaneta or anywhere in Colombia, mostly over 40, with a legal decision ahead (a contract, an inheritance, a building's arrears, an entity). The job is to understand what the firm does and write to it in one step. Copy comes from the firm's CMS content (contenido_paginas); nothing is invented: no figures, testimonials, outcomes or response times.

Constraints: CMS keys stay compatible (inicio, quienes-somos, areas-de-practica, filosofia, contacto, poliza-juridica, politica-de-privacidad, tratamiento-de-datos). The form posts to /api/v2/sitio/mensajes. Contact data comes from /api/v2/sitio/contacto and may be hidden by the admin.

## Direction contract

THESIS: The home page is the firm's own carátula. The visitor opens the firm's folder: identity on a manila cover, carátula tabs as navigation, and the open tab is a white sheet holding the consultation form. Refuses the category default of a stock-photo hero, service cards and a contact page three clicks away.

OWN-WORLD: Same materials as the client portal: manila ground, manila carátula with top-only radius, white sheets joined below it, navy for text actions and the one primary button, gold only on the active tab's top edge. Georgia for the firm's name, page titles and the CMS headline; Public Sans 17px for reading; tags in sentence case. No photography, no icons as decoration.

STORY: The visitor reads who attends, which matters the firm handles and how (Sabaneta with appointment, or virtual), picks the area of their matter as a chip, leaves name and WhatsApp or email, and sends. They see a confirmation in place that says what happens next and how the firm will answer.

FIRST VIEWPORT: Desktop 1440x900: white header with the landscape logo left and a single "Portal de clientes" button right. Below, the carátula spans the 1180px column: two tags (city, national reach), the CMS hero title in Georgia ~56px, the lead, and a three-row definition list (Atiende, Asuntos, Modalidad). Carátula tabs sit on its bottom edge; "Cuéntenos su caso" is active and joins the white sheet that holds the working form (area chips, name, WhatsApp or email, message, consent, "Enviar mi consulta"). WhatsApp line beside the send button. Mobile: same order, tabs scroll horizontally, form in one column.

FORM: La carátula de la firma, candidate 1 of my ordered list, chosen by the user on the decision board. seed:c188a418040e4348

Signature interaction: the carátula tabs are the site's navigation on every page. The current section's tab is the white sheet with the gold top edge, joined to the page body, so moving through the site reads as opening another section of the same folder (home: "Cuéntenos su caso"). The send button swaps the form for the confirmation sheet without a page change.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
