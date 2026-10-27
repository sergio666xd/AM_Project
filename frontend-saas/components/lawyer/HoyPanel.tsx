"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderOpen,
  Gavel,
  Plus,
  RefreshCw,
} from "lucide-react";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";

export interface FirmDashboardData {
  resumen: { procesos_activos: number; tareas_pendientes: number; tareas_vencidas: number; documentos_pendientes: number; solicitudes_clientes: number; consultas_con_error: number; proximos_eventos: number; procesos_sin_actividad: number; procesos_sin_responsable: number };
  atencion: { tipo: string; titulo: string; descripcion: string; fecha?: string | null; href: string }[];
  actividad_reciente: { id: string; tipo: string; titulo: string; descripcion: string; actor?: string | null; proceso: string; fecha: string; href: string; visibilidad: string }[];
  acciones: { label: string; href: string }[];
}

type Tone = "danger" | "warning" | "info" | "gold" | "brand";

type InboxItem = {
  key: string;
  kind: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  context: string;
  date?: string | null;
  href: string;
  action: string;
  primary: boolean;
  rank: number;
};

const toneClasses: Record<Tone, string> = {
  danger: "bg-danger-light text-danger",
  warning: "bg-warning-light text-warning",
  info: "bg-info-light text-info",
  gold: "bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-400",
  brand: "bg-primary-light text-primary",
};

const TIME_ZONE = "America/Bogota";

function dayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(value);
}

/** «Hoy», «Mañana», «Hace 3 días», «En 4 días» o la fecha corta. */
function relativeDay(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((Date.parse(dayKey(date)) - Date.parse(dayKey(new Date()))) / 86_400_000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days < 0) return `Hace ${-days} días`;
  if (days < 7) return `En ${days} días`;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: TIME_ZONE }).format(date);
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(new Date()));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Une las alertas del panel y las actuaciones recientes en una sola bandeja ordenada por urgencia. */
function buildInbox(dashboard: FirmDashboardData): InboxItem[] {
  const items: InboxItem[] = dashboard.atencion.map((item, index) => {
    if (item.tipo === "RADICADO") {
      return { key: `r-${index}`, kind: "Actuaciones nuevas", icon: Gavel, tone: "danger", title: item.titulo, context: item.descripcion, date: item.fecha, href: item.href, action: "Ver actuaciones", primary: true, rank: 0 };
    }
    if (item.tipo === "TAREA") {
      const overdue = item.descripcion === "Vencida";
      return { key: `t-${index}`, kind: overdue ? "Tarea vencida" : "Vence pronto", icon: AlarmClock, tone: overdue ? "danger" : "warning", title: item.titulo, context: item.descripcion, date: item.fecha, href: item.href, action: "Abrir tarea", primary: overdue, rank: overdue ? 0 : 2 };
    }
    if (item.tipo === "EVENTO") {
      return { key: `e-${index}`, kind: "Agenda", icon: CalendarDays, tone: "brand", title: item.titulo, context: item.descripcion, date: item.fecha, href: item.href, action: "Ver en agenda", primary: false, rank: 3 };
    }
    return { key: `p-${index}`, kind: "Proceso", icon: FolderOpen, tone: "gold", title: item.titulo, context: item.descripcion, date: item.fecha, href: item.href, action: "Abrir proceso", primary: false, rank: 4 };
  });
  dashboard.actividad_reciente
    .filter((item) => item.tipo === "ACTUACION")
    .slice(0, 5)
    .forEach((item) => {
      items.push({ key: `a-${item.id}`, kind: "Novedad judicial", icon: Gavel, tone: "info", title: item.titulo, context: item.proceso, date: item.fecha, href: item.href, action: "Revisar y notificar", primary: false, rank: 1 });
    });
  return items.sort((a, b) => a.rank - b.rank);
}

