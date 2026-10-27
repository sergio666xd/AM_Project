"use client";

import { useCallback, useState } from "react";
import { Save, Search } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { useSession } from "@/context/SessionContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Template = {
  clave: string; nombre: string; asunto_email: string | null; cuerpo_email: string;
  cuerpo_whatsapp: string; titulo_push: string | null; cuerpo_push: string | null;
  variables_ejemplo: Record<string, unknown>; enlace_ejemplo: string | null;
  texto_enlace_ejemplo: string | null; vista_previa_email: string; vista_previa_whatsapp: string; actualizado_en: string;
};

function preview(source: string, values: Record<string, unknown>, link: string | null, linkText: string | null) {
  const rendered = source.replace(/\\n/g, "\n").replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_token, key: string) => {
    const value = key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : "", values);
    return value == null ? "" : String(value);
  });
  return link && linkText ? `${rendered.trim()}\n\nAbrir enlace: ${linkText} | ${link}` : rendered;
}

export default function AdminMessageTemplatesPage() {
  const { token } = useSession();
  const [items, setItems] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const rows = await fetchApi("/api/admin/notificaciones/plantillas", { method: "GET", token }) as Template[];
      setItems(rows);
      setSelected((current) => rows.some((item) => item.clave === current) ? current : rows[0]?.clave ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar las plantillas."); }
    finally { setLoading(false); }
  }, [token]);

  useLoadEffect(load);
  const template = items.find((item) => item.clave === selected);
  const visibleItems = items.filter((item) => `${item.nombre} ${item.clave}`.toLowerCase().includes(query.trim().toLowerCase()));
  function update(key: "asunto_email" | "cuerpo_email" | "cuerpo_whatsapp" | "titulo_push" | "cuerpo_push", value: string) {
    setItems((current) => current.map((item) => item.clave === selected ? { ...item, [key]: value } : item));
  }

  async function save() {
    if (!token || !template) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await fetchApi(`/api/admin/notificaciones/plantillas/${template.clave}`, {
        method: "PUT", token,
        body: JSON.stringify({ asunto_email: template.asunto_email, cuerpo_email: template.cuerpo_email, cuerpo_whatsapp: template.cuerpo_whatsapp, titulo_push: template.titulo_push, cuerpo_push: template.cuerpo_push }),
      });
      setNotice("Plantilla guardada.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la plantilla."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5">
    <PageHeader overline="Operación" title="Mensajes del sistema" description="Edita los textos de correo y WhatsApp. Los enlaces y botones se agregan automáticamente según el tipo de mensaje." />
    {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">{notice}</p>}
    {loading ? <p className="py-10 text-center text-sm text-foreground-muted">Cargando mensajes…</p> : <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Tipos de mensaje" className="space-y-2 rounded-lg border border-border bg-surface p-2">
        <label className="relative block">
          <span className="sr-only">Buscar plantilla por nombre o clave</span>
          <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-foreground-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tipo de mensaje" className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm" />
        </label>
        <div className="max-h-[65vh] space-y-1 overflow-y-auto">
          {visibleItems.map((item) => <button key={item.clave} type="button" aria-pressed={selected === item.clave} onClick={() => setSelected(item.clave)} className={`min-h-11 w-full rounded-md px-3 py-2 text-left text-sm ${selected === item.clave ? "bg-brand-900 text-white" : "hover:bg-surface-hover"}`}>{item.nombre}</button>)}
          {visibleItems.length === 0 && <p className="p-3 text-sm text-foreground-muted">No hay plantillas que coincidan con la búsqueda.</p>}
        </div>
      </nav>
      {template ? <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4"><h2 className="font-semibold">{template.nombre}</h2><p className="mt-1 text-xs text-foreground-muted">Variables disponibles: {Object.keys(template.variables_ejemplo || {}).map((key) => `{{${key}}}`).join(", ") || "ninguna"}</p>{template.enlace_ejemplo && <p className="mt-2 break-all text-xs text-foreground-muted">Ejemplo del enlace generado: {template.enlace_ejemplo}</p>}</div>
        <label className="block rounded-lg border border-border bg-surface p-4 text-sm font-medium">Asunto del correo<input value={template.asunto_email || ""} onChange={(event) => update("asunto_email", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-normal" placeholder="(sin asunto)" /></label>
        <label className="block rounded-lg border border-border bg-surface p-4 text-sm font-medium">Texto del correo<textarea rows={9} value={template.cuerpo_email} onChange={(event) => update("cuerpo_email", event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-3 font-normal" /></label>
        <label className="block rounded-lg border border-border bg-surface p-4 text-sm font-medium">Texto de WhatsApp<textarea rows={7} value={template.cuerpo_whatsapp} onChange={(event) => update("cuerpo_whatsapp", event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-3 font-normal" /></label>
        {(template.titulo_push !== null || template.cuerpo_push !== null || template.clave === "ACTUACIONES_DIGEST") && <section className="space-y-4 rounded-lg border border-border bg-surface p-4"><div><h3 className="font-semibold">Notificación del navegador</h3><p className="mt-1 text-xs text-foreground-muted">Se envía a los usuarios que activaron las notificaciones Push. El clic abre el radicado correspondiente.</p></div><label className="block text-sm font-medium">Título Push<input value={template.titulo_push || ""} onChange={(event) => update("titulo_push", event.target.value)} maxLength={500} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-normal" placeholder="Nueva actuación judicial en {{radicado}}" /></label><label className="block text-sm font-medium">Descripción Push<textarea rows={3} value={template.cuerpo_push || ""} onChange={(event) => update("cuerpo_push", event.target.value)} maxLength={5000} className="mt-2 w-full rounded-md border border-border bg-background p-3 font-normal" placeholder="{{actuacion}}" /></label><article className="rounded-md border border-border bg-background p-3"><h4 className="text-sm font-semibold">Vista previa Push</h4><p className="mt-2 text-sm font-semibold">{preview(template.titulo_push || "", template.variables_ejemplo || {}, null, null)}</p><p className="mt-1 whitespace-pre-wrap text-sm text-foreground-muted">{preview(template.cuerpo_push || "", template.variables_ejemplo || {}, null, null)}</p></article></section>}
        <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-semibold">Vista previa de correo</h3><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{preview(template.cuerpo_email, template.variables_ejemplo || {}, template.enlace_ejemplo, template.texto_enlace_ejemplo)}</pre></article><article className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-semibold">Vista previa de WhatsApp</h3><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{preview(template.cuerpo_whatsapp, template.variables_ejemplo || {}, template.enlace_ejemplo, template.texto_enlace_ejemplo)}</pre></article></div>
        <Button variant="primary" onClick={() => void save()} loading={saving} icon={<Save className="size-4" />}>{saving ? "Guardando…" : "Guardar mensaje"}</Button>
      </div> : <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-foreground-muted">No hay tipos de mensaje configurados. Aplica la migración de plantillas.</div>}
    </div>}
  </section>;
}
