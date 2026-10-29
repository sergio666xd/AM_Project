---
name: Gestión de procesos AM
description: Case-management app for Alejandra Muñoz | Abogada y Asociados, built as a foliated case file.
colors:
  navy: "#002060"
  navy-hover: "#15326f"
  navy-soft: "#e5eaf4"
  navy-ink: "#1d3a7a"
  on-navy: "#f4f1e8"
  on-navy-2: "#b9c3dc"
  rail-active: "#0f2d6b"
  gold: "#ccb56b"
  gold-ink: "#6f581b"
  gold-soft: "#f5eed6"
  ground: "#f6f2e8"
  manila: "#ece3cd"
  manila-line: "#d8caa6"
  sheet: "#ffffff"
  sheet-2: "#fbf9f4"
  line: "#e4ddcc"
  line-strong: "#cdbf9c"
  ink: "#18203a"
  ink-2: "#454d63"
  ink-3: "#636b80"
  ok: "#2c6a3e"
  ok-soft: "#e3f0e4"
  warn: "#8a5a00"
  warn-soft: "#fbefd6"
  bad: "#a3312a"
  bad-soft: "#f9e4e1"
typography:
  display:
    fontFamily: "Georgia, Gelasio, 'Times New Roman', serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.25
  headline:
    fontFamily: "Georgia, Gelasio, 'Times New Roman', serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.25
  title:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-client:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  folio-numeral:
    fontFamily: "Georgia, Gelasio, serif"
    fontSize: "15px"
    fontWeight: 600
    fontFeature: "'onum' 1"
  radicado:
    fontFamily: "'Roboto Mono', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "'tnum' 1"
rounded:
  stamp: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  drawer: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-navy}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.navy-hover}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  tag-neutral:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "24px"
  tag-navy:
    backgroundColor: "{colors.navy-soft}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "24px"
  folio-stamp:
    textColor: "{colors.ink-3}"
    typography: "{typography.folio-numeral}"
    rounded: "{rounded.stamp}"
    padding: "0 6px"
    height: "24px"
  folio-stamp-new:
    backgroundColor: "{colors.gold-soft}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.stamp}"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
  caratula:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px 24px 16px"
  nav-rail:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-navy}"
    width: "248px"
---

# Design System: Gestión de procesos AM

## Overview

**Creative North Star: "Expediente foliado"**

The app is a physical court file brought on screen. Every case is a folder: a manila carátula (cover) holds the case identity, white sheets hold the content, and every record in the file carries a folio number exactly as a Colombian expediente does. The lawyer reads the newest folios, acts on them, and moves on; the client reads the same file translated into plain language. Density is office-grade for the lawyer (desktop first, 15px body, tables) and generous for the client (17px reading size, one action per card).

Brand lives in materials, not decoration. Navy and gold come from the firm's logo and stay within its range; Georgia, the logo's typeface, sets titles and folio numerals. Gold is rare on purpose: it marks what is new and what the firm is waiting for, nothing else.

**Key Characteristics:**
- Manila carátula + white sheet + navy rail as the three materials.
- The folio stamp (`Fl. 88`) on every record, with old-style Georgia numerals.
- Gold reserved for new folios, the active tab edge, and requests to the client.
- Plain-language twin of every court text ("Para el cliente: …").
- Light and dark themes from the same token names.

## Colors

A warm paper ground with logo navy for structure and logo gold for attention.

### Primary
- **Logo Navy** (navy): the rail, primary buttons, focus rings, links and the current stage dot. In dark theme it lifts to a pale periwinkle so it stays readable on dark sheets.
- **Navy Soft / Navy Ink** (navy-soft, navy-ink): selected toggles, navy tags, informational notices.

### Secondary
- **Logo Gold** (gold): the active tab's top edge, the current stage dot on the client timeline, borders of new folio stamps, and the gold button reserved for rare confirmations.
- **Gold Ink / Gold Soft** (gold-ink, gold-soft): text and fill for new folios, the "Necesitamos N cosas de usted" box, and the término result ("Vence el …").

