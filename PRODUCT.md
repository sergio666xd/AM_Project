# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal application for one law firm: **Alejandra Muñoz | Abogada y Asociados** (Sabaneta, Antioquia; serves all of Colombia).

- `ABOGADO_ADMIN` (directora/socia): runs the firm's caseload, issues contracts and charges, sees every case file.
- `ABOGADO` (abogado asociado): works only the case files they own or are assigned to.
- `CLIENTE`: follows their own cases, delivers requested documents, completes assigned tasks, reads messages, sees their contract and charges.
- `ADMIN`: operates the platform for the firm (users, judicial queries, integrations, templates, audit, site content).

Primary user: the lawyer, mostly on desktop at the office. Mobile must still be excellent for quick actions (notify, create task, check today) and easy reading. Clients span a wide age range, mostly over 40: larger type, plain language, obvious actions, no hidden gestures.

## Product Purpose

Keep every judicial case of the firm in one place: case files (procesos) linked to court filings (radicados) whose actuaciones are pulled daily from the Rama Judicial API, plus tasks, agenda, documents, client communication, service contracts and billing. Success: no actuación goes unnoticed, every deadline becomes a task, and clients understand where their case stands without calling.

## Positioning

A firm-specific case desk that reads Colombian court activity automatically (Rama Judicial consultations at 12:00 and 17:00 Colombia time) and turns each new actuación into an action: notify the client, create a task, compute the deadline. The client portal translates court jargon into plain language.

## Operating Context

- Radicados: 23-digit Colombian court filing numbers, segmented (ciudad, entidad, especialidad, despacho, año, consecutivo, recurso).
- Notifications by email, WhatsApp and web push, governed by per-user preferences.
- Contracts of legal services generated from the firm's CPS template, signed physically, scanned and delivered to the client.
- Billing: cuentas de cobro and recibos de pago in COP; not electronic invoices.
- Spanish (Colombia) only; America/Bogota time zone.
- Deployed on Vercel (Next.js frontend + FastAPI backend, PostgreSQL, R2 storage, Vercel Workflows).

## Capabilities and Constraints

- Single organization; no multi-tenant SaaS, no public sign-up (legacy SaaS pieces are being retired).
- Clients only see explicitly assigned case files, tasks and document requests.
- Court data is read-only from the Rama Judicial; the firm does not file through the platform.
- Billing rules (partial payments, taxes, ePayco) are undecided; see plan.md decision table.

## Brand Commitments

- Firm name: "Alejandra Muñoz | Abogada y Asociados"; logo files in `frontend-saas/public/AM_logo_*`.
- Logo design is fixed (layout/arrangement may change, the mark itself may not). Logo typeface: Georgia.
- Navy and gold come from the logo and must stay in the same range (#002060 navy, #CCB56B gold); exact values may be tuned when needed, a different family of colors only as a proposal for evaluation.
- Voice on the public site: clear, preventive, close ("derecho claro, preventivo y cercano"), formal "usted" toward clients.

## Evidence on Hand

- Real public-site copy in `frontend-saas/lib/sitePageDefaults.ts` (practice areas, philosophy, legal pages).
- No testimonials, client counts, case outcomes or press exist; do not fabricate them.

## Product Principles

1. The action lives next to the data: an actuación carries its own "notify" and "create task".
2. Urgency first: each role's home is a work queue ordered by what is due, not a metrics board.
3. The client reads plain language; legal terms stay as a reference.
4. Nothing judicial is lost silently: failures in consultations or deliveries are visible and retryable.
5. Confidentiality by default: no public links to documents, every change audited.

## Accessibility & Inclusion

WCAG 2.2 AA contrast in light and dark themes; state never conveyed by color alone; 44 px touch targets.
