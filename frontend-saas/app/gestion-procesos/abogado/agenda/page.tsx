"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Bell, CalendarDays, Clock3, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type Reminder = { id: number; activo: boolean; fecha_hora?: string | null };
type Task = {
  id: number;
  titulo: string;
  estado: "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";
  prioridad: "BAJA" | "MEDIA" | "ALTA" | "URGENTE";
  fecha_limite?: string | null;
  proceso_id?: number | null;
  radicado_id?: number | null;
  cliente_id?: number | null;
  recordatorios: Reminder[];
};
type Process = { id: number; nombre: string };
type Client = { id: number; nombre_completo: string };
type Radicado = { id: number; numero: string };
type AgendaData = { tasks: Task[]; processes: Process[]; clients: Client[]; radicados: Radicado[] };
type AgendaFilter = "TODAS" | "VENCIDAS" | "HOY" | "PROXIMAS";

async function cargarAgenda(token: string): Promise<AgendaData> {
  const [tasks, processes, clients, radicados] = await Promise.all([
    fetchApi("/api/tareas", { method: "GET", token }),
    fetchApi("/api/expedientes/procesos", { method: "GET", token }),
    fetchApi("/api/expedientes/clientes", { method: "GET", token }),
    fetchApi("/api/radicados", { method: "GET", token }),
  ]);
  return { tasks, processes, clients, radicados };
}

function inicioDelDia(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatoFecha(value: string) {
  return new Date(value).toLocaleString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function etiquetaPrioridad(priority: Task["prioridad"]) {
  return { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta", URGENTE: "Urgente" }[priority];
}

export default function AgendaPage() {
  const { token, user, loading: sessionLoading } = useSession();
  const [data, setData] = useState<AgendaData>({ tasks: [], processes: [], clients: [], radicados: [] });
  const [filter, setFilter] = useState<AgendaFilter>("TODAS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    cargarAgenda(token)
      .then((result) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la agenda."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, token]);

  async function actualizar() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setData(await cargarAgenda(token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  const tareasConVencimiento = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return data.tasks
      .filter((task) => task.fecha_limite && task.estado !== "COMPLETADA" && task.estado !== "CANCELADA")
      .filter((task) => {
        const due = inicioDelDia(task.fecha_limite!);
        if (filter === "VENCIDAS") return due < today;
        if (filter === "HOY") return due.getTime() === today.getTime();
        if (filter === "PROXIMAS") return due >= today && due <= nextWeek;
        return true;
      })
      .sort((left, right) => new Date(left.fecha_limite!).getTime() - new Date(right.fecha_limite!).getTime());
  }, [data.tasks, filter]);

  const processes = new Map(data.processes.map((process) => [process.id, process.nombre]));
  const clients = new Map(data.clients.map((client) => [client.id, client.nombre_completo]));
  const radicados = new Map(data.radicados.map((radicado) => [radicado.id, radicado.numero]));
  const taskBase = user?.rol === "ABOGADO" ? "/gestion-procesos/dashboard/tareas" : "/gestion-procesos/abogado/tareas";
  const filters: { id: AgendaFilter; label: string }[] = [
    { id: "TODAS", label: "Todas" },
    { id: "VENCIDAS", label: "Vencidas" },
    { id: "HOY", label: "Hoy" },
    { id: "PROXIMAS", label: "Próximos 7 días" },
  ];

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-(--foreground-muted)">Trabajo jurídico</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Agenda</h1>
          <p className="mt-1 text-sm text-(--foreground-muted)">Vencimientos y recordatorios de tus tareas.</p>
        </div>
        <button type="button" onClick={() => void actualizar()} disabled={loading || sessionLoading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button>
      </header>

      <div role="group" aria-label="Filtrar agenda" className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1">
        {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`rounded-md px-3 py-1.5 text-sm ${filter === item.id ? "bg-primary text-white" : "text-(--foreground-muted) hover:bg-surface-secondary"}`}>{item.label}</button>)}
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700"><AlertCircle className="size-4 shrink-0" />{error}</div>}

      {loading || sessionLoading ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-(--foreground-muted)"><RefreshCw className="size-5 animate-spin" />Cargando agenda...</div> : tareasConVencimiento.length ? <div className="space-y-2">
        {tareasConVencimiento.map((task) => {
          const due = inicioDelDia(task.fecha_limite!);
          const today = inicioDelDia(new Date().toISOString());
          const overdue = due < today;
          const activeReminders = task.recordatorios.filter((reminder) => reminder.activo).length;
          return <Link key={task.id} href={`${taskBase}/${task.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-primary/40 hover:bg-surface-hover">
            <div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}><CalendarDays className="size-4" /></div><div className="min-w-0"><p className="font-medium text-foreground">{task.titulo}</p><p className="mt-1 text-xs text-(--foreground-muted)">{[task.proceso_id ? processes.get(task.proceso_id) : null, task.radicado_id ? radicados.get(task.radicado_id) : null, task.cliente_id ? clients.get(task.cliente_id) : null].filter(Boolean).join(" · ") || "Tarea general"}</p></div></div>
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-md px-2 py-1 ${overdue ? "bg-red-500/10 text-red-700" : "bg-surface-secondary text-(--foreground-secondary)"}`}>{formatoFecha(task.fecha_limite!)}</span><span className="rounded-md bg-surface-secondary px-2 py-1 text-(--foreground-secondary)">{etiquetaPrioridad(task.prioridad)}</span>{activeReminders > 0 && <span title={`${activeReminders} recordatorio(s) activo(s)`} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700"><Bell className="size-3.5" />{activeReminders}</span>}<span className="inline-flex items-center gap-1 text-primary"><Clock3 className="size-3.5" />{task.estado === "EN_CURSO" ? "En curso" : "Pendiente"}</span></div>
          </Link>;
        })}
      </div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 text-center"><CalendarDays className="size-8 text-(--foreground-muted)" /><h2 className="mt-3 font-semibold text-foreground">No hay vencimientos en esta vista</h2><p className="mt-1 text-sm text-(--foreground-muted)">Las tareas con fecha límite aparecerán aquí.</p></div>}
    </section>
  );
}
