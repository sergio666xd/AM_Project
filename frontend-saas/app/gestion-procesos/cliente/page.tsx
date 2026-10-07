"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarDays, CheckSquare, FileText, FolderOpen, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Process = { id: number; nombre: string; descripcion?: string | null; estado_visible: string; explicacion_estado: string; responsable?: { nombre_completo: string }; tareas_pendientes: number; documentos_pendientes: number; ultima_actividad?: string | null; proxima_actividad?: string | null; proxima_actividad_titulo?: string | null; radicados: { id: number }[] };
type Task = { id: number; titulo: string; descripcion?: string | null; estado: string; fecha_limite?: string | null; proceso_id?: number | null };
type Docs = { solicitudes: { id: number; titulo: string; proceso: string; atendida_en?: string | null }[]; documentos: unknown[] };
type Agenda = { eventos: { id: number; titulo: string; fecha_inicio: string; proceso: string }[]; tareas: unknown[] };
type Notice = { id: string; leida: boolean };
type Activity = { id: string; titulo: string; descripcion?: string | null; fecha?: string | null; proceso: string; href: string };
const dateText = (value?: string | null) => value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin fecha";
const isUpcoming = (value: string) => Date.parse(value) >= Date.now();

export default function ClienteHomePage() {
  const { user, token, loading: sessionLoading } = useSession();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<Docs>({ solicitudes: [], documentos: [] });
  const [agenda, setAgenda] = useState<Agenda>({ eventos: [], tareas: [] });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [p, t, d, a, n, recent] = await Promise.all([
        fetchApi("/api/expedientes/procesos", { token }) as Promise<Process[]>,
        fetchApi("/api/tareas", { token }) as Promise<Task[]>,
        fetchApi("/api/expedientes/documentos", { token }) as Promise<Docs>,
        fetchApi("/api/expedientes/cliente/agenda", { token }) as Promise<Agenda>,
        fetchApi("/api/expedientes/cliente/notificaciones", { token }) as Promise<Notice[]>,
        fetchApi("/api/expedientes/cliente/actividad", { token }) as Promise<Activity[]>,
      ]);
      setProcesses(p); setTasks(t); setDocs(d); setAgenda(a); setUnread(n.filter((item) => !item.leida).length); setActivity(recent); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible cargar el portal."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    Promise.all([
      fetchApi("/api/expedientes/procesos", { token }) as Promise<Process[]>,
      fetchApi("/api/tareas", { token }) as Promise<Task[]>,
      fetchApi("/api/expedientes/documentos", { token }) as Promise<Docs>,
      fetchApi("/api/expedientes/cliente/agenda", { token }) as Promise<Agenda>,
      fetchApi("/api/expedientes/cliente/notificaciones", { token }) as Promise<Notice[]>,
      fetchApi("/api/expedientes/cliente/actividad", { token }) as Promise<Activity[]>,
    ]).then(([p, t, d, a, n, recent]) => {
      if (!active) return;
      setProcesses(p); setTasks(t); setDocs(d); setAgenda(a); setUnread(n.filter((item) => !item.leida).length); setActivity(recent); setError("");
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar el portal."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, token]);

  const pendingTasks = tasks.filter((task) => task.estado !== "COMPLETADA" && task.estado !== "CANCELADA");
  const pendingDocs = docs.solicitudes.filter((request) => !request.atendida_en);
  const nextEvents = agenda.eventos.filter((event) => isUpcoming(event.fecha_inicio)).slice(0, 3);
  const attention = [
    ...pendingDocs.slice(0, 3).map((item) => ({ title: item.titulo, detail: `Documento solicitado · ${item.proceso}`, href: `/gestion-procesos/cliente/documentos#solicitud-${item.id}` })),
    ...pendingTasks.slice(0, 3).map((item) => ({ title: item.titulo, detail: item.descripcion || "Tarea asignada por el despacho", href: `/gestion-procesos/cliente/tareas?tarea=${item.id}#tarea-${item.id}` })),
  ].slice(0, 5);

  return <section className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-(--foreground-muted)">Portal privado · Alejandra Muñoz | Abogada y Asociados</p><h1 className="mt-1 text-2xl font-semibold text-foreground">Hola, {user?.nombre_completo?.split(" ")[0] || "bienvenido"}</h1><p className="mt-1 text-sm text-(--foreground-muted)">{new Intl.DateTimeFormat("es-CO", { dateStyle: "full" }).format(new Date())} · Aquí puedes consultar tus procesos y pendientes.</p></div><div className="flex gap-2"><Link href="/gestion-procesos/cliente/notificaciones" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Bell className="size-4"/>Notificaciones{unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{unread}</span>}</Link><button onClick={() => { setLoading(true); void load(); }} disabled={loading} className="rounded-lg border border-border p-2 disabled:opacity-50" aria-label="Actualizar"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`}/></button></div></header>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
    {loading || sessionLoading ? <div className="grid min-h-56 place-items-center text-sm text-(--foreground-muted)"><RefreshCw className="mr-2 inline size-4 animate-spin"/>Cargando tu información...</div> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link href="/gestion-procesos/cliente/procesos" className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"><FolderOpen className="size-5 text-primary"/><p className="mt-3 text-sm text-(--foreground-muted)">Mis procesos</p><p className="text-2xl font-semibold">{processes.length}</p></Link><Link href="/gestion-procesos/cliente/tareas" className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"><CheckSquare className="size-5 text-primary"/><p className="mt-3 text-sm text-(--foreground-muted)">Tareas pendientes</p><p className="text-2xl font-semibold">{pendingTasks.length}</p></Link><Link href="/gestion-procesos/cliente/documentos" className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"><FileText className="size-5 text-primary"/><p className="mt-3 text-sm text-(--foreground-muted)">Documentos por entregar</p><p className="text-2xl font-semibold">{pendingDocs.length}</p></Link><Link href="/gestion-procesos/cliente/calendario" className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"><CalendarDays className="size-5 text-primary"/><p className="mt-3 text-sm text-(--foreground-muted)">Próximos eventos</p><p className="text-2xl font-semibold">{agenda.eventos.length}</p></Link></div>
      {attention.length > 0 && <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><h2 className="font-semibold">Tienes pendiente</h2><ul className="mt-3 divide-y divide-border">{attention.map((item, index) => <li key={`${item.href}-${index}`}><Link href={item.href} className="flex flex-wrap justify-between gap-2 py-3"><span><span className="block font-medium">{item.title}</span><span className="text-sm text-(--foreground-muted)">{item.detail}</span></span><span className="text-sm font-medium text-primary">Ver pendiente →</span></Link></li>)}</ul></section>}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Mis procesos</h2><Link className="text-sm text-primary" href="/gestion-procesos/cliente/procesos">Ver todos</Link></div>{processes.length ? processes.map((process) => <Link key={process.id} href={`/gestion-procesos/cliente/procesos/${process.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{process.nombre}</h3><p className="mt-1 text-sm text-(--foreground-muted)">{process.estado_visible} · {process.explicacion_estado}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{process.radicados.length} radicado{process.radicados.length === 1 ? "" : "s"}</span></div><div className="mt-4 grid gap-2 text-xs text-(--foreground-muted) sm:grid-cols-3"><span>Responsable: {process.responsable?.nombre_completo || "Despacho"}</span><span>{process.tareas_pendientes} tarea(s) pendiente(s)</span><span>{process.documentos_pendientes} documento(s) solicitado(s)</span></div>{process.proxima_actividad && <p className="mt-3 border-t border-border pt-3 text-sm"><b>Próxima acción:</b> {process.proxima_actividad_titulo || "Actividad"} · {dateText(process.proxima_actividad)}</p>}</Link>) : <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-(--foreground-muted)">Cuando el despacho comparta un proceso contigo, aparecerá aquí.</div>}</section>
        <aside className="space-y-4"><section className="rounded-xl border border-border bg-surface p-4"><h2 className="font-semibold">Próximos eventos</h2>{nextEvents.length ? <ul className="mt-3 space-y-3">{nextEvents.map((event) => <li key={event.id} className="border-t border-border pt-3"><p className="font-medium">{event.titulo}</p><p className="text-sm text-(--foreground-muted)">{event.proceso} · {dateText(event.fecha_inicio)}</p></li>)}</ul> : <p className="mt-2 text-sm text-(--foreground-muted)">No tienes eventos próximos.</p>}<Link className="mt-3 inline-block text-sm text-primary" href="/gestion-procesos/cliente/calendario">Abrir calendario</Link></section><section className="rounded-xl border border-border bg-surface p-4"><h2 className="font-semibold">Actividad reciente</h2>{activity.length ? <ul className="mt-3 space-y-3">{activity.slice(0,5).map((entry)=><li key={entry.id} className="border-t border-border pt-3"><Link href={entry.href} className="font-medium hover:text-primary">{entry.titulo}</Link><p className="text-xs text-(--foreground-muted)">{entry.proceso} · {dateText(entry.fecha)}</p><p className="mt-1 line-clamp-2 text-sm text-(--foreground-muted)">{entry.descripcion}</p></li>)}</ul> : <p className="mt-2 text-sm text-(--foreground-muted)">Aún no hay actividad compartida.</p>}</section></aside></div>
    </>}
  </section>;
}