export function HoyPanel({
  dashboard,
  firstName,
  calendarTasks,
  loading,
  onReload,
}: {
  dashboard: FirmDashboardData;
  firstName: string;
  calendarTasks: CalendarTask[];
  loading: boolean;
  onReload: () => void;
}) {
  const inbox = buildInbox(dashboard);
  const today = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }).format(new Date());
  const { resumen } = dashboard;
  const stats = [
    { label: "Procesos activos", value: resumen.procesos_activos, href: "/gestion-procesos/abogado/procesos", tone: "text-foreground" },
    { label: resumen.tareas_vencidas === 1 ? "Tarea vencida" : "Tareas vencidas", value: resumen.tareas_vencidas, href: "/gestion-procesos/abogado/tareas", tone: resumen.tareas_vencidas ? "text-danger" : "text-foreground" },
    { label: "Vencen esta semana", value: resumen.proximos_eventos, href: "/gestion-procesos/abogado/agenda", tone: resumen.proximos_eventos ? "text-warning" : "text-foreground" },
    { label: "Documentos por revisar", value: resumen.documentos_pendientes, href: "/gestion-procesos/abogado/documentos", tone: resumen.documentos_pendientes ? "text-info" : "text-foreground" },
  ];
  const activity = dashboard.actividad_reciente.filter((item) => item.tipo !== "ACTUACION").slice(0, 6);

  return (
    <div className="motion-swap mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-gold-600 first-letter:uppercase dark:text-gold-400">{today}</p>
          <h1 className="font-display text-[30px] font-medium leading-tight tracking-[-0.01em] text-foreground sm:text-[36px]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-[15px] text-foreground-secondary">
            {inbox.length
              ? `Tienes ${inbox.length} ${inbox.length === 1 ? "cosa" : "cosas"} que atender. Empieza por lo que tiene fecha.`
              : "No hay nada urgente. Buen momento para avanzar en tus procesos."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReload} disabled={loading} icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}>
          Actualizar
        </Button>
      </header>

      {/* Indicadores compactos: informan sin competir con la bandeja. */}
      <div className="no-scrollbar -mx-4 mb-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:px-0">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="motion-hover-lift min-w-[148px] shrink-0 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 hover:border-border-strong">
            <p className={`font-display text-[28px] font-medium leading-none tabular-nums ${stat.tone}`}>{typeof stat.value === "number" ? <AnimatedNumber value={stat.value} /> : stat.value}</p>
            <p className="mt-1.5 text-[13px] text-foreground-secondary">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="bandeja-titulo">
          <div className="mb-3">
            <h2 id="bandeja-titulo" className="text-[17px] font-semibold text-foreground">Requiere tu atención</h2>
            <p className="text-sm text-foreground-muted">Ordenado por urgencia</p>
          </div>
          {inbox.length === 0 ? (
            <div className="motion-rise-in flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-border-strong px-6 py-10 text-center">
              <span className="motion-pop mb-3 grid size-12 place-items-center rounded-full bg-success-light text-success [animation-delay:100ms]"><CheckCircle2 aria-hidden="true" className="size-6" /></span>
              <p className="font-semibold text-foreground">Todo al día</p>
              <p className="mt-1 max-w-[42ch] text-sm text-foreground-secondary">No hay tareas vencidas ni novedades judiciales sin revisar. Las nuevas actuaciones aparecerán aquí después de cada consulta.</p>
            </div>
          ) : (
            <ul className="motion-stagger flex flex-col gap-3">
              {inbox.slice(0, 12).map((item) => {
                const Icon = item.icon;
                const when = relativeDay(item.date);
                return (
                  <li key={item.key} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:p-5">
                    <div className="flex gap-3.5">
                      <span className={`relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] ${toneClasses[item.tone]}`}>
                        <Icon aria-hidden="true" className="size-[19px]" />
                        {/* Las actuaciones nuevas y las tareas vencidas llaman la atención con una onda suave. */}
                        {item.tone === "danger" && <span aria-hidden="true" className="motion-attention absolute -right-1 -top-1 size-2.5 rounded-full bg-danger ring-2 ring-surface" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground-muted">{item.kind}</p>
                          {when && <span className="inline-flex items-center gap-1 text-xs text-foreground-muted"><Clock3 aria-hidden="true" className="size-3" />{when}</span>}
                        </div>
                        <p className="mt-0.5 font-semibold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-sm text-foreground-secondary">{item.context}</p>
                        <Link
                          href={item.href}
                          className={`mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[13px] font-semibold transition-colors ${
                            item.primary ? "bg-brand-900 !text-white hover:bg-brand-800" : "border border-border bg-surface text-foreground hover:bg-surface-hover"
                          }`}
                        >
                          {item.action}
                          <ArrowRight aria-hidden="true" className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-7">
          <section>
            <h2 className="mb-3 text-[17px] font-semibold text-foreground">Acciones rápidas</h2>
            <div className="flex flex-wrap gap-2">
              {dashboard.acciones.map((action) => (
                <Link key={action.label} href={action.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
                  <Plus aria-hidden="true" className="size-4 text-foreground-muted" />
                  {action.label}
                </Link>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-foreground">Actividad reciente</h2>
              <Link href="/gestion-procesos/abogado/notificaciones" className="text-sm font-semibold text-primary hover:underline">Ver avisos</Link>
            </div>
            {activity.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
                {activity.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="block px-4 py-3 hover:bg-surface-hover">
                      <p className="truncate text-sm font-semibold text-foreground">{item.titulo}</p>
                      <p className="truncate text-xs text-foreground-muted">{item.proceso} · {relativeDay(item.fecha)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-6 text-center text-sm text-foreground-muted">Aún no hay actividad reciente.</p>
            )}
          </section>
          {resumen.consultas_con_error > 0 && (
            <Link href="/gestion-procesos/abogado/radicados" className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-warning-light p-4 text-sm">
              <FileCheck2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
              <span><strong className="block text-foreground">{resumen.consultas_con_error} {resumen.consultas_con_error === 1 ? "radicado no se pudo consultar" : "radicados no se pudieron consultar"}</strong><span className="text-foreground-secondary">Revisa el número o reintenta desde Radicados.</span></span>
            </Link>
          )}
        </aside>
      </div>

      <details className="mt-8 rounded-[var(--radius-lg)] border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold text-foreground">
          Calendario de tareas
          <span className="text-xs font-normal text-foreground-muted">{calendarTasks.length} con fecha límite</span>
        </summary>
        <div className="border-t border-border p-2 sm:p-4">
          <TaskMonthCalendar tasks={calendarTasks} />
        </div>
      </details>
    </div>
  );
}
