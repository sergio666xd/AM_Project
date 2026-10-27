"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Upload,
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

const monthText = (value: string) =>
  new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "America/Bogota" }).format(new Date(value)).replace(".", "");
const dayText = (value: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", timeZone: "America/Bogota" }).format(new Date(value));

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
      kind: "documento" as const,
      title: item.titulo,
      detail: `Documento solicitado · ${item.proceso}`,
      href: `/gestion-procesos/cliente/documentos#solicitud-${item.id}`,
    })),
    ...pendingTasks.slice(0, 3).map((item) => ({
      kind: "tarea" as const,
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
        overline="Portal del cliente"
        title={`Hola, ${user?.nombre_completo?.split(" ")[0] || "bienvenido"}`}
        description="Aquí ves en qué va tu proceso y lo que necesitamos de ti."
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
          {/* Lo que la firma necesita del cliente va primero. */}
          {attention.length > 0 ? (
            <section aria-labelledby="pendientes-titulo" className="rounded-[var(--radius-xl)] border border-gold-200 bg-gold-50 p-4 sm:p-6 dark:border-gold-600/30 dark:bg-gold-600/10">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck aria-hidden="true" className="size-5 text-gold-600 dark:text-gold-400" />
                <h2 id="pendientes-titulo" className="font-semibold text-foreground">
                  {attention.length === 1 ? "Necesitamos 1 cosa de ti" : `Necesitamos ${attention.length} cosas de ti`}
                </h2>
              </div>
              <ul className="flex flex-col gap-2">
                {attention.map((item, index) => (
                  <li key={`${item.href}-${index}`} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-surface p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-sm text-foreground-muted">{item.detail}</p>
                    </div>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand-900 px-4 text-sm font-semibold !text-white hover:bg-brand-800 sm:w-auto"
                    >
                      {item.kind === "documento" ? <Upload aria-hidden="true" className="size-4" /> : <CheckSquare aria-hidden="true" className="size-4" />}
                      {item.kind === "documento" ? "Subir documento" : "Ver tarea"}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : processes.length > 0 ? (
            <p className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-success-light px-4 py-3 text-sm text-foreground">
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
              No tienes documentos ni tareas pendientes. Te avisaremos si necesitamos algo.
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-4" aria-labelledby="procesos-titulo">
              <div className="flex items-center justify-between">
                <h2 id="procesos-titulo" className="text-[17px] font-semibold text-foreground">{processes.length === 1 ? "Tu proceso" : "Tus procesos"}</h2>
                {processes.length > 1 && (
                  <Link className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline" href="/gestion-procesos/cliente/procesos">
                    Ver todos <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                )}
              </div>

              {processes.length > 0 ? (
                processes.slice(0, 3).map((process) => (
                  <article key={process.id} className="rounded-[var(--radius-xl)] border border-border bg-surface p-4 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-display text-[22px] font-medium leading-snug text-foreground sm:text-2xl">{process.nombre}</h3>
                      <Badge tone="normal">{process.estado_visible}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground-muted">Abogada: {process.responsable?.nombre_completo || "Despacho"}</p>
                    <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-foreground">{process.explicacion_estado}</p>
                    {process.proxima_actividad && (
                      <div className="mt-5 flex items-center gap-4 rounded-[var(--radius-lg)] bg-primary-light p-4">
                        <span className="flex w-14 shrink-0 flex-col items-center rounded-[var(--radius-md)] bg-surface py-1.5">
                          <span className="text-[10px] font-semibold uppercase text-primary">{monthText(process.proxima_actividad)}</span>
                          <span className="font-display text-2xl leading-none text-foreground">{dayText(process.proxima_actividad)}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{process.proxima_actividad_titulo || "Próxima actividad"}</p>
                          <p className="text-sm text-foreground-secondary">{dateText(process.proxima_actividad)}</p>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-muted">
                      <span>{process.tareas_pendientes} {process.tareas_pendientes === 1 ? "tarea pendiente" : "tareas pendientes"}</span>
                      <span>{process.documentos_pendientes} {process.documentos_pendientes === 1 ? "documento por entregar" : "documentos por entregar"}</span>
                    </div>
                    <Link
                      href={`/gestion-procesos/cliente/procesos/${process.id}`}
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border px-4 text-sm font-semibold text-foreground hover:bg-surface-hover"
                    >
                      Ver detalle del proceso <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </article>
                ))
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-dashed border-border bg-surface">
                  <EmptyState
                    title="Aún no tienes procesos compartidos"
                    description="Cuando el despacho te vincule a un expediente, podrás consultar aquí su estado, documentos y próximas actividades."
                    icon={FolderOpen}
                    action={
                      <Link href="/gestion-procesos/cliente/chat">
                        <Button variant="outline" icon={<MessageSquare className="size-4" />}>Escribir al despacho</Button>
                      </Link>
                    }
                  />
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-4 sm:p-5">
                <h2 className="text-[17px] font-semibold text-foreground">¿Tienes dudas?</h2>
                <p className="mt-1 text-sm text-foreground-secondary">Escríbele a tu abogada. Responde en horario hábil.</p>
                <Link
                  href="/gestion-procesos/cliente/chat"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand-900 px-4 text-sm font-semibold !text-white hover:bg-brand-800"
                >
                  <MessageSquare aria-hidden="true" className="size-4" /> Escribir mensaje
                </Link>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold text-foreground">Próximas fechas</h2>
                  <Link className="text-sm font-semibold text-primary hover:underline" href="/gestion-procesos/cliente/calendario">Calendario</Link>
                </div>
                {nextEvents.length > 0 ? (
                  <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
                    {nextEvents.map((event) => (
                      <li key={event.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex w-11 shrink-0 flex-col items-center rounded-[var(--radius-sm)] bg-surface-hover py-1">
                          <span className="text-[10px] font-semibold uppercase text-foreground-muted">{monthText(event.fecha_inicio)}</span>
                          <span className="font-display text-lg leading-none text-foreground">{dayText(event.fecha_inicio)}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{event.titulo}</p>
                          <p className="truncate text-xs text-foreground-muted">{event.proceso}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-5 text-sm text-foreground-muted">No tienes fechas próximas.</p>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-[17px] font-semibold text-foreground">Últimas novedades</h2>
                {activity.length > 0 ? (
                  <ul className="space-y-3">
                    {activity.slice(0, 5).map((entry) => (
                      <li key={entry.id} className="flex gap-3">
                        <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0">
                          <Link href={entry.href} className="text-sm font-medium text-foreground hover:text-primary">{entry.titulo}</Link>
                          <p className="text-xs text-foreground-muted">{entry.proceso} · {dateText(entry.fecha)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-foreground-muted">Aún no hay novedades en tus procesos.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
