"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, ExternalLink, Mail, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type Notification = { id: string; tipo: string; prioridad: "Alta" | "Media" | "Baja"; fecha: string | null; descripcion: string; recurso: string; href: string; estado: string; categoria: string; leida: boolean };
type Category = "Todas" | "procesos" | "tareas" | "documentos" | "solicitudes" | "usuarios" | "operacion" | "sistema";
const categories: Category[] = ["Todas", "procesos", "tareas", "documentos", "solicitudes", "usuarios", "operacion", "sistema"];
const categoryLabel: Record<Category, string> = { Todas: "Todas", procesos: "Procesos", tareas: "Tareas", documentos: "Documentos", solicitudes: "Solicitudes", usuarios: "Usuarios", operacion: "Operación", sistema: "Sistema" };

export default function AdminNotificationCenterPage() {
  const { token } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  const [category, setCategory] = useState<Category>("Todas");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result: Notification[] = await fetchApi("/api/admin/alertas?limite=500", { method: "GET", token });
      setItems(result.filter((item) => item.estado !== "ELIMINADA"));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar las notificaciones."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function markRead(ids: string[]) {
    if (!token || !ids.length) return;
    setBusy(true); setError("");
    try {
      await fetchApi("/api/admin/notificaciones/leer", { method: "POST", token, body: JSON.stringify({ ids }) });
      const selected = new Set(ids);
      setItems((current) => current.map((item) => selected.has(item.id) ? { ...item, leida: true } : item));
      setSelectedIds((current) => current.filter((id) => !selected.has(id)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar el estado de lectura."); }
    finally { setBusy(false); }
  }

  async function markAllRead() {
    if (!token) return;
    setBusy(true); setError("");
    try {
      await fetchApi("/api/admin/notificaciones/leer-todas", { method: "POST", token });
      setItems((current) => current.map((item) => ({ ...item, leida: true })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron marcar como leídas."); }
    finally { setBusy(false); }
  }

  const visible = useMemo(() => items.filter((item) => (category === "Todas" || item.categoria === category) && (!unreadOnly || !item.leida) && (!query.trim() || `${item.descripcion} ${item.recurso} ${item.tipo}`.toLowerCase().includes(query.trim().toLowerCase()))), [category, items, unreadOnly, query]);
  const unread = items.filter((item) => !item.leida).length;

  return <section className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Panel Administrativo</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Bell className="size-6" />Centro de notificaciones</h1><p className="mt-1 text-sm text-foreground-muted">Avisos derivados de pendientes, actividad y errores registrados en la plataforma.</p></div><div className="flex gap-2"><button type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading || busy} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button><button type="button" onClick={() => void markAllRead()} disabled={!unread || busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"><Check className="size-4" />Marcar todo como leído</button></div></header>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3"><div className="flex flex-wrap gap-2" role="group" aria-label="Categorías de notificaciones">{categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`rounded-md px-3 py-1.5 text-sm ${category === item ? "bg-primary text-white" : "border border-border hover:bg-surface-hover"}`}>{categoryLabel[item]}</button>)}</div><label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Solo no leídas <span className="rounded-full bg-danger-light px-2 py-0.5 text-xs font-semibold text-danger">{unread}</span></label></div>
    <label className="block"><span className="sr-only">Buscar en notificaciones</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por descripción, recurso o tipo" className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm sm:max-w-xl" /></label>
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.length > 0 && visible.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visible.map((item) => item.id)])] : current.filter((id) => !visible.some((item) => item.id === id)))} />Seleccionar notificaciones visibles</label><span className="text-sm text-foreground-muted">{selectedIds.length} seleccionadas</span><button type="button" disabled={busy || !selectedIds.some((id) => visible.some((item) => item.id === id && !item.leida))} onClick={() => void markRead(selectedIds.filter((id) => visible.some((item) => item.id === id && !item.leida)))} className="ml-auto rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Marcar selección como leída</button></div>
    <Link href="/gestion-procesos/admin/notificaciones/entregas" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm"><Mail className="size-4" />Ver todos los envios construidos de correo y WhatsApp</Link>
    {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
    {loading ? <div className="py-16 text-center text-sm text-foreground-muted">Cargando notificaciones…</div> : visible.length ? <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">{visible.map((item) => <article key={item.id} className={`flex flex-wrap items-center gap-3 p-4 ${item.leida ? "" : "bg-primary/5"}`}><input type="checkbox" aria-label={`Seleccionar notificación ${item.descripcion}`} checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span aria-label={item.leida ? "Leída" : "No leída"} className={`size-2 shrink-0 rounded-full ${item.leida ? "bg-transparent" : "bg-primary"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-primary">{categoryLabel[item.categoria as Category] ?? "Sistema"}</span><span className="text-xs text-foreground-muted">{item.prioridad} · {item.tipo}</span></div><p className="mt-1 font-medium">{item.descripcion}</p><p className="mt-1 text-xs text-foreground-muted">{item.recurso}{item.fecha ? ` · ${new Date(item.fecha).toLocaleString("es-CO")}` : ""}</p></div><Link href={item.href} onClick={() => { if (!item.leida) void markRead([item.id]); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-surface-hover"><ExternalLink className="size-4" />Abrir</Link>{!item.leida && <button type="button" disabled={busy} onClick={() => void markRead([item.id])} className="h-9 rounded-md px-3 text-sm text-primary hover:bg-primary/5 disabled:opacity-50">Marcar leída</button>}</article>)}</div> : <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-foreground-muted">No hay notificaciones en esta vista.</div>}
  </section>;
}
