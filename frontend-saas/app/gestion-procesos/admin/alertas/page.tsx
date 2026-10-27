"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, ExternalLink, RefreshCw, Trash2, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useSession } from "@/context/SessionContext";

type AlertState = "ACTIVA" | "ATENDIDA" | "DESCARTADA" | "ELIMINADA";
type AlertItem = {
  id: string;
  tipo: string;
  prioridad: "Alta" | "Media" | "Baja";
  fecha: string | null;
  descripcion: string;
  recurso: string;
  href: string;
  accion_recomendada: string;
  estado: AlertState;
  descartable: boolean;
};
type Filter = "Todas" | "Activas" | "Pendientes" | "Advertencias" | "Errores" | "Riesgos" | "Eventos" | "Atendidas" | "Eliminadas";

const filters: Filter[] = ["Todas", "Activas", "Pendientes", "Advertencias", "Errores", "Riesgos", "Eventos", "Atendidas", "Eliminadas"];
const priorityTone = { Alta: "risk", Media: "attention", Baja: "normal" } as const;

export default function AdminAlertsPage() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<Filter>("Activas");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const { token } = useSession();

  const load = useCallback(async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setLoading(true);
    try {
      const result: AlertItem[] = await fetchApi("/api/admin/alertas", { method: "GET", token });
      setItems(result);
      setSelectedIds((current) => current.filter((id) => result.some((item) => item.id === id)));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar las alertas.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(true), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  async function applyBulkAction(estado: "ATENDIDA" | "DESCARTADA" | "ELIMINADA", ids = selectedIds) {
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      await fetchApi("/api/admin/alertas/acciones", {
        method: "POST", token, body: JSON.stringify({ alerta_ids: ids, estado }),
      });
      setSelectedIds([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar las alertas.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    const pendingDeleteCount = items.filter((item) => item.estado !== "ELIMINADA").length;
    if (!pendingDeleteCount || !window.confirm(`¿Eliminar todas las ${pendingDeleteCount} alertas de la lista?`)) return;
    setBusy(true);
    setError("");
    try {
      await fetchApi("/api/admin/alertas", { method: "DELETE", token });
      setSelectedIds([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar todas las alertas.");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => items.filter((item) => {
    if (query.trim() && !`${item.descripcion} ${item.recurso} ${item.tipo} ${item.accion_recomendada}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    const day = item.fecha?.slice(0, 10) ?? "";
    if (dateFrom && (!day || day < dateFrom)) return false;
    if (dateTo && (!day || day > dateTo)) return false;
    if (filter === "Activas") return item.estado === "ACTIVA";
    if (filter === "Atendidas") return item.estado === "ATENDIDA" || item.estado === "DESCARTADA";
    if (filter === "Eliminadas") return item.estado === "ELIMINADA";
    if (filter === "Pendientes") return item.tipo === "Pendiente";
    if (filter === "Advertencias") return item.tipo === "Advertencia";
    if (filter === "Errores") return item.tipo === "Error";
    if (filter === "Riesgos") return item.tipo === "Riesgo";
    if (filter === "Eventos") return item.tipo === "Evento";
    return true;
  }), [filter, items, query, dateFrom, dateTo]);
  const visibleIds = visible.map((item) => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const canDiscardSelection = selectedItems.length > 0 && selectedItems.every((item) => item.descartable);
  const activeCount = items.filter((item) => item.estado === "ACTIVA").length;

  function toggleAllVisible() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  return (
    <div className="motion-swap mx-auto max-w-7xl space-y-6">
      <PageHeader
        overline="Centro de atención"
        title="Alertas"
        description="Pendientes, riesgos y eventos importantes de la operación."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load(true)} disabled={loading || busy} icon={<RefreshCw className="size-4" />}>
              Actualizar
            </Button>
            <Button variant="danger" onClick={() => void deleteAll()} disabled={!items.length || busy} icon={<Trash2 className="size-4" />}>
              Eliminar todas
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Alertas activas" value={activeCount} icon={Bell} tone={activeCount > 0 ? "warning" : "default"} />
        <StatCard label="Errores y riesgos" value={items.filter((item) => item.estado === "ACTIVA" && ["Error", "Riesgo"].includes(item.tipo)).length} icon={Bell} tone={items.some((item) => item.estado === "ACTIVA" && ["Error", "Riesgo"].includes(item.tipo)) ? "danger" : "default"} />
        <StatCard label="Pendientes y eventos" value={items.filter((item) => item.estado === "ACTIVA" && ["Pendiente", "Evento"].includes(item.tipo)).length} icon={Bell} />
      </div>

      <FilterBar>
        <div className="grid w-full gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label><span className="sr-only">Buscar alertas</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alerta o recurso" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" /></label>
          <label className="flex items-center gap-2 text-xs text-foreground-muted">Desde<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
          <label className="flex items-center gap-2 text-xs text-foreground-muted">Hasta<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar alertas">
          {filters.map((option) => <Button key={option} size="sm" variant={filter === option ? "primary" : "secondary"} onClick={() => setFilter(option)}>{option}</Button>)}
        </div>
      </FilterBar>

      {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <span className="mr-auto text-sm font-medium">{selectedIds.length} seleccionadas</span>
        <Button size="sm" onClick={() => void applyBulkAction("ATENDIDA")} disabled={busy}><Check className="mr-1 size-4" /> Marcar atendidas</Button>
        <Button size="sm" variant="secondary" onClick={() => void applyBulkAction("DESCARTADA")} disabled={busy || !canDiscardSelection}><X className="mr-1 size-4" /> Descartar</Button>
        <Button size="sm" variant="danger" onClick={() => void applyBulkAction("ELIMINADA")} disabled={busy}><Trash2 className="mr-1 size-4" /> Eliminar selección</Button>
      </div>}

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</div>}
      {loading ? <LoadingState label="Cargando alertas" rows={5} /> : visible.length === 0 ? (
        <EmptyState title={filter === "Activas" ? "Todo está al día" : "No hay alertas en esta vista"} description="Las alertas aparecen cuando hay pendientes o eventos reales que requieren atención." />
      ) : (
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-surface-secondary text-xs uppercase text-foreground-muted">
              <tr>
                <th className="w-12 px-3 py-3"><input type="checkbox" aria-label="Seleccionar todas las alertas visibles" checked={allVisibleSelected} onChange={toggleAllVisible} /></th>
                <th className="px-3 py-3">Alerta</th><th className="px-3 py-3">Prioridad</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Recurso</th><th className="px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((item) => <tr key={item.id} className="align-top hover:bg-surface-hover/50">
                <td className="px-3 py-3"><input type="checkbox" aria-label={`Seleccionar ${item.descripcion}`} checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /></td>
                <td className="max-w-md px-3 py-3"><p className="font-semibold">{item.descripcion}</p><p className="mt-1 text-xs text-foreground-muted">{item.accion_recomendada}</p></td>
                <td className="px-3 py-3"><Badge tone={priorityTone[item.prioridad]}>{item.prioridad}</Badge></td>
                <td className="px-3 py-3"><Badge tone={item.estado === "ACTIVA" ? "pending" : item.estado === "ATENDIDA" ? "completed" : "archived"}>{item.estado === "ACTIVA" ? item.tipo : item.estado === "ATENDIDA" ? "Atendida" : item.estado === "DESCARTADA" ? "Descartada" : "Eliminada"}</Badge></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-foreground-muted">{item.fecha ? <time dateTime={item.fecha}>{new Date(item.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</time> : "—"}</td>
                <td className="px-3 py-3">{item.recurso}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                  <Link className="inline-flex min-h-8 items-center gap-1 rounded-md bg-surface-hover px-2 text-xs font-semibold" href={item.href}><ExternalLink className="size-3.5" /> Abrir</Link>
                  {item.estado === "ACTIVA" && <button type="button" onClick={() => void applyBulkAction("ATENDIDA", [item.id])} disabled={busy} title="Marcar atendida" aria-label={`Marcar atendida: ${item.descripcion}`} className="grid size-11 place-items-center rounded-md hover:bg-surface-hover disabled:opacity-50"><Check className="size-4" /></button>}
                  {item.estado === "ACTIVA" && item.descartable && <button type="button" onClick={() => void applyBulkAction("DESCARTADA", [item.id])} disabled={busy} title="Descartar" aria-label={`Descartar: ${item.descripcion}`} className="grid size-11 place-items-center rounded-md hover:bg-surface-hover disabled:opacity-50"><X className="size-4" /></button>}
                  {item.estado !== "ELIMINADA" && <button type="button" onClick={() => void applyBulkAction("ELIMINADA", [item.id])} disabled={busy} title="Eliminar" aria-label={`Eliminar: ${item.descripcion}`} className="grid size-11 place-items-center rounded-md text-danger hover:bg-danger-light disabled:opacity-50"><Trash2 className="size-4" /></button>}
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {!loading && visible.length > 0 && <div className="space-y-3 md:hidden">
        {visible.map((item) => <article key={item.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <input type="checkbox" aria-label={`Seleccionar ${item.descripcion}`} checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} className="mt-1 size-4" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={priorityTone[item.prioridad]}>{item.prioridad}</Badge><Badge tone={item.estado === "ACTIVA" ? "pending" : item.estado === "ATENDIDA" ? "completed" : "archived"}>{item.estado === "ACTIVA" ? item.tipo : item.estado === "ATENDIDA" ? "Atendida" : item.estado === "DESCARTADA" ? "Descartada" : "Eliminada"}</Badge></div>
              <p className="mt-2 break-words font-semibold">{item.descripcion}</p>
              <p className="mt-1 break-words text-sm text-foreground-muted">{item.accion_recomendada}</p>
              <p className="mt-2 text-xs text-foreground-muted">{item.fecha ? new Date(item.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "Sin fecha"}{item.recurso ? ` · ${item.recurso}` : ""}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1">
                <Link className="inline-flex min-h-11 items-center gap-1 rounded-md bg-surface-hover px-3 text-sm font-semibold" href={item.href}><ExternalLink className="size-4" />Abrir</Link>
                {item.estado === "ACTIVA" && <button type="button" onClick={() => void applyBulkAction("ATENDIDA", [item.id])} disabled={busy} aria-label={`Marcar atendida: ${item.descripcion}`} className="grid size-11 place-items-center rounded-md hover:bg-surface-hover disabled:opacity-50"><Check className="size-4" /></button>}
                {item.estado === "ACTIVA" && item.descartable && <button type="button" onClick={() => void applyBulkAction("DESCARTADA", [item.id])} disabled={busy} aria-label={`Descartar: ${item.descripcion}`} className="grid size-11 place-items-center rounded-md hover:bg-surface-hover disabled:opacity-50"><X className="size-4" /></button>}
                {item.estado !== "ELIMINADA" && <button type="button" onClick={() => void applyBulkAction("ELIMINADA", [item.id])} disabled={busy} aria-label={`Eliminar: ${item.descripcion}`} className="grid size-11 place-items-center rounded-md text-danger hover:bg-danger-light disabled:opacity-50"><Trash2 className="size-4" /></button>}
              </div>
            </div>
          </div>
        </article>)}
      </div>}
    </div>
  );
}
