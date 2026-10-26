"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ExternalLink, X } from "lucide-react";
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
  descartable: boolean;
};

export function AdminAlertBell({ token }: { token: string | null }) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
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

  async function discardAll() {
    if (!token) return;
    setDiscarding(true);
    setActionMessage("");
    setActionError("");
    try {
      const alerts: AlertItem[] = await fetchApi("/api/admin/alertas", { method: "GET", token });
      const discardable = alerts.filter((item) => item.estado === "ACTIVA" && item.descartable);
      if (!discardable.length) {
        setActionMessage("No hay alertas activas que se puedan descartar.");
        return;
      }
      if (!window.confirm("Descartar las " + discardable.length + " alertas que permiten esta accion?")) return;
      await fetchApi("/api/admin/alertas/acciones", {
        method: "POST", token,
        body: JSON.stringify({ alerta_ids: discardable.map((item) => item.id), estado: "DESCARTADA" }),
      });
      const pendientesNoDescartables = alerts.filter((item) => item.estado === "ACTIVA" && !item.descartable).length;
      setActionMessage(discardable.length + " alertas descartadas." + (pendientesNoDescartables ? " " + pendientesNoDescartables + " deben resolverse desde su recurso." : ""));
      await refresh();
    } catch {
      setActionError("No fue posible descartar las alertas.");
    } finally {
      setDiscarding(false);
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
        <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">Alertas recientes</h2><p className="text-xs text-foreground-muted">Las cinco mas recientes</p></div><button type="button" disabled={discarding} onClick={() => void discardAll()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"><X className="size-3.5" />{discarding ? "Procesando" : "Descartar todas"}</button></header>
        {actionError && <p role="alert" className="px-4 pt-2 text-xs text-danger">{actionError}</p>}
        {actionMessage && <p role="status" className="px-4 pt-2 text-xs text-foreground-muted">{actionMessage}</p>}
        {items.length ? <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {items.map((item) => <li key={item.id}><Link href={item.href} onClick={() => { void markRead(item); setOpen(false); }} className={`block px-4 py-3 hover:bg-surface-hover ${item.leida ? "opacity-70" : "bg-brand-50"}`}><span className="flex items-center justify-between gap-2"><span className="line-clamp-2 text-sm font-medium">{item.descripcion}</span><ExternalLink className="size-3.5 shrink-0 text-foreground-muted" /></span><span className="mt-1 flex justify-between gap-2 text-xs text-foreground-muted"><span>{item.categoria} · {item.estado === "ACTIVA" ? item.tipo : item.estado === "ATENDIDA" ? "Atendida" : "Descartada"} · {item.prioridad}</span><span>{item.fecha ? new Date(item.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : ""}</span></span></Link></li>)}
        </ul> : <p className="px-4 py-8 text-center text-sm text-foreground-muted">No hay alertas recientes.</p>}
        <Link href="/gestion-procesos/admin/notificaciones" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-surface-hover">Abrir centro de notificaciones</Link>
      </section>}
    </div>
  );
}
