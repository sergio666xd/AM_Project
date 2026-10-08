"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ExternalLink, FileSearch, RefreshCw, ScrollText, Search, Trash2, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";

type TechnicalDetail = {
  endpoint: string | null;
  metodo: string | null;
  recurso: string;
  id: string | null;
  metadata: unknown;
  error: string | null;
};
type AuditEvent = {
  id: number;
  actor_id: number | null;
  actor: string;
  accion: string;
  tipo_recurso: string;
  modulo: string;
  recurso_id: string | null;
  created_at: string;
  descripcion: string;
  recurso: string;
  resultado: string;
  href: string;
  detalle_tecnico: TechnicalDetail;
};
type AuditFilters = { usuario: string; accion: string; modulo: string; fecha_desde: string; fecha_hasta: string; resultado: string };
const emptyFilters: AuditFilters = { usuario: "", accion: "", modulo: "", fecha_desde: "", fecha_hasta: "", resultado: "" };

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}
function DetailValue({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-xs text-foreground-muted">{label}</dt><dd className="mt-1 break-words text-sm">{value || "No registrado"}</dd></div>;
}

export default function AdminAuditPage({ initialView = "actividad" }: { initialView?: "actividad" | "auditoria" }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"actividad" | "auditoria">(initialView);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const token = typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  async function loadEvents(activeFilters: AuditFilters) {
    if (!token) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "200", offset: "0" });
    for (const [key, value] of Object.entries(activeFilters)) if (value) params.set(key, value);
    try {
      setEvents(await fetchApi(`/api/admin/auditoria?${params.toString()}`, { method: "GET", token }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar la actividad.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/admin/auditoria?limit=200&offset=0", { method: "GET", token })
      .then((data) => { if (active) setEvents(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la actividad."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIds([]);
    setFilters(draft);
    void loadEvents(draft);
  }

  function clearFilters() {
    setSelectedIds([]);
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    void loadEvents(emptyFilters);
  }

  function exportSelected() {
    const selectedEvents = events.filter((event) => selectedIds.includes(event.id));
    if (!selectedEvents.length) return;
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [["Fecha", "Usuario", "Acción", "Módulo", "Recurso", "ID", "Resultado", "Endpoint", "Método"], ...selectedEvents.map((event) => [event.created_at, event.actor, event.accion, event.modulo, event.tipo_recurso, event.recurso_id, event.resultado, event.detalle_tecnico.endpoint, event.detalle_tecnico.metodo])].map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = "auditoria-seleccion.csv"; anchor.click(); URL.revokeObjectURL(url);
    setSelectedIds([]);
  }

  async function deleteSelected() {
    if (!selectedIds.length || deleting || !window.confirm(`¿Eliminar ${selectedIds.length} registros de auditoría seleccionados? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    setError("");
    try {
      await fetchApi("/api/admin/auditoria", { method: "DELETE", token, body: JSON.stringify({ ids: selectedIds }) });
      setSelectedIds([]);
      setSelected(null);
      await loadEvents(filters);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar los registros seleccionados.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteEvent(event: AuditEvent) {
    if (deleting || !window.confirm(`¿Eliminar el registro de auditoría #${event.id}? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    setError("");
    try {
      await fetchApi(`/api/admin/auditoria/${event.id}`, { method: "DELETE", token });
      setSelectedIds((current) => current.filter((id) => id !== event.id));
      if (selected?.id === event.id) setSelected(null);
      await loadEvents(filters);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar el registro.");
    } finally {
      setDeleting(false);
    }
  }

  const actions = [...new Set(events.map((event) => event.accion))].sort();
  const modules = [...new Set(events.map((event) => event.modulo))].sort();

  return (
    <section className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Panel Administrativo · Global</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Actividad y auditoría</h1>
          <p className="mt-1 text-sm text-foreground-muted">Consulta la actividad en lenguaje claro y abre el registro técnico cuando lo necesites.</p>
        </div>
        <Button variant="secondary" onClick={() => void loadEvents(filters)} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </header>

      <div className="flex gap-2" role="tablist" aria-label="Vista de actividad">
        <Button role="tab" aria-selected={view === "actividad"} variant={view === "actividad" ? "primary" : "secondary"} onClick={() => setView("actividad")}><Activity className="size-4" /> Actividad</Button>
        <Button role="tab" aria-selected={view === "auditoria"} variant={view === "auditoria" ? "primary" : "secondary"} onClick={() => setView("auditoria")}><ScrollText className="size-4" /> Auditoría</Button>
      </div>

      <Card title="Filtros" description="Filtra por persona, acción, módulo, fecha y resultado.">
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-foreground-secondary">Usuario
            <input value={draft.usuario} onChange={(event) => setDraft({ ...draft, usuario: event.target.value })} placeholder="Nombre o ID" className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </label>
          <label className="text-xs font-medium text-foreground-secondary">Acción
            <select value={draft.accion} onChange={(event) => setDraft({ ...draft, accion: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Todas</option>{actions.map((action) => <option key={action}>{action}</option>)}</select>
          </label>
          <label className="text-xs font-medium text-foreground-secondary">Módulo
            <select value={draft.modulo} onChange={(event) => setDraft({ ...draft, modulo: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Todos</option>{modules.map((module) => <option key={module}>{module}</option>)}</select>
          </label>
          <label className="text-xs font-medium text-foreground-secondary">Desde
            <input type="date" value={draft.fecha_desde} onChange={(event) => setDraft({ ...draft, fecha_desde: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </label>
          <label className="text-xs font-medium text-foreground-secondary">Hasta
            <input type="date" value={draft.fecha_hasta} onChange={(event) => setDraft({ ...draft, fecha_hasta: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
          </label>
          <label className="text-xs font-medium text-foreground-secondary">Resultado
            <select value={draft.resultado} onChange={(event) => setDraft({ ...draft, resultado: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Todos</option><option value="REGISTRADO">Registrado</option><option value="ERROR">Error</option></select>
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit"><Search className="size-4" /> Aplicar filtros</Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>Limpiar</Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={events.length > 0 && events.every((event) => selectedIds.includes(event.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...events.map((item) => item.id)])] : current.filter((id) => !events.some((item) => item.id === id)))} />Seleccionar eventos visibles</label><span className="text-sm text-foreground-muted">{selectedIds.length} seleccionados</span><button type="button" disabled={!selectedIds.length || deleting} onClick={() => void deleteSelected()} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50"><Trash2 className="size-4" />{deleting ? "Eliminando…" : "Eliminar seleccionados"}</button><button type="button" disabled={!selectedIds.length} onClick={exportSelected} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">Exportar selección CSV</button></div>

      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {loading ? <LoadingState label="Cargando actividad" rows={5} /> : events.length === 0 ? (
        <EmptyState title="No hay eventos para estos filtros" description="Prueba otro rango de fechas o limpia los filtros." icon={FileSearch} />
      ) : view === "actividad" ? (
        <div className="space-y-3">
          {events.map((event) => <Card key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <input type="checkbox" checked={selectedIds.includes(event.id)} onChange={() => setSelectedIds((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} aria-label={`Seleccionar evento ${event.id}`} />
            <div className="min-w-0">
              <p className="font-medium">{event.descripcion}</p>
              <p className="mt-1 text-sm text-foreground-muted">{event.recurso}{event.recurso_id ? ` · ${event.recurso_id}` : ""} · {formatDate(event.created_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={event.resultado === "ERROR" ? "risk" : "completed"}>{event.resultado === "ERROR" ? "Error" : "Evento registrado"}</Badge>
              <Button size="sm" variant="secondary" onClick={() => setSelected(event)}>Ver detalle</Button><button type="button" disabled={deleting} onClick={() => void deleteEvent(event)} aria-label={`Eliminar registro de auditoría ${event.id}`} className="inline-flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50"><Trash2 className="size-4" />Eliminar</button>
            </div>
          </Card>)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted"><tr><th className="px-4 py-3"><span className="sr-only">Selección</span></th><th className="px-4 py-3">Cuándo</th><th className="px-4 py-3">Quién</th><th className="px-4 py-3">Qué hizo</th><th className="px-4 py-3">Sobre qué</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3">Detalle</th></tr></thead>
            <tbody>{events.map((event) => <tr key={event.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(event.id)} onChange={() => setSelectedIds((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} aria-label={`Seleccionar evento ${event.id}`} /></td><td className="px-4 py-3">{formatDate(event.created_at)}</td><td className="px-4 py-3">{event.actor}<span className="block text-xs text-foreground-muted">ID {event.actor_id ?? "Sistema"}</span></td><td className="px-4 py-3">{event.descripcion}<span className="block font-mono text-xs text-foreground-muted">{event.accion}</span></td><td className="px-4 py-3">{event.recurso}<span className="block text-xs text-foreground-muted">{event.tipo_recurso} · {event.recurso_id ?? "sin ID"}</span></td><td className="px-4 py-3"><Badge tone={event.resultado === "ERROR" ? "risk" : "completed"}>{event.resultado === "ERROR" ? "Error" : "Registrado"}</Badge></td><td className="px-4 py-3"><Button size="sm" variant="secondary" onClick={() => setSelected(event)}>Ver detalle</Button><button type="button" disabled={deleting} onClick={() => void deleteEvent(event)} aria-label={`Eliminar registro de auditoría ${event.id}`} className="inline-flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50"><Trash2 className="size-4" />Eliminar</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {!loading && <p className="text-xs text-foreground-muted">Mostrando {events.length} eventos, máximo 200 por consulta.</p>}

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface shadow-xl">
          <header className="flex items-start justify-between gap-4 border-b border-border p-5"><div><p className="text-xs uppercase tracking-wide text-foreground-muted">{selected.actor} · {formatDate(selected.created_at)}</p><h2 id="audit-detail-title" className="mt-1 text-lg font-semibold">{selected.descripcion}</h2></div><Button variant="ghost" aria-label="Cerrar detalle" onClick={() => setSelected(null)}><X className="size-4" /></Button></header>
          <div className="space-y-5 p-5"><div><h3 className="mb-3 text-sm font-semibold">Vista humana</h3><p className="text-sm">{selected.actor} {selected.descripcion.replace(`${selected.actor} `, "")}</p><p className="mt-2 text-sm text-foreground-muted">Resultado: evento registrado.</p></div>
            <div><h3 className="mb-3 text-sm font-semibold">Detalle técnico</h3><dl className="grid gap-4 rounded-lg bg-surface-secondary p-4 sm:grid-cols-2"><DetailValue label="Endpoint" value={selected.detalle_tecnico.endpoint} /><DetailValue label="Método" value={selected.detalle_tecnico.metodo} /><DetailValue label="Recurso" value={selected.detalle_tecnico.recurso} /><DetailValue label="ID" value={selected.detalle_tecnico.id} /><DetailValue label="Metadata" value={selected.detalle_tecnico.metadata ? JSON.stringify(selected.detalle_tecnico.metadata) : null} /><DetailValue label="Error técnico" value={selected.detalle_tecnico.error || "No asociado a este evento"} /></dl></div>
            <div className="flex justify-end"><Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface-hover px-4 text-sm font-semibold" href={selected.href} onClick={() => setSelected(null)}>Abrir recurso <ExternalLink className="size-4" /></Link></div>
          </div>
        </section>
      </div>}
    </section>
  );
}
