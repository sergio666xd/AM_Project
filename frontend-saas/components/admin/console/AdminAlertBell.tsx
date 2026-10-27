"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
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
  const [marking, setMarking] = useState(false);
  const [actionError, setActionError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token || document.visibilityState !== "visible") return;
    try {
      // La campana solo muestra alertas activas; atendidas y descartadas quedan en el centro de notificaciones.
      const alerts: AlertItem[] = await fetchApi("/api/admin/alertas?limite=5&solo_activas=true", { method: "GET", token });
      setItems(alerts);
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

  // Marcar como leídas limpia el contador. Descartar o atender se hace desde el
  // centro de notificaciones, porque los errores deben resolverse en su recurso.
  async function markAllRead() {
    if (!token) return;
    setMarking(true);
    setActionError("");
    try {
      await fetchApi("/api/admin/notificaciones/leer-todas", { method: "POST", token });
      setItems((current) => current.map((alert) => ({ ...alert, leida: true })));
    } catch {
      setActionError("No fue posible marcar las alertas como leídas.");
    } finally {
      setMarking(false);
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
      <button type="button" aria-label="Abrir alertas activas" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((current) => !current)} className="relative grid size-10 place-items-center rounded-lg border border-border text-foreground-secondary hover:bg-surface-hover">
        <Bell className="size-5" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
      </button>
      {open && <section role="dialog" aria-label="Alertas activas" className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">Alertas activas</h2><p className="text-xs text-foreground-muted">Las cinco más recientes</p></div>{unreadCount > 0 && <button type="button" disabled={marking} onClick={() => void markAllRead()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-surface-hover disabled:opacity-50"><CheckCheck className="size-3.5" aria-hidden="true" />{marking ? "Marcando…" : "Marcar como leídas"}</button>}</header>
        {actionError && <p role="alert" className="px-4 pt-2 text-xs text-danger">{actionError}</p>}
        {items.length ? <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {items.map((item) => <li key={item.id}><Link href={item.href} onClick={() => { void markRead(item); setOpen(false); }} className={`block px-4 py-3 hover:bg-surface-hover ${item.leida ? "opacity-70" : "bg-brand-50"}`}><span className="flex items-center justify-between gap-2"><span className="line-clamp-2 text-sm font-medium">{item.descripcion}</span><ExternalLink className="size-3.5 shrink-0 text-foreground-muted" /></span><span className="mt-1 flex justify-between gap-2 text-xs text-foreground-muted"><span className="capitalize">{item.categoria} · {item.tipo} · {item.prioridad}</span><span>{item.fecha ? new Date(item.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : ""}</span></span></Link></li>)}
        </ul> : <p className="px-4 py-8 text-center text-sm text-foreground-muted">No hay alertas activas.</p>}
        <Link href="/gestion-procesos/admin/notificaciones" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-surface-hover">Abrir centro de notificaciones</Link>
      </section>}
    </div>
  );
}
