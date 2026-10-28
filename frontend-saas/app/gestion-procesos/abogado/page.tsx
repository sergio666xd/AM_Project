"use client";

import { apiRequest, TOKEN_EN_COOKIE } from "@/lib/api";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  ListChecks,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { HoyPanel } from "@/components/lawyer/HoyPanel";


interface SummaryData {
  processes: number;
  clients: number;
  tasks: number;
}

interface SaasDashboardData {
  plan: { id: number; nombre: string; limite_radicados: number } | null;
  resumen: {
    total_radicados: number;
    limite_radicados: number;
    consultas_pendientes: number;
    actuaciones_nuevas: number;
    consultas_error: number;
  };
  procesos_atencion: { radicado_id: number; numero: string; motivo: string; tipo: string; href: string }[];
  ultimas_consultas: {
    id: number;
    radicado: string;
    tipo: string;
    estado: string;
    actuaciones_nuevas: number;
    inicio: string | null;
  }[];
}

async function requestOverview(isSaasLawyer: boolean) {
  const headers = {
    Authorization: `Bearer ${TOKEN_EN_COOKIE}`,
  };
  const saasDashboardRequest = isSaasLawyer
    ? apiRequest(`/api/dashboard`, { headers })
    : Promise.resolve(null);
  const [processesResponse, clientsResponse, tasksResponse, saasDashboardResponse] =
    await Promise.all([
      apiRequest(`/api/expedientes/procesos`, { headers }),
      apiRequest(`/api/expedientes/clientes`, { headers }),
      apiRequest(`/api/tareas`, { headers }),
      saasDashboardRequest,
    ]);

  if (!processesResponse.ok || !clientsResponse.ok || !tasksResponse.ok) {
    throw new Error("No fue posible cargar el resumen del despacho.");
  }
  if (saasDashboardResponse && !saasDashboardResponse.ok) {
    throw new Error("No fue posible cargar el resumen del plan SaaS.");
  }

  const [processes, clients, tasks] = await Promise.all([
    processesResponse.json(),
    clientsResponse.json(),
    tasksResponse.json(),
  ]);
  const saasData = saasDashboardResponse
    ? (await saasDashboardResponse.json()) as SaasDashboardData
    : null;

  return {
    summary: {
      processes: Array.isArray(processes) ? processes.length : 0,
      clients: Array.isArray(clients) ? clients.length : 0,
      tasks: Array.isArray(tasks) ? tasks.length : 0,
    },
    saasData,
    calendarTasks: (Array.isArray(tasks) ? tasks : [])
      .filter((task) => task.fecha_limite)
      .map((task) => ({
        id: task.id,
        titulo: task.titulo,
        estado: task.estado,
        prioridad: task.prioridad,
        fecha_limite: task.fecha_limite,
        href: `${isSaasLawyer ? "/gestion-procesos/dashboard/tareas" : "/gestion-procesos/abogado/tareas"}/${task.id}`,
      })) as CalendarTask[],
  };
}