### Neutral
- **Manila Ground** (ground): page background, the desk the file lies on.
- **Manila Cover** (manila): carátulas, count chips, hover fills, neutral tags.
- **Sheet / Sheet 2** (sheet, sheet-2): content surfaces and their quiet alternate.
- **Lines** (line, line-strong, manila-line): dividers, input outlines, stamp borders.
- **Inks** (ink, ink-2, ink-3): text in three steps. ink-3 is for metadata on white only; on manila use ink-2 (ink-3 on manila falls under 4.5:1).

### Status
- **ok / warn / bad** with their soft fills: consultation results, overdue términos, upload errors. Always paired with an icon or word, never colour alone.

### Named Rules
**The Gold Means Waiting Rule.** Gold appears only where something is new or where the firm awaits an action. If nothing is new, a screen has no gold except the active tab edge.

**The Logo Range Rule.** Navy and gold may shift in lightness for contrast or dark theme, but stay in the logo's hue range. The logo artwork itself is never altered; only its layout (landscape, reversed, emblem) changes.

## Typography

**Display Font:** Georgia (with Gelasio, then Times New Roman)
**Body Font:** Public Sans (with system UI sans)
**Label/Mono Font:** Roboto Mono for radicados only

**Character:** Georgia ties the screen to the firm's logo and to printed legal paper; Public Sans keeps dense case lists clear and neutral.

### Hierarchy
- **Display** (400, 26px mobile / 30px desktop, 1.25): page titles ("Hoy", the case name on the carátula).
- **Headline** (400, 22px, 1.25): key dates and results inside panels ("Miércoles 4 de noviembre").
- **Title** (600, 14–15px, 1.4): sheet headers, folio titles, table primary cells.
- **Body** (400, 15px, 1.5): everything in the lawyer panel.
- **Body Client** (400, 17px, 1.6): the client portal, with 44px+ targets.
- **Label** (600, 13px): field labels and secondary meta.
- **Folio numeral** (Georgia 600 with old-style figures, 13–15px): only inside folio stamps.
- **Radicado** (Roboto Mono, tabular): the 23-digit radicado, shown in its seven segments.
- **Public site title** (Georgia 400, 34px mobile / 50px tablet / 58px desktop on the home carátula, 32/42px on inner pages, 1.1–1.14): the page title on each public carátula; public body copy runs at 17–19px.

### Named Rules
**The Two Voices Rule.** Serif speaks for the file (titles, dates, folio numbers); sans speaks for the interface. Never set buttons, labels or body copy in Georgia.

## Layout

The lawyer shell is a fixed navy rail (248px) plus a sticky top bar with global search (Ctrl/Cmd+K) and a content column capped at 1280px with 16/24/32px gutters by breakpoint. Below the `lg` breakpoint the rail becomes a four-item bottom bar plus a "Más" sheet. The client shell drops the rail for a white header with the full landscape logo and a 1080px column.

The public site (alejandramunozabogada.com) is light-only and uses the same materials: a white header with the landscape logo and a single "Portal de clientes" link, a 1180px column, and a navy footer. Each page is one folder: a manila carátula holding the title, intro and a facts list, the site's section tabs on its bottom edge (the current one carries the gold edge), and one white sheet below divided into folios by hairlines. Forms and closing calls to action live inside that sheet, never in floating cards.

Pages stack sheets with 16–24px gaps. Main/aside splits collapse to one column below `lg`; grid children use `minmax(0,1fr)` so long radicados and names truncate instead of overflowing at 390px. Tables become stacked lists on mobile. Side panels (Avisar, Crear tarea) are right-hand drawers on desktop and bottom sheets on mobile.

## Elevation & Depth

Mostly flat paper. Sheets sit on the manila ground with a soft two-layer shadow; carátulas have no shadow and read as the folder cover by colour alone. Only floating layers (drawers, menus, command palette, toasts) use the stronger pop shadow. Buttons get depth from inset highlights and hairline ring shadows rather than borders.

