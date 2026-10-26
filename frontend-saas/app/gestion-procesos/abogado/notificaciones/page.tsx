"use client";

import { apiRequest } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, ExternalLink, FileText, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Category = "todas" | "proceso" | "tarea" | "documento" | "cliente" | "solicitud" | "radicado" | "sistema";
type Notice = { id: string; categoria: Exclude<Category, "todas">; tipo: string; titulo: string; descripcion: string; proceso: string | null; proceso_id: number | null; fecha: string; href: string; leida: boolean };
const categories: { id: Category; label: string }[] = [
  { id: "todas", label: "Todas" }, { id: "proceso", label: "Procesos" }, { id: "tarea", label: "Tareas" },
  { id: "documento", label: "Documentos" }, { id: "cliente", label: "Clientes" }, { id: "solicitud", label: "Solicitudes" },
  { id: "radicado", label: "Radicados" }, { id: "sistema", label: "Sistema" },
];

export default function NotificacionesPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("todas");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const response = await apiRequest("/api/expedientes/notificaciones/centro", { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No fue posible cargar las notificaciones.");
      setItems(Array.isArray(result) ? result : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error al cargar las notificaciones."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unread = items.filter((item) => !item.leida).length;
  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return items.filter((item) => (category === "todas" || item.categoria === category)
      && (!unreadOnly || !item.leida)
      && (!value || `${item.titulo} ${item.descripcion} ${item.proceso || ""} ${item.tipo}`.toLowerCase().includes(value)));
  }, [items, query, category, unreadOnly]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setBusy(true); setError("");
    try {
      const response = await apiRequest("/api/expedientes/notificaciones/leer", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No fue posible actualizar las notificaciones.");
      const read = new Set(ids); setItems((current) => current.map((item) => read.has(item.id) ? { ...item, leida: true } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible actualizar las notificaciones."); }
    finally { setBusy(false); }
  }

  async function markAllRead() {
    setBusy(true); setError("");
    try {
      const response = await apiRequest("/api/expedientes/notificaciones/leer-todas", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No fue posible marcar todo como leído.");
      setItems((current) => current.map((item) => ({ ...item, leida: true })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible marcar todo como leído."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        overline="Despacho"
        title="Centro de notificaciones"
        description="Pendientes y actividad del despacho, con enlaces a su proceso relacionado."
        action={
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <span className="rounded-full bg-danger-100 px-2.5 py-1 text-xs font-semibold text-danger">
                {unread} sin leer
              </span>
            )}
            <Button variant="outline" onClick={() => void load()} disabled={loading} icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}>
              Actualizar
            </Button>
            <Button variant="primary" onClick={() => void markAllRead()} disabled={!unread || busy} icon={<CheckCheck className="size-4" />}>
              Marcar todo leído
            </Button>
          </div>
        }
      />
      {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700">{error}</p>}
      <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar notificaciones por categoría">{categories.map((item) => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`rounded-lg px-3 py-1.5 text-sm ${category === item.id ? "bg-brand-900 !text-white" : "border border-border text-foreground-muted hover:bg-surface-hover"}`}>{item.label}</button>)}</div>
        <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por proceso, asunto…" className="h-10 w-full rounded-lg border border-border bg-surface-secondary pl-9 pr-3 text-sm" /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Solo no leídas</label><span className="text-xs text-foreground-muted">{visible.length} aviso(s)</span></div>
      </section>
      {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-foreground-muted"><RefreshCw className="size-4 animate-spin" />Cargando…</div> : visible.length ? <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">{visible.map((item) => <article key={item.id} className={`flex flex-wrap items-center gap-3 p-4 ${item.leida ? "" : "bg-brand-900/5"}`}><span aria-label={item.leida ? "Leída" : "No leída"} className={`size-2 shrink-0 rounded-full ${item.leida ? "bg-transparent" : "bg-brand-900"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-brand-900">{categories.find((entry) => entry.id === item.categoria)?.label || "Sistema"}</span><span className="text-xs text-foreground-muted">{item.tipo.replaceAll("_", " ")}</span></div><p className="mt-1 font-medium text-foreground">{item.titulo}</p><p className="mt-1 text-sm text-foreground-secondary">{item.descripcion}</p><p className="mt-1 text-xs text-foreground-muted">{item.proceso || "Despacho"} · {new Date(item.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p></div>{!item.leida && <button type="button" disabled={busy} onClick={() => void markRead([item.id])} aria-label="Marcar como leída" className="rounded-md p-2 text-brand-900 hover:bg-brand-900/10 disabled:opacity-50"><Check className="size-4" /></button>}<Link href={item.href} onClick={() => { if (!item.leida) void markRead([item.id]); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-surface-hover"><ExternalLink className="size-4" />Abrir</Link></article>)}</div> : <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-6 py-16 text-center"><FileText className="mx-auto size-8 text-foreground-muted" /><p className="mt-3 text-sm text-foreground-muted">No hay notificaciones para estos filtros.</p></div>}
    </section>
  );
}
