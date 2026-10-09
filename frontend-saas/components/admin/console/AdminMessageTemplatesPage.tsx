"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type Template = {
  clave: string; nombre: string; asunto_email: string | null; cuerpo_email: string;
  cuerpo_whatsapp: string; variables_ejemplo: Record<string, unknown>; enlace_ejemplo: string | null;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const rows = await fetchApi("/api/admin/notificaciones/plantillas", { method: "GET", token }) as Template[];
      setItems(rows);
      setSelected((current) => rows.some((item) => item.clave === current) ? current : rows[0]?.clave ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar las plantillas."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);
  const template = items.find((item) => item.clave === selected);
  function update(key: "asunto_email" | "cuerpo_email" | "cuerpo_whatsapp", value: string) {
    setItems((current) => current.map((item) => item.clave === selected ? { ...item, [key]: value } : item));
  }

  async function save() {
    if (!token || !template) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await fetchApi(`/api/admin/notificaciones/plantillas/${template.clave}`, {
        method: "PUT", token,
        body: JSON.stringify({ asunto_email: template.asunto_email, cuerpo_email: template.cuerpo_email, cuerpo_whatsapp: template.cuerpo_whatsapp }),
      });
      setNotice("Plantilla guardada.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la plantilla."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Operación</p><h1 className="mt-1 text-2xl font-semibold">Mensajes del sistema</h1><p className="mt-1 text-sm text-foreground-muted">Edita los textos de correo y WhatsApp. Los enlaces y botones se agregan automáticamente según el tipo de mensaje.</p></header>
    {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">{notice}</p>}
    {loading ? <p className="py-10 text-center text-sm text-foreground-muted">Cargando mensajes…</p> : <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Tipos de mensaje" className="space-y-1 rounded-lg border border-border bg-surface p-2">{items.map((item) => <button key={item.clave} type="button" onClick={() => setSelected(item.clave)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === item.clave ? "bg-primary text-white" : "hover:bg-surface-hover"}`}>{item.nombre}</button>)}</nav>
      {template ? <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4"><h2 className="font-semibold">{template.nombre}</h2><p className="mt-1 text-xs text-foreground-muted">Variables disponibles: {Object.keys(template.variables_ejemplo || {}).map((key) => `{{${key}}}`).join(", ") || "ninguna"}</p>{template.enlace_ejemplo && <p className="mt-2 break-all text-xs text-foreground-muted">Ejemplo del enlace generado: {template.enlace_ejemplo}</p>}</div>
        <label className="block rounded-lg border border-border bg-surface p-4 text-sm font-medium">Asunto del correo<input value={template.asunto_email || ""} onChange={(event) => update("asunto_email", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-normal" placeholder="(sin asunto)" /></label>
        <label className="block rounded-lg border border-border bg-surface p-4 text-sm font-medium">Texto del correo<textarea rows={9} value={template.cuerpo_email} onChange={(event) => update("cuerpo_email", event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-3 font-normal" /></label>
        <label className="block rounded-lg border border-border bg-surface p-4 text-sm font-medium">Texto de WhatsApp<textarea rows={7} value={template.cuerpo_whatsapp} onChange={(event) => update("cuerpo_whatsapp", event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-3 font-normal" /></label>
        <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-semibold">Vista previa de correo</h3><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{preview(template.cuerpo_email, template.variables_ejemplo || {}, template.enlace_ejemplo, template.texto_enlace_ejemplo)}</pre></article><article className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-semibold">Vista previa de WhatsApp</h3><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{preview(template.cuerpo_whatsapp, template.variables_ejemplo || {}, template.enlace_ejemplo, template.texto_enlace_ejemplo)}</pre></article></div>
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Save className="size-4" />{saving ? "Guardando…" : "Guardar mensaje"}</button>
      </div> : <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-foreground-muted">No hay tipos de mensaje configurados. Aplica la migración de plantillas.</div>}
    </div>}
  </section>;
}
