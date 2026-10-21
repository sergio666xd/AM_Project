"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderOpen,
  MessageSquare,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { ApiErrorState } from "@/components/ui/ApiErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { AttentionPanel } from "@/components/ui/AttentionPanel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Process = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  estado_visible: string;
  explicacion_estado: string;
  responsable?: { nombre_completo: string };
  tareas_pendientes: number;
  documentos_pendientes: number;
  ultima_actividad?: string | null;
  proxima_actividad?: string | null;
  proxima_actividad_titulo?: string | null;
  radicados: { id: number }[];
};

type Task = {
  id: number;
  titulo: string;
  descripcion?: string | null;
  estado: string;
  fecha_limite?: string | null;
  proceso_id?: number | null;
  cliente_id?: number | null;
  subtareas?: { id: number; completada: boolean }[];
};

type Docs = {
  solicitudes: { id: number; titulo: string; proceso: string; atendida_en?: string | null }[];
  documentos: unknown[];
};

type Agenda = {
  eventos: { id: number; titulo: string; fecha_inicio: string; proceso: string }[];
  tareas: unknown[];
};

type Notice = { id: string; leida: boolean };

type Activity = {
  id: string;
  titulo: string;
  descripcion?: string | null;
  fecha?: string | null;
  proceso: string;
  href: string;
};