/** Panel de la cuenta SaaS individual; se retira en la Fase 7. */
function PanelSaas() {
  const { user } = useSession();
  const isSaasLawyer = user?.rol === "ABOGADO";
  const [data, setData] = useState<SummaryData>({
    processes: 0,
    clients: 0,
    tasks: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saasData, setSaasData] = useState<SaasDashboardData | null>(null);
  const [calendarTasks, setCalendarTasks] = useState<CalendarTask[]>([]);

  useEffect(() => {
    let active = true;
    requestOverview(isSaasLawyer)
      .then((overview) => {
        if (active) {
          setData(overview.summary);
          setSaasData(overview.saasData);
          setCalendarTasks(overview.calendarTasks);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Error al cargar el resumen.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isSaasLawyer]);


  async function load() {
    setLoading(true);
    setError("");
    try {
      const overview = await requestOverview(isSaasLawyer);
      setData(overview.summary);
      setSaasData(overview.saasData);
      setCalendarTasks(overview.calendarTasks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al cargar el resumen.");
    } finally {
      setLoading(false);
    }
  }

  const cards = isSaasLawyer ? [
    {
      title: "Radicados",
      value: saasData?.resumen.total_radicados ?? data.processes,
      description: "Consulta tus procesos y actuaciones judiciales",
      href: "/gestion-procesos/dashboard/radicados",
      icon: FolderOpen,
      iconClass: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    },
    {
      title: "Tareas",
      value: data.tasks,
      description: "Revisa tu trabajo pendiente",
      href: "/gestion-procesos/dashboard/tareas",
      icon: ListChecks,
      iconClass: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    },
  ] : [
    {
      title: "Procesos",
      value: data.processes,
      description: "Radicados, actuaciones y seguimiento judicial",
      href: "/gestion-procesos/abogado/procesos",
      icon: FolderOpen,
      iconClass:
        "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    },
    {
      title: "Clientes",
      value: data.clients,
      description: "Personas vinculadas a tus procesos",
      href: "/gestion-procesos/abogado/clientes",
      icon: Users,
      iconClass:
        "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
    },
    {
      title: "Tareas",
      value: data.tasks,
      description: "Trabajo pendiente del despacho",
      href: "/gestion-procesos/abogado/tareas",
      icon: ListChecks,
      iconClass:
        "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    },
  ] as const;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-foreground-muted">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Cargando panel...
        </div>
      </div>
    );
  }


  return (
    <div className="motion-swap space-y-6">
      <PageHeader
        overline={isSaasLawyer ? "Cuenta SaaS" : "Despacho"}
        title={isSaasLawyer ? "Espacio de trabajo" : user?.rol === "ADMIN" ? "Gestión de la firma" : "Panel del abogado"}
        description={
          isSaasLawyer
            ? "Consulta tus procesos, actividad judicial y uso del plan."
            : "Administra procesos, clientes y trabajo operativo."
        }
        action={
          <Button variant="outline" onClick={() => void load()} disabled={loading} icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}>
            Actualizar
          </Button>
        }
      />

      {/* Error */}
      {error && (
        <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!isSaasLawyer && data.processes === 0 && data.clients === 0 && data.tasks === 0 && (
        <section className="rounded-[var(--radius-lg)] border border-brand-900/20 bg-brand-900/5 p-5 sm:p-6" aria-labelledby="firm-welcome-title">
          <p className="text-sm font-medium text-brand-900">Configuración inicial</p>
          <h2 id="firm-welcome-title" className="mt-1 text-lg font-semibold text-foreground">Tu espacio de trabajo está listo</h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">Empieza creando un expediente. Desde su ficha podrás vincular al cliente, registrar radicados y organizar tareas, documentos y actividades.</p>
          <Link href="/gestion-procesos/abogado/procesos" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold !text-white hover:opacity-90">Ir a procesos <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </section>
      )}

      {/* Tarjetas principales */}
      <div className={`grid grid-cols-3 gap-2 sm:gap-4 ${isSaasLawyer ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {cards.map(({ title, value, href, icon }) => (
          <StatCard
            key={href}
            label={title}
            value={value}
            href={href}
            icon={icon}
          />
        ))}
      </div>


      <TaskMonthCalendar tasks={calendarTasks} />

      {isSaasLawyer && saasData && (
        <section aria-label="Resumen de cuenta SaaS" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Radicados", value: saasData.resumen.total_radicados, detail: `de ${saasData.resumen.limite_radicados}`, icon: FileText },
              { label: "Consultas pendientes", value: saasData.resumen.consultas_pendientes, detail: "En cola o ejecución", icon: Clock3 },
              { label: "Actuaciones nuevas", value: saasData.resumen.actuaciones_nuevas, detail: "Detectadas en consultas", icon: TrendingUp },
              { label: "Consultas con error", value: saasData.resumen.consultas_error, detail: "Requieren revisión", icon: AlertCircle },
            ].map(({ label, value, detail, icon: Icon }) => (
              <div key={label} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-foreground-muted">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
                    <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
                  </div>
                  <Icon className="size-5 shrink-0 text-brand-900" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
              <h2 className="font-semibold text-foreground">Mi plan</h2>
              {saasData.plan ? (
                <>
                  <p className="mt-3 text-lg font-semibold text-foreground">{saasData.plan.nombre}</p>
                  <div className="mt-4 flex justify-between gap-3 text-sm">
                    <span className="text-foreground-muted">Uso de radicados</span>
                    <span className="font-medium text-foreground">{saasData.resumen.total_radicados} / {saasData.plan.limite_radicados}</span>
                  </div>
                  <div role="progressbar" aria-label="Uso del plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={saasData.plan.limite_radicados > 0 ? Math.min(100, Math.round(saasData.resumen.total_radicados / saasData.plan.limite_radicados * 100)) : 0} className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                    <div className="h-full rounded-full bg-brand-900" style={{ width: `${saasData.plan.limite_radicados > 0 ? Math.min(100, saasData.resumen.total_radicados / saasData.plan.limite_radicados * 100) : 0}%` }} />
                  </div>
                  <p className="mt-3 text-sm text-foreground-muted">{Math.max(saasData.plan.limite_radicados - saasData.resumen.total_radicados, 0)} cupos disponibles</p>
                </>
              ) : <p className="mt-3 text-sm text-foreground-muted">No tienes un plan asignado.</p>}
            </section>

            <section className="rounded-[var(--radius-lg)] border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-foreground">Procesos que requieren atención</h2>
              </div>
              {saasData.procesos_atencion.length ? saasData.procesos_atencion.slice(0, 5).map((item) => (
                <Link key={`${item.radicado_id}-${item.tipo}`} href={item.href} className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-0 hover:bg-surface-hover">
                  <div className="min-w-0"><p className="truncate font-medium text-foreground">{item.numero}</p><p className="mt-1 truncate text-sm text-foreground-muted">{item.motivo}</p></div>
                  {item.tipo === "ACTUACIONES_NUEVAS"
                    ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700"><span aria-hidden="true" className="motion-attention size-1.5 rounded-full bg-red-600" />Actuaciones nuevas</span>
                    : <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">Atención</span>}
                </Link>
              )) : <div className="flex items-center gap-2 px-5 py-6 text-sm text-foreground-muted"><CheckCircle2 className="size-4 text-emerald-600" />No hay procesos que requieran atención.</div>}
            </section>
          </div>

          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            <div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Últimas consultas</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-foreground-muted"><tr><th className="px-5 py-3 font-medium">Radicado</th><th className="px-5 py-3 font-medium">Tipo</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium">Novedades</th><th className="px-5 py-3 font-medium">Inicio</th></tr></thead>
                <tbody>{saasData.ultimas_consultas.length ? saasData.ultimas_consultas.slice(0, 5).map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0"><td className="px-5 py-3 font-medium text-foreground">{item.radicado}</td><td className="px-5 py-3 text-foreground-muted">{item.tipo}</td><td className="px-5 py-3 text-foreground-muted">{item.estado}</td><td className="px-5 py-3 text-foreground-muted">{item.actuaciones_nuevas}</td><td className="px-5 py-3 text-foreground-muted">{item.inicio ? new Date(item.inicio).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—"}</td></tr>
                )) : <tr><td colSpan={5} className="px-5 py-7 text-center text-foreground-muted">Todavía no hay consultas registradas.</td></tr>}</tbody>
              </table>
            </div>
          </section>
        </section>
      )}

      {/* Flujo del despacho */}
      {!isSaasLawyer && data.processes === 0 && <>
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">
            Flujo del despacho
          </h2>

          <p className="mt-1 text-sm text-foreground-muted">
            Gestiona la información de tus clientes y sus procesos
            desde un mismo flujo de trabajo.
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {/* Paso 1 */}
          <Link
            href="/gestion-procesos/abogado/clientes"
            className="group p-5 transition hover:bg-surface-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400">
                <Users className="h-4 w-4" />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  Paso 1
                </p>

                <h3 className="font-medium text-foreground">
                  Crear cliente
                </h3>
              </div>
            </div>

            <p className="mt-3 text-sm text-foreground-muted">
              Registra y administra las personas vinculadas al
              despacho.
            </p>
          </Link>

          {/* Paso 2 */}
          <Link
            href="/gestion-procesos/abogado/procesos"
            className="group p-5 transition hover:bg-surface-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <FolderOpen className="h-4 w-4" />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  Paso 2
                </p>

                <h3 className="font-medium text-foreground">
                  Gestionar proceso
                </h3>
              </div>
            </div>

            <p className="mt-3 text-sm text-foreground-muted">
              Asocia clientes, consulta actuaciones y realiza el
              seguimiento judicial.
            </p>
          </Link>

          {/* Paso 3 */}
          <Link
            href="/gestion-procesos/abogado/tareas"
            className="group p-5 transition hover:bg-surface-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                <ListChecks className="h-4 w-4" />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  Paso 3
                </p>

                <h3 className="font-medium text-foreground">
                  Ejecutar tareas
                </h3>
              </div>
            </div>

            <p className="mt-3 text-sm text-foreground-muted">
              Organiza pendientes del despacho y actividades
              relacionadas con los procesos.
            </p>
          </Link>
        </div>
      </div>
      </>}

      {/* Nota operativa */}
      {!isSaasLawyer && data.processes === 0 && <>
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-sm">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-900/10 text-brand-900">
            <FolderOpen className="h-4 w-4" />
          </div>

          <div>
            <h2 className="font-semibold text-foreground">
              Gestión centralizada
            </h2>

            <p className="mt-1 text-sm leading-6 text-foreground-muted">
              Desde cada proceso puedes consultar sus actuaciones,
              gestionar tareas, solicitar documentos a los clientes y
              decidir cuándo enviar notificaciones sobre nuevas
              actuaciones.
            </p>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

export default function AbogadoPage() {
  const { user, loading } = useSession();
  if (loading || !user) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-foreground-muted">
        <RefreshCw aria-hidden="true" className="mr-3 size-5 animate-spin" />
        Cargando panel…
      </div>
    );
  }
  if (user.rol === "ABOGADO") return <PanelSaas />;
  return <HoyPanel firstName={user.nombre_completo?.split(" ")[0] || ""} />;
}