### Shadow Vocabulary
- **Sheet** (`0 1px 2px rgb(24 32 58 / 0.06), 0 4px 12px -4px rgb(24 32 58 / 0.08)`): every content sheet.
- **Pop** (`0 2px 6px rgb(24 32 58 / 0.08), 0 16px 40px -12px rgb(24 32 58 / 0.22)`): drawers, dropdowns, palette, toasts.
- **Hairline ring** (`0 0 0 1px var(--line-strong)`): secondary buttons and inputs; becomes a 2px navy ring on focus.

## Shapes

Gently rounded paper: 12px on sheets and carátulas, 8px on buttons and inputs, 6px on tags, 16px on the leading edge of drawers. The folio stamp is the exception with a near-square 3px corner, like an ink stamp. Carátula and the sheet below it join into one folder: the carátula rounds only its top corners and tabs sit on its bottom edge.

## Components

- **Folio stamp:** `Fl.` in small caps sans plus the number in Georgia old-style figures, in a hairline box. New folios fill gold-soft with a gold border and fade to neutral (700ms) once reviewed. Clicking a stamp on Hoy opens the expediente scrolled to that folio.
- **Carátula:** manila cover holding area/class tags, case name in display type, the case's facts as a definition list, the stage track (Etapas), the "Ir al folio" jump, and carátula tabs (Folios, Tareas, Documentos, Partes y equipo, Contrato y cobros). The active tab is a white sheet with a 2px gold top edge.
- **Folio row:** date column, type icon + type, title, body, optional "Para el cliente" plain-language box (manila tint), stamp and author on the right. Unreviewed rows carry a light gold-soft tint, never a side stripe.
- **Buttons:** primary (navy), secondary (white with hairline ring), ghost, gold (rare confirmations), danger. 32/40/48px heights; press scales to 0.96; loading swaps the icon for a spinner.
- **Inputs:** white, hairline ring, 2px navy ring on focus. Dates are typed dd/mm/aaaa with an inline error, never the browser's US-format picker.
- **Tags:** 24px pills in neutral, navy, gold, ok, warn, bad tones, optionally with a 12px icon.
- **Notice:** tinted full-width message with icon, title, text and an action that drops under the text on mobile.
- **Radicado:** mono, grouped in its seven official segments, with a copy button whose icon cross-fades to a check.
- **Término calculator:** inside Crear tarea, counts Colombian business days skipping weekends, festivos and the judicial vacancy, shows "Vence el …" in headline type on gold-soft, and names any skipped holiday and the legal basis.
- **Consultation form (public):** area chips, name, "WhatsApp o correo" in one field, message, and a consent checkbox linking the data policy. Errors sit under each field and focus moves to the first one; on success the form is replaced by a confirmation addressed to the person by first name, with no promised response time.
- **Site content editor (admin):** each public page edits by named sections in plain language (Portada, Servicios, Cómo aparece en Google), lists add, reorder and remove items in collapsible rows, and a sticky bar appears only while there are unpublished changes. "Volver al texto base" asks for confirmation.
- **Drawer:** focus moves in on open, Escape closes, footer holds Cancelar + the primary action.

## Do's and Don'ts

- Do give every record in a case file a folio number, and keep folio numbers in Georgia old-style figures.
- Do pair every court text shown to a client with a plain-language version.
- Do write dates the Colombian way: "martes 3 de noviembre", "27/10/2026".
- Do keep client actions to one obvious button per card, at 44px or taller.
- Do use the reversed logo on navy and dark surfaces, the landscape logo on light ones, the emblem where space is tight.
- Don't use gold for decoration, success states or generic emphasis.
- Don't mark rows with coloured side stripes; use a tint or the stamp state.
- Don't add uppercase kicker labels above titles or rows of KPI tiles.
- Don't put ink-3 text on manila surfaces.
- Don't alter the logo artwork or substitute another serif for Georgia in titles.
