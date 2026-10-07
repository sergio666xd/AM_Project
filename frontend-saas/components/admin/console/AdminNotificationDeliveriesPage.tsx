"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Pagination } from "@/components/ui/Pagination";

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

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/gestion-procesos/admin/notificaciones" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-4" />Centro de notificaciones</Link>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary">Panel Administrativo</p>
          <h1 className="mt-1 text-2xl font-semibold">Entregas de correo y WhatsApp</h1>
          <p className="mt-1 text-sm text-foreground-muted">Historial de mensajes construidos, destinatarios, contenido y resultado de cada intento.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
      </header>

      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-3">
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

      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {loading ? <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-foreground-muted">Cargando entregas…</div> : items.length === 0 ? <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-foreground-muted">No hay entregas para estos filtros.</div> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-secondary text-xs uppercase text-foreground-muted"><tr><th className="px-4 py-3">Creada</th><th className="px-4 py-3">Canal / estado</th><th className="px-4 py-3">Destinatario</th><th className="px-4 py-3">Tipo / asunto</th><th className="px-4 py-3">Mensaje construido</th></tr></thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => <tr key={item.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground-muted">{new Date(item.creada_en).toLocaleString("es-CO")}<br />{item.enviada_en ? `Enviada: ${new Date(item.enviada_en).toLocaleString("es-CO")}` : `Intentos: ${item.intentos}`}</td>
                <td className="px-4 py-3"><span className="font-semibold">{item.canal === "EMAIL" ? "Correo" : "WhatsApp"}</span><br /><span className="text-xs text-foreground-muted">{item.estado}</span>{item.error && <p className="mt-1 max-w-52 text-xs text-danger">{item.error}</p>}</td>
                <td className="px-4 py-3"><p className="font-medium">{item.destinatario}</p><p className="text-xs text-foreground-muted">{item.canal === "EMAIL" ? item.email : item.whatsapp}</p></td>
                <td className="px-4 py-3"><p className="text-xs font-semibold uppercase text-primary">{item.tipo}</p><p className="mt-1 max-w-64">{item.asunto}</p></td>
                <td className="px-4 py-3"><details><summary className="cursor-pointer text-primary hover:underline">Ver contenido</summary><pre className="mt-2 max-h-80 max-w-xl overflow-auto whitespace-pre-wrap rounded-md bg-surface-secondary p-3 text-xs">{item.cuerpo}</pre></details></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="entregas" />
    </section>
  );
}
