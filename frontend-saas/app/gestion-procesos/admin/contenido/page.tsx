"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { SITE_PAGE_DEFAULTS, SITE_PAGE_LABELS, type PublicPageSlug } from "@/lib/sitePageDefaults";
import { fetchApi } from "@/lib/api";
import { RichTextInput } from "@/components/marketing/RichTextInput";
import { useSession } from "@/context/SessionContext";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ContentPage = { slug: PublicPageSlug; nombre: string; ruta: string; contenido: JsonValue | null; updated_at: string | null };

async function fetchPages(token: string): Promise<ContentPage[]> {
  const result: unknown = await fetchApi("/api/admin/contenido", { method: "GET", token });
  if (!Array.isArray(result)) throw new Error("La API no devolvió una lista de páginas públicas.");
  const validSlugs = new Set(Object.keys(SITE_PAGE_DEFAULTS));
  return result.flatMap((value): ContentPage[] => {
    if (!value || typeof value !== "object") return [];
    const page = value as Record<string, unknown>;
    if (typeof page.slug !== "string" || !validSlugs.has(page.slug)) return [];
    const slug = page.slug as PublicPageSlug;
    return [{
      slug,
      nombre: typeof page.nombre === "string" ? page.nombre : SITE_PAGE_LABELS[slug],
      ruta: typeof page.ruta === "string" ? page.ruta : SITE_PAGE_DEFAULTS[slug].route,
      contenido: page.contenido == null ? null : page.contenido as JsonValue,
      updated_at: typeof page.updated_at === "string" ? page.updated_at : null,
    }];
  });
}

function cloneValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function mergeContent(defaults: JsonValue, override: JsonValue): JsonValue {
  if (Array.isArray(override)) return override;
  if (
    defaults !== null && typeof defaults === "object" && !Array.isArray(defaults) &&
    override !== null && typeof override === "object" && !Array.isArray(override)
  ) {
    const merged: Record<string, JsonValue> = { ...defaults };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = key in merged ? mergeContent(merged[key], value) : value;
    }
    return merged;
  }
  return override ?? defaults;
}

