"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Notice = { id: string; tipo: string; categoria: string; titulo: string; descripcion: string; fecha?: string | null; proceso: string; href: string; leida: boolean };

export default function NotificacionesClientePage() {
  const { token, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await fetchApi("/api/expedientes/cliente/notificaciones", { token }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || sessionLoading) return;
    let active = true;
    fetchApi("/api/expedientes/cliente/notificaciones", { token })
      .then((data: Notice[]) => { if (active) setItems(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las notificaciones."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, sessionLoading]);

  async function mark(ids: string[]) {
    if (!token || !ids.length) return;
    try {
      await fetchApi("/api/expedientes/cliente/notificaciones/leer", { method: "POST", token, body: JSON.stringify({ ids }) });
      setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, leida: true } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar las notificaciones.");
    }
  }

  async function markAll() {
    if (!token) return;
    try {
      await fetchApi("/api/expedientes/cliente/notificaciones/leer-todas", { method: "POST", token });
      setItems((current) => current.map((item) => ({ ...item, leida: true })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar las notificaciones.");
    }
  }

  const unread = useMemo(() => items.filter((item) => !item.leida).length, [items]);
  const visible = useMemo(() => unreadOnly ? items.filter((item) => !item.leida) : items, [items, unreadOnly]);

  return (
    <section className="mx-auto max-w-4xl space-y-5 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-(--foreground-muted)">Portal del cliente</p><h1 className="mt-1 text-2xl font-semibold">Notificaciones</h1><p className="mt-1 text-sm text-(--foreground-muted)">{unread} sin leer</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void markAll()} disabled={!unread || loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-50"><CheckCheck aria-hidden="true" className="size-4" />Marcar todas como leídas</button>
          <button type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading} aria-label="Actualizar notificaciones" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </header>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
        <div><p className="text-sm font-medium">Mostrar</p><p className="text-xs text-(--foreground-muted)">{unreadOnly ? `${visible.length} avisos sin leer` : `${visible.length} avisos en total`}</p></div>
        <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${unreadOnly ? "bg-primary !text-white" : "border border-border hover:bg-surface-hover"}`}>{unreadOnly ? "Solo sin leer" : "Todos"}</button>
      </div>
      {loading ? <p className="py-12 text-center text-sm text-(--foreground-muted)"><RefreshCw className="mr-2 inline size-4 animate-spin" />Cargando...</p> : visible.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" aria-label={unreadOnly ? "Notificaciones sin leer" : "Todas las notificaciones"}>
          {visible.map((item) => (
            <li key={item.id} className={`flex gap-3 p-4 ${item.leida ? "" : "bg-primary/5"}`}>
              <Bell aria-hidden="true" className={`mt-1 size-4 shrink-0 ${item.leida ? "text-(--foreground-muted)" : "text-primary"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium uppercase text-primary">{item.tipo} · {item.proceso}</span><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-medium ${item.leida ? "bg-surface-secondary text-(--foreground-muted)" : "bg-primary/10 text-primary"}`}>{item.leida ? "Leída" : "Sin leer"}</span><time className="text-xs text-(--foreground-muted)">{item.fecha ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(item.fecha)) : ""}</time></div></div>
                <h2 className="mt-1 font-medium">{item.titulo}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-(--foreground-muted)">{item.descripcion}</p>
                <div className="mt-2 flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-primary hover:bg-primary/5" href={item.href}>Abrir</Link>{!item.leida && <button type="button" onClick={() => void mark([item.id])} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-(--foreground-muted) hover:bg-surface-hover">Marcar como leída</button>}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-(--foreground-muted)">{unreadOnly ? "Ya leíste todas tus notificaciones." : "No tienes notificaciones todavía."}</div>}
    </section>
  );
}
