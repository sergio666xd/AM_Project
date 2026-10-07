"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Download, ExternalLink } from "lucide-react";
import { fetchApi } from "@/lib/api";

type AlertItem = {
  id: string;
  tipo: string;
  prioridad: "Alta" | "Media" | "Baja";
  fecha: string | null;
  descripcion: string;
  recurso: string;
  href: string;
  estado: "ACTIVA" | "ATENDIDA" | "DESCARTADA" | "ELIMINADA";
  categoria: string;
  leida: boolean;
};

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function AdminAlertBell({ token }: { token: string | null }) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token || document.visibilityState !== "visible") return;
    try {
      const alerts: AlertItem[] = await fetchApi("/api/admin/alertas?limite=5", { method: "GET", token });
      setItems(alerts.filter((item) => item.estado !== "ELIMINADA"));
    } catch {
      // The bell is a convenience; the alerts page reports loading errors.
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const handlePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [refresh, token]);

  async function downloadAll() {
    if (!token) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const alerts: AlertItem[] = await fetchApi("/api/admin/alertas", { method: "GET", token });
      const columns = ["Fecha", "Descripción", "Tipo", "Prioridad", "Estado", "Recurso", "URL", "ID"];
      const rows = alerts.filter((item) => item.estado !== "ELIMINADA").map((item) => [
        item.fecha ? new Date(item.fecha).toLocaleString("es-CO") : "",
        item.descripcion,
        item.tipo,
        item.prioridad,
        item.estado,
        item.recurso,
        new URL(item.href, window.location.origin).toString(),
        item.id,
      ]);
      const csv = [columns, ...rows].map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `alertas-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("No fue posible descargar las alertas.");
    } finally {
      setDownloading(false);
    }
  }

  async function markRead(item: AlertItem) {
    if (!token || item.leida) return;
    try {
      await fetchApi("/api/admin/notificaciones/leer", { method: "POST", token, body: JSON.stringify({ ids: [item.id] }) });
      setItems((current) => current.map((alert) => alert.id === item.id ? { ...alert, leida: true } : alert));
    } catch { /* La vista completa mostrará el error al cargar. */ }
  }

  const unreadCount = items.filter((item) => !item.leida).length;

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" aria-label="Abrir alertas recientes" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)} className="relative grid size-10 place-items-center rounded-lg border border-border text-foreground-secondary hover:bg-surface-hover">
        <Bell className="size-5" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
      </button>
      {open && <section role="dialog" aria-label="Alertas recientes" className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">Alertas recientes</h2><p className="text-xs text-foreground-muted">Las cinco últimas</p></div><button type="button" disabled={downloading} onClick={() => void downloadAll()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"><Download className="size-3.5" />Descargar todas</button></header>
        {downloadError && <p role="alert" className="px-4 pt-2 text-xs text-danger">{downloadError}</p>}
        {items.length ? <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {items.map((item) => <li key={item.id}><Link href={item.href} onClick={() => { void markRead(item); setOpen(false); }} className={`block px-4 py-3 hover:bg-surface-hover ${item.leida ? "opacity-70" : "bg-primary/5"}`}><span className="flex items-center justify-between gap-2"><span className="line-clamp-2 text-sm font-medium">{item.descripcion}</span><ExternalLink className="size-3.5 shrink-0 text-foreground-muted" /></span><span className="mt-1 flex justify-between gap-2 text-xs text-foreground-muted"><span>{item.categoria} · {item.estado === "ACTIVA" ? item.tipo : item.estado === "ATENDIDA" ? "Atendida" : "Descartada"} · {item.prioridad}</span><span>{item.fecha ? new Date(item.fecha).toLocaleDateString("es-CO") : ""}</span></span></Link></li>)}
        </ul> : <p className="px-4 py-8 text-center text-sm text-foreground-muted">No hay alertas recientes.</p>}
        <Link href="/gestion-procesos/admin/notificaciones" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-surface-hover">Abrir centro de notificaciones</Link>
      </section>}
    </div>
  );
}