function humanLabel(value: string) {
  const labels: Record<string, string> = {
    route: "Ruta pública", seo: "SEO y buscadores", keywords: "Palabras clave", noIndex: "Ocultar de buscadores",
    heroEyebrow: "Antetítulo principal", heroTitle: "Título principal", heroDescription: "Descripción principal",
    heroCta: "Texto del botón", heroAside: "Texto destacado", servicesEyebrow: "Antetítulo de servicios",
    servicesTitle: "Título de servicios", servicesLink: "Enlace de áreas", preventionEyebrow: "Antetítulo preventivo",
    preventionTitle: "Título preventivo", preventionDescription: "Descripción preventiva", preventionItems: "Mensajes preventivos",
    aboutTitle: "Título de presentación", aboutDescription: "Descripción de presentación", aboutLink: "Enlace de presentación",
    eyebrow: "Antetítulo", title: "Título", intro: "Introducción", description: "Descripción", body: "Texto",
    sections: "Secciones", services: "Servicios", areas: "Áreas", items: "Elementos", faqs: "Preguntas frecuentes",
    question: "Pregunta", answer: "Respuesta", icon: "Clave de icono", number: "Número", step: "Paso",
    updatedAt: "Fecha de actualización", whatsappCta: "Texto del botón WhatsApp", emailCta: "Texto del botón de correo",
    contactOptions: "Medios de contacto", faqEyebrow: "Antetítulo de preguntas", values: "Principios", methodologyEyebrow: "Antetítulo de metodología",
    methodologyTitle: "Título de metodología", methodologyDescription: "Descripción de metodología", benefits: "Beneficios",
    asideTitle: "Título destacado", asideDescription: "Descripción destacada", coverageEyebrow: "Antetítulo de cobertura",
    coverageTitle: "Título de cobertura", coverageDescription: "Descripción de cobertura", closingEyebrow: "Antetítulo de cierre",
    closingTitle: "Título de cierre", closingDescription: "Descripción de cierre", closingCta: "Texto del botón de cierre",
  };
  return labels[value] || value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function ContentField({
  name,
  value,
  template,
  onChange,
  depth = 0,
  inSeo = false,
}: {
  name: string;
  value: JsonValue;
  template?: JsonValue;
  onChange: (value: JsonValue) => void;
  depth?: number;
  inSeo?: boolean;
}) {
  if (Array.isArray(value)) {
    const itemTemplate = value[0] ?? (Array.isArray(template) ? template[0] : undefined) ?? "";
    return (
      <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold text-foreground">{humanLabel(name)}</legend>
        {value.map((item, index) => (
          <fieldset key={index} className="space-y-2 rounded-md border border-border/70 bg-surface-secondary/40 p-3">
            <legend className="px-1 text-xs font-medium text-foreground-muted">{humanLabel(name)} {index + 1}</legend>
            <ContentField name={typeof item === "object" && item && !Array.isArray(item) ? "Elemento" : name} value={item} template={itemTemplate} depth={depth + 1} inSeo={inSeo} onChange={(next) => onChange(value.map((entry, current) => current === index ? next : entry))} />
            <button type="button" onClick={() => onChange(value.filter((_, current) => current !== index))} className="text-xs font-medium text-red-700 hover:underline">Quitar elemento</button>
          </fieldset>
        ))}
        <button type="button" onClick={() => onChange([...value, cloneValue(itemTemplate)])} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover">Agregar elemento</button>
      </fieldset>
    );
  }

  if (value !== null && typeof value === "object") {
    const templateObject = template !== null && typeof template === "object" && !Array.isArray(template)
      ? template as Record<string, JsonValue>
      : {};
    return (
      <fieldset className={`min-w-0 space-y-3 rounded-lg border border-border p-3 ${depth ? "bg-surface-secondary/20" : ""}`}>
        {depth > 0 && <legend className="px-1 text-sm font-semibold text-foreground">{humanLabel(name)}</legend>}
        {Object.entries(value).map(([key, child]) => (
          <ContentField key={key} name={key} value={child} template={templateObject[key] ?? child} depth={depth + 1} inSeo={inSeo || key.toLowerCase() === "seo"} onChange={(next) => onChange({ ...value, [key]: next })} />
        ))}
      </fieldset>
    );
  }

  if (typeof value === "boolean") {
    return <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{humanLabel(name)}</label>;
  }

  if (typeof value === "number") {
    return <label className="block text-sm font-medium text-foreground">{humanLabel(name)}<input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-normal" /></label>;
  }

  const textValue = typeof value === "string" ? value : "";
  if (name === "route") {
    return <label className="block text-sm font-medium text-foreground">{humanLabel(name)}<input value={textValue} onChange={(event) => onChange(event.target.value)} placeholder="/firma/nosotros" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-normal" /><span className="mt-1 block text-xs text-muted-foreground">Empieza con / y usa minúsculas, números y guiones. Las rutas anteriores seguirán funcionando.</span></label>;
  }
  const longText = textValue.length > 90 || name.toLowerCase().includes("description") || ["body", "answer", "intro", "text", "quote"].includes(name);
  const normalizedName = name.toLowerCase();
  const isTitle = normalizedName === "title" || normalizedName.endsWith("title");
  const isIconKey = normalizedName === "icon" || normalizedName === "iconkey" || normalizedName === "icon_key";
  if (inSeo || isTitle || isIconKey) {
    return <label className="block text-sm font-medium text-foreground">{humanLabel(name)}{longText ? <textarea value={textValue} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-normal" /> : <input value={textValue} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-normal" />}</label>;
  }
  return (
    <RichTextInput label={humanLabel(name)} value={textValue} onChange={onChange} multiline={longText} />
  );
}

export default function ContenidoPublicoAdminPage() {
  const { token } = useSession();
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<PublicPageSlug>("inicio");
  const [draft, setDraft] = useState<JsonValue>(cloneValue(SITE_PAGE_DEFAULTS.inicio));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mostrarPlanes, setMostrarPlanes] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchPages(token)
      .then((result) => {
        if (!active) return;
        setPages(result);
        const first = result[0];
        if (first) {
          setSelectedSlug(first.slug);
          setDraft(mergeContent(cloneValue(SITE_PAGE_DEFAULTS[first.slug]), cloneValue(first.contenido)));
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las páginas."); })
      .finally(() => { if (active) setLoading(false); });
    fetchApi("/api/admin/configuracion", { method: "GET", token })
      .then((config: { mostrar_planes: boolean }) => { if (active) setMostrarPlanes(config.mostrar_planes); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la oferta pública."); })
      .finally(() => { if (active) setConfigLoading(false); });    return () => { active = false; };
  }, [token]);

  const selectedPage = pages.find((page) => page.slug === selectedSlug);
  const savedContent = mergeContent(
    cloneValue(SITE_PAGE_DEFAULTS[selectedSlug]),
    cloneValue(selectedPage?.contenido),
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedContent);

  function selectPage(slug: PublicPageSlug) {
    setSelectedSlug(slug);
    const page = pages.find((item) => item.slug === slug);
    setDraft(mergeContent(cloneValue(SITE_PAGE_DEFAULTS[slug]), cloneValue(page?.contenido)));
    setError("");
    setNotice("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(`/api/admin/contenido/${selectedSlug}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ contenido: draft }),
      });
      setPages((current) => current.map((page) => page.slug === selectedSlug ? { ...page, contenido: result.contenido, updated_at: result.updated_at } : page));
      setNotice("Página guardada. Los cambios ya están publicados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar la página.");
    } finally {
      setSaving(false);
    }
  }

  async function restore() {
    if (!window.confirm("¿Restaurar el contenido base de esta página? Se eliminará su versión personalizada.")) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(`/api/admin/contenido/${selectedSlug}`, { method: "DELETE", token });
      setPages((current) => current.map((page) => page.slug === selectedSlug ? { ...page, contenido: null, updated_at: null } : page));
      setDraft(cloneValue(SITE_PAGE_DEFAULTS[selectedSlug]));
      setNotice(result.mensaje);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible restaurar la página.");
    } finally {
      setSaving(false);
    }
  }

  async function updateOfferVisibility(nextValue: boolean) {
    setConfigSaving(true);
    setError("");
    setNotice("");
    try {
      const config = await fetchApi("/api/admin/configuracion", {
        method: "PUT",
        token,
        body: JSON.stringify({ mostrar_planes: nextValue }),
      });
      setMostrarPlanes(config.mostrar_planes);
      setNotice(config.mostrar_planes ? "Los planes ya están visibles en Gestión de Procesos." : "La página mostrará Próximamente en lugar de los planes.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar la oferta pública.");
    } finally {
      setConfigSaving(false);
    }
  }
  return (
    <section className="motion-swap mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Contenido público · ADMIN global</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Páginas del sitio</h1><p className="mt-1 text-sm text-muted-foreground">Edita textos y listas sin modificar la estructura visual del sitio.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => void restore()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"><RotateCcw className="size-4" />Restaurar base</button><button type="button" onClick={() => void save()} disabled={saving || loading || !dirty} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Save className="size-4" />{saving ? "Guardando..." : "Guardar cambios"}</button></div>
      </header>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</p>}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-semibold text-foreground">Oferta de Gestión de Procesos</h2>
          <p className="mt-1 text-sm text-foreground-muted">Controla si la página pública muestra los planes o el mensaje Próximamente.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium text-foreground">
          <span>{mostrarPlanes ? "Mostrar planes" : "Mostrar Próximamente"}</span>
          <input type="checkbox" role="switch" aria-label="Mostrar planes en la página pública de Gestión de Procesos" checked={mostrarPlanes} disabled={configLoading || configSaving} onChange={(event) => void updateOfferVisibility(event.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50 ${mostrarPlanes ? "bg-primary after:translate-x-5" : "bg-border"}`} />
          {configLoading && <span className="motion-delayed-in text-xs text-foreground-muted">Cargando…</span>}
          {configSaving && <span className="text-xs text-foreground-muted">Guardando…</span>}
        </label>
      </section>      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Páginas públicas" className="h-fit rounded-lg border border-border bg-card p-2">
          {pages.map((page) => <button key={page.slug} type="button" onClick={() => selectPage(page.slug)} aria-current={selectedSlug === page.slug ? "page" : undefined} className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm ${selectedSlug === page.slug ? "bg-primary/10 font-semibold text-primary" : "text-foreground-secondary hover:bg-muted"}`}><span>{page.nombre}</span><span className={`size-2 rounded-full ${page.contenido ? "bg-emerald-600" : "bg-muted-foreground/40"}`} aria-label={page.contenido ? "Personalizada" : "Contenido base"} /></button>)}
        </nav>
        <div className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4"><div><h2 className="font-semibold text-foreground">{selectedPage?.nombre || SITE_PAGE_LABELS[selectedSlug]}</h2><p className="mt-1 text-xs text-muted-foreground">{selectedPage?.updated_at ? `Actualizada ${new Date(selectedPage.updated_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}` : "Usando contenido base"}</p></div>{dirty && <span className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">Cambios sin guardar</span>}</div>
          {loading ? <p className="motion-delayed-in py-10 text-center text-sm text-muted-foreground">Cargando páginas...</p> : <ContentField name={selectedSlug} value={draft} template={cloneValue(SITE_PAGE_DEFAULTS[selectedSlug])} onChange={setDraft} />}
        </div>
      </div>
    </section>
  );
}