const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(new Date(value))
    : "Sin fecha";

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
  const [hasLoaded, setHasLoaded] = useState(false);
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
      setProcesses(p);
      setTasks(t);
      setDocs(d);
      setAgenda(a);
      setUnread(n.filter((item) => !item.leida).length);
      setActivity(recent);
      setError("");
      setHasLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar el portal.");
    } finally {
      setLoading(false);
    }
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
    ])
      .then(([p, t, d, a, n, recent]) => {
        if (!active) return;
        setProcesses(p);
        setTasks(t);
        setDocs(d);
        setAgenda(a);
        setUnread(n.filter((item) => !item.leida).length);
        setActivity(recent);
        setError("");
        setHasLoaded(true);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar el portal.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionLoading, token]);

  const taskAssignedToClient = (task: Task) => Boolean(user && task.cliente_id === user.id);
  const pendingTasks = tasks.filter(
    (task) =>
      (taskAssignedToClient(task) && task.estado !== "COMPLETADA" && task.estado !== "CANCELADA") ||
      Boolean(task.subtareas?.some((subtask) => !subtask.completada)),
  );
  const pendingDocs = docs.solicitudes.filter((request) => !request.atendida_en);
  const nextEvents = agenda.eventos.filter((event) => isUpcoming(event.fecha_inicio)).slice(0, 3);
  const attention = [
    ...pendingDocs.slice(0, 3).map((item) => ({
      title: item.titulo,
      detail: `Documento solicitado · ${item.proceso}`,
      href: `/gestion-procesos/cliente/documentos#solicitud-${item.id}`,
    })),
    ...pendingTasks.slice(0, 3).map((item) => ({
      title: item.titulo,
      detail: taskAssignedToClient(item)
        ? item.descripcion || "Tarea principal asignada por el despacho"
        : "Tienes una subtarea asignada; la tarea principal sigue a cargo del despacho",
      href: `/gestion-procesos/cliente/tareas?tarea=${item.id}#tarea-${item.id}`,
    })),
  ].slice(0, 5);

  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente · Alejandra Muñoz"
        title={`Hola, ${user?.nombre_completo?.split(" ")[0] || "bienvenido"}`}
        description={`${new Intl.DateTimeFormat("es-CO", {
          dateStyle: "full",
          timeZone: "America/Bogota",
        }).format(new Date())} · Aquí puedes consultar tus procesos y pendientes.`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/gestion-procesos/cliente/notificaciones">
              <Button
                variant="outline"
                size="sm"
                icon={<Bell className="size-4" />}
              >
                Notificaciones
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-brand-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              loading={loading}
              icon={<RefreshCw className="size-4" />}
            >
              Actualizar
            </Button>
          </div>
        }
      />

      {error && hasLoaded && (
        <ApiErrorState
          error={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
          retrying={loading}
          compact
        />
      )}

      {loading || sessionLoading ? (
        <div role="status" aria-live="polite" className="grid min-h-56 place-items-center text-sm text-muted">
          <div className="flex items-center gap-2">
            <RefreshCw aria-hidden="true" className="size-4 animate-spin text-brand-700" />
            <span>Cargando tu información...</span>
          </div>
        </div>
      ) : error && !hasLoaded ? (
        <ApiErrorState
          error={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
          retrying={loading}
        />
      ) : (
        <>
          {/* STAT CARDS */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Mis procesos"
              value={processes.length}
              icon={FolderOpen}
              href="/gestion-procesos/cliente/procesos"
            />
            <StatCard
              label="Tareas pendientes"
              value={pendingTasks.length}
              icon={CheckSquare}
              tone={pendingTasks.length > 0 ? "warning" : "default"}
              href="/gestion-procesos/cliente/tareas"
            />
            <StatCard
              label="Documentos por entregar"
              value={pendingDocs.length}
              icon={FileText}
              tone={pendingDocs.length > 0 ? "danger" : "default"}
              href="/gestion-procesos/cliente/documentos"
            />
            <StatCard
              label="Próximos eventos"
              value={agenda.eventos.length}
              icon={CalendarDays}
              href="/gestion-procesos/cliente/calendario"
            />
          </div>

          {/* ATTENTION PANEL */}
          {attention.length > 0 && (
            <AttentionPanel
              title="Tienes pendientes que requieren tu atención"
              items={attention.map((item, index) => ({
                id: `${item.href}-${index}`,
                label: item.title,
                detail: item.detail,
                href: item.href,
                tone: "warning" as const,
              }))}
            />
          )}

          {/* MAIN GRID */}
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* PROCESOS */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Mis procesos</h2>
                  <p className="text-xs text-muted">Expedientes activos compartidos contigo</p>
                </div>
                <Link
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 dark:text-brand-300"
                  href="/gestion-procesos/cliente/procesos"
                >
                  Ver todos
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>

              {processes.length > 0 ? (
                <div className="space-y-3">
                  {processes.map((process) => (
                    <Link
                      key={process.id}
                      href={`/gestion-procesos/cliente/procesos/${process.id}`}
                      className="group block rounded-xl border border-border bg-surface p-4 shadow-xs transition hover:border-brand-500/50 hover:bg-surface-hover/70"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-brand-900 dark:group-hover:text-brand-200">
                            {process.nombre}
                          </h3>
                          <p className="mt-1 text-xs text-muted">
                            <span className="font-medium text-foreground">{process.estado_visible}</span> · {process.explicacion_estado}
                          </p>
                        </div>
                        <Badge tone="normal">
                          {process.radicados.length} radicado{process.radicados.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      <div className="mt-3.5 grid gap-2 text-xs text-muted sm:grid-cols-3 border-t border-border/60 pt-3">
                        <span>Abogado: {process.responsable?.nombre_completo || "Despacho"}</span>
                        <span>{process.tareas_pendientes} tarea(s) pendiente(s)</span>
                        <span>{process.documentos_pendientes} documento(s) por entregar</span>
                      </div>

                      {process.proxima_actividad && (
                        <div className="mt-2.5 rounded-lg bg-surface-secondary/70 px-3 py-2 text-xs text-foreground">
                          <span className="font-semibold text-brand-900 dark:text-brand-200">Próxima acción: </span>
                          <span>{process.proxima_actividad_titulo || "Actividad"}</span> ·{" "}
                          <span className="text-muted">{dateText(process.proxima_actividad)}</span>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-surface">
                  <EmptyState
                    title="Aún no tienes procesos compartidos"
                    description="Cuando el despacho te vincule a un expediente, podrás consultar aquí su estado, documentos y próximas actividades."
                    icon={FolderOpen}
                    action={
                      <Link href="/gestion-procesos/cliente/chat">
                        <Button
                          variant="outline"
                          icon={<MessageSquare className="size-4" />}
                        >
                          Escribir al despacho
                        </Button>
                      </Link>
                    }
                  />
                </div>
              )}
            </section>

            {/* ASIDE */}
            <aside className="space-y-5">
              {/* PRÓXIMOS EVENTOS */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h2 className="font-semibold text-foreground">Próximos eventos</h2>
                  <Link
                    className="text-xs font-semibold text-brand-700 hover:text-brand-900 dark:text-brand-300"
                    href="/gestion-procesos/cliente/calendario"
                  >
                    Abrir calendario
                  </Link>
                </div>

                {nextEvents.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {nextEvents.map((event) => (
                      <li key={event.id} className="py-3 first:pt-3 last:pb-0">
                        <p className="font-medium text-foreground text-sm">{event.titulo}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {event.proceso} · {dateText(event.fecha_inicio)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-muted">No tienes eventos próximos programados.</p>
                )}
              </section>

              {/* ACTIVIDAD RECIENTE */}
              <section className="rounded-xl border border-border bg-surface p-4 shadow-xs">
                <h2 className="font-semibold text-foreground border-b border-border pb-3">Actividad reciente</h2>
                {activity.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {activity.slice(0, 5).map((entry) => (
                      <li key={entry.id} className="py-3 first:pt-3 last:pb-0">
                        <Link
                          href={entry.href}
                          className="font-medium text-sm text-foreground hover:text-brand-700 dark:hover:text-brand-300"
                        >
                          {entry.titulo}
                        </Link>
                        <p className="text-[11px] text-muted mt-0.5">
                          {entry.proceso} · {dateText(entry.fecha)}
                        </p>
                        {entry.descripcion && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted">
                            {entry.descripcion}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-muted">Aún no hay actividad compartida en tus expedientes.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
