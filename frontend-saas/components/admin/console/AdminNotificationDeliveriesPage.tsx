"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Delivery = {
  id: number;
  tipo: string;
  canal: "EMAIL" | "WHATSAPP";
  estado: string;
  asunto: string;
  cuerpo: string;
  destinatario: string;
  email: string;
  whatsapp: string;
  intentos: number;
  error: string | null;
  creada_en: string;
  enviada_en: string | null;
};

type DeliveryPage = { items: Delivery[]; total: number; limite: number; offset: number };
const PAGE_SIZE = 50;

export default function AdminNotificationDeliveriesPage() {
  const { token } = useSession();
  const [items, setItems] = useState<Delivery[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("TODOS");
  const [status, setStatus] = useState("TODOS");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ limite: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (channel !== "TODOS") params.set("canal", channel);
    if (status !== "TODOS") params.set("estado", status);
    try {
      const response: DeliveryPage = await fetchApi(`/api/admin/notificaciones/entregas?${params}`, { method: "GET", token });
      setItems(response.items);
      setTotal(response.total);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar las entregas.");
    } finally {
      setLoading(false);
    }
  }, [channel, page, status, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function changeChannel(value: string) {
    setChannel(value);
    setPage(1);
  }

  function changeStatus(value: string) {
    setStatus(value);
    setPage(1);
  }

  const visible = items.filter((item) =>
    (!query.trim() || `${item.tipo} ${item.asunto} ${item.destinatario} ${item.email} ${item.whatsapp} ${item.cuerpo} ${item.error ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (!dateFrom || item.creada_en.slice(0, 10) >= dateFrom) && (!dateTo || item.creada_en.slice(0, 10) <= dateTo)
  );
  function exportSelected() {
    const selected = visible.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) return;
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [["Creada", "Enviada", "Canal", "Estado", "Destinatario", "Tipo", "Asunto", "Cuerpo", "Error"], ...selected.map((item) => [item.creada_en, item.enviada_en, item.canal, item.estado, item.destinatario, item.tipo, item.asunto, item.cuerpo, item.error])].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = "entregas-notificacion.csv"; anchor.click(); URL.revokeObjectURL(url); setSelectedIds([]);
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/gestion-procesos/admin/notificaciones" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="size-4" />Centro de notificaciones</Link>
          <PageHeader overline="Panel Administrativo" title="Entregas de correo y WhatsApp" description="Historial de mensajes construidos, destinatarios, contenido y resultado de cada intento." action={<Button variant="outline" onClick={() => void load()} disabled={loading} icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}>Actualizar</Button>} />
        </div>
      </header>

      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="min-w-60 flex-1 text-sm">Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Destinatario, asunto o contenido" className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2" /></label>
        <label className="text-xs text-foreground-muted">Desde<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
        <label className="text-xs text-foreground-muted">Hasta<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
        <label className="flex items-center gap-2 text-sm">Canal
          <select value={channel} onChange={(event) => changeChannel(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2">
            <option value="TODOS">Todos</option><option value="EMAIL">Correo</option><option value="WHATSAPP">WhatsApp</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">Estado
          <select value={status} onChange={(event) => changeStatus(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2">
            <option value="TODOS">Todos</option><option value="PENDIENTE">Pendiente</option><option value="ENVIANDO">Enviando</option><option value="ENVIADA">Enviada</option><option value="ERROR">Error</option><option value="OMITIDA">Omitida</option><option value="DESCARTADA">Descartada</option>
          </select>
        </label>
        <span className="ml-auto self-center text-sm text-foreground-muted">{total} entregas</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.length > 0 && visible.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visible.map((item) => item.id)])] : current.filter((id) => !visible.some((item) => item.id === id)))} />Seleccionar resultados visibles</label><span className="text-sm text-foreground-muted">{selectedIds.length} seleccionadas</span><button type="button" disabled={!selectedIds.length} onClick={exportSelected} className="ml-auto rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Exportar selección CSV</button></div>
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {loading ? <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-foreground-muted">Cargando entregas…</div> : visible.length === 0 ? <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-foreground-muted">No hay entregas para estos filtros.</div> : (
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-secondary text-xs uppercase text-foreground-muted"><tr><th className="px-4 py-3"><span className="sr-only">Selección</span></th><th className="px-4 py-3">Creada</th><th className="px-4 py-3">Canal / estado</th><th className="px-4 py-3">Destinatario</th><th className="px-4 py-3">Tipo / asunto</th><th className="px-4 py-3">Mensaje construido</th></tr></thead>
            <tbody className="divide-y divide-border">
              {visible.map((item) => <tr key={item.id} className="align-top">
                <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} aria-label={`Seleccionar entrega ${item.id}`} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground-muted">{new Date(item.creada_en).toLocaleString("es-CO", { timeZone: "America/Bogota" })}<br />{item.enviada_en ? `Enviada: ${new Date(item.enviada_en).toLocaleString("es-CO", { timeZone: "America/Bogota" })}` : `Intentos: ${item.intentos}`}</td>
                <td className="px-4 py-3"><span className="font-semibold">{item.canal === "EMAIL" ? "Correo" : "WhatsApp"}</span><br /><span className="text-xs text-foreground-muted">{item.estado}</span>{item.error && <p className="mt-1 max-w-52 text-xs text-danger">{item.error}</p>}</td>
                <td className="px-4 py-3"><p className="font-medium">{item.destinatario}</p><p className="text-xs text-foreground-muted">{item.canal === "EMAIL" ? item.email : item.whatsapp}</p></td>
                <td className="px-4 py-3"><p className="text-xs font-semibold uppercase text-primary">{item.tipo}</p><p className="mt-1 max-w-64">{item.asunto}</p></td>
                <td className="px-4 py-3"><button type="button" onClick={() => setSelectedDelivery(item)} className="min-h-11 rounded-md px-3 text-left text-primary hover:bg-surface-hover hover:underline">Ver contenido y resultado</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {!loading && visible.length > 0 && <div className="space-y-3 md:hidden">
        {visible.map((item) => <article key={item.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} aria-label={`Seleccionar entrega ${item.id}`} className="mt-1 size-4" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.canal === "EMAIL" ? "Correo" : "WhatsApp"}</span><span className="rounded-full bg-surface-secondary px-2 py-1 text-xs">{item.estado}</span></div>
              <p className="mt-2 break-words text-sm font-medium">{item.destinatario}</p>
              <p className="mt-1 break-words text-xs text-foreground-muted">{item.tipo} · {item.asunto || "Sin asunto"}</p>
              <p className="mt-1 text-xs text-foreground-muted">{new Date(item.creada_en).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p>
              {item.error && <p className="mt-2 break-words text-xs text-danger">{item.error}</p>}
              <button type="button" onClick={() => setSelectedDelivery(item)} className="mt-3 min-h-11 rounded-md px-3 text-sm font-semibold text-primary hover:bg-surface-hover">Ver mensaje e historial</button>
            </div>
          </div>
        </article>)}
      </div>}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="entregas" />
      {selectedDelivery && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDelivery(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
          <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-border bg-surface p-4 sm:p-5"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{selectedDelivery.canal === "EMAIL" ? "Correo" : "WhatsApp"} · {selectedDelivery.estado}</p><h2 id="delivery-detail-title" className="mt-1 break-words text-lg font-semibold">{selectedDelivery.asunto || selectedDelivery.tipo}</h2><p className="mt-1 break-words text-sm text-foreground-muted">{selectedDelivery.destinatario}</p></div><button type="button" onClick={() => setSelectedDelivery(null)} aria-label="Cerrar detalle" className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-surface-hover"><X className="size-5" /></button></header>
          <div className="space-y-4 p-4 sm:p-5"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-foreground-muted">Creada</dt><dd className="mt-1 text-sm">{new Date(selectedDelivery.creada_en).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</dd></div><div><dt className="text-xs text-foreground-muted">Enviada</dt><dd className="mt-1 text-sm">{selectedDelivery.enviada_en ? new Date(selectedDelivery.enviada_en).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : `Intentos: ${selectedDelivery.intentos}`}</dd></div><div><dt className="text-xs text-foreground-muted">Tipo de mensaje</dt><dd className="mt-1 break-words text-sm">{selectedDelivery.tipo}</dd></div><div><dt className="text-xs text-foreground-muted">Destino</dt><dd className="mt-1 break-words text-sm">{selectedDelivery.canal === "EMAIL" ? selectedDelivery.email : selectedDelivery.whatsapp}</dd></div></dl>
            {selectedDelivery.error && <div className="rounded-md border border-danger/30 bg-danger-light p-3"><h3 className="text-sm font-semibold text-danger">Detalle del error</h3><p className="mt-1 break-words text-sm text-danger">{selectedDelivery.error}</p></div>}
            <div><h3 className="mb-2 text-sm font-semibold">Contenido construido</h3><pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-secondary p-4 text-sm">{selectedDelivery.cuerpo}</pre></div>
          </div>
        </section>
      </div>}
    </section>
  );
}
