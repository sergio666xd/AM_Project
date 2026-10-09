"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  RefreshCw,
  UserCheck,
  Users,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { LoadingState } from "@/components/ui/LoadingState";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/ToastProvider";

type MetricKey =
  | "usuarios_activos"
  | "usuarios_pendientes_aprobacion"
  | "solicitudes_pendientes"
  | "procesos_activos"
  | "tareas_pendientes"
  | "documentos_pendientes"
  | "alertas"
  | "errores_operativos"
  | "notificaciones_criticas";

type DashboardMetricCounts = Record<MetricKey, number>;

interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "warning" | "danger";
}

interface ActivityItem {
  id: string;
  actor: string;
  descripcion: string;
  recurso: string;
  fecha: string | null;
  href: string;
  tipo: "normal" | "error";
}

interface CriticalProcess {
  id: number;
  nombre: string;
  cliente: string | null;
  clientes: number;
  responsable: string;
  estado: string;
  ultima_actividad: string | null;
  riesgo: string | null;
  proxima_accion: string | null;
  vencido: boolean;
  en_atencion: boolean;
  sin_actividad: boolean;
}

interface DashboardData {
  resumen: DashboardMetricCounts;
  firma: { procesos: number; radicados: number; tareas: number; documentos: number };
  saas: { abogados: number; procesos: number; radicados: number; tareas: number };
  atencion: AttentionItem[];
  actividad: ActivityItem[];
  procesos_criticos: CriticalProcess[];
}

type ProcessFilter = "todos" | "atencion" | "riesgo" | "sin_actividad" | "vencidos";

const filterOptions: { value: ProcessFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "atencion", label: "Atención" },
  { value: "riesgo", label: "Riesgo" },
  { value: "sin_actividad", label: "Sin actividad registrada" },
  { value: "vencidos", label: "Vencidos" },
];

async function loadDashboard(token: string) {
  return (await fetchApi("/api/admin/dashboard", { method: "GET", token })) as DashboardData;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    ...(includeTime
      ? { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }
      : { dateStyle: "medium" }),
  });
}

function MetricCard({ label, value, hint, href, icon: Icon }: {
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof Activity;
}) {
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full transition-colors hover:border-primary/40 hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value.toLocaleString("es-CO")}</p>
          <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
    </Card></Link>
  );
}

function greetingAt(date: Date) {
  const hour = Number(new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "America/Bogota",
  }).format(date));
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function AdminDashboard() {
  const { token, loading: sessionLoading } = useSession();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("todos");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const now = new Date();

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    loadDashboard(token)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionLoading, token]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError(false);
    try {
      setData(await loadDashboard(token));
      toast({ title: "Dashboard actualizado", tone: "success" });
    } catch {
      setError(true);
      toast({ title: "No fue posible actualizar el dashboard", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  const filteredProcesses = useMemo(() => {
    const processes = data?.procesos_criticos ?? [];
    switch (processFilter) {
      case "atencion": return processes.filter((process) => process.en_atencion);
      case "riesgo": return processes.filter((process) => Boolean(process.riesgo));
      case "sin_actividad": return processes.filter((process) => process.sin_actividad);
      case "vencidos": return processes.filter((process) => process.vencido);
      default: return processes;
    }
  }, [data?.procesos_criticos, processFilter]);

  const columns: DataTableColumn<CriticalProcess>[] = [
    {
      key: "proceso",
      header: "Proceso",
      render: (process) => (
        <Link href={`/gestion-procesos/admin/procesos?detalle=${process.id}`} className="font-semibold text-primary hover:underline">
          {process.nombre}
          <span className="mt-1 block max-w-52 truncate text-xs font-normal text-foreground-muted">
            {process.cliente ?? (process.clientes ? `${process.clientes} clientes` : "Sin cliente asignado")}
          </span>
        </Link>
      ),
    },
    { key: "responsable", header: "Responsable", render: (process) => process.responsable },
    { key: "estado", header: "Estado", render: () => <Badge tone="normal">Activo</Badge> },
    { key: "actividad", header: "Última actividad", render: (process) => formatDate(process.ultima_actividad) },
    {
      key: "riesgo",
      header: "Riesgo",
      render: (process) => process.riesgo
        ? <Badge tone={process.vencido ? "overdue" : "risk"}>{process.riesgo}</Badge>
        : <span className="text-foreground-muted">Sin alerta</span>,
    },
    {
      key: "accion",
      header: "Próxima acción",
      render: (process) => process.proxima_accion
        ? <Link href="/gestion-procesos/admin/tareas" className="font-medium text-primary hover:underline">{process.proxima_accion}</Link>
        : <span className="text-foreground-muted">Sin tareas pendientes</span>,
    },
  ];

  if (sessionLoading || (loading && !data)) {
    return <div className="mx-auto max-w-7xl space-y-5"><LoadingState label="Cargando el centro de control" rows={5} /></div>;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Alert kind="error" title="No se pudo cargar el centro de control">
          Revisa tu conexión e inténtalo de nuevo.
        </Alert>
        <Button onClick={() => void refresh()} disabled={loading}>
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Reintentar
        </Button>
      </div>
    );
  }

  const metrics = [
    { label: "Usuarios activos", value: data.resumen.usuarios_activos, hint: "En todas las áreas", href: "/gestion-procesos/admin/usuarios", icon: Users },
    { label: "Solicitudes pendientes", value: data.resumen.solicitudes_pendientes, hint: "Registro y perfil", href: "/gestion-procesos/admin/solicitudes", icon: UserCheck },
    { label: "Procesos activos", value: data.resumen.procesos_activos, hint: "Firma y SaaS", href: "/gestion-procesos/admin/procesos", icon: BriefcaseBusiness },
    { label: "Tareas pendientes", value: data.resumen.tareas_pendientes, hint: "Por completar o en curso", href: "/gestion-procesos/admin/tareas", icon: CalendarClock },
    { label: "Documentos por revisar", value: data.resumen.documentos_pendientes, hint: "Solicitudes sin atender", href: "/gestion-procesos/admin/documentos/solicitudes", icon: FileText },
    { label: "Alertas activas", value: data.resumen.alertas, hint: "Elementos que requieren atención", href: "/gestion-procesos/admin/alertas", icon: AlertTriangle },
    { label: "Errores operativos", value: data.resumen.errores_operativos, hint: "Consultas y notificaciones críticas", href: "/gestion-procesos/admin/operacion", icon: Activity },
  ];
  const quickActions = [
    { label: "Crear usuario", href: "/gestion-procesos/admin/usuarios/nuevo" },
    { label: "Revisar solicitudes", href: "/gestion-procesos/admin/solicitudes" },
    { label: "Ver procesos", href: "/gestion-procesos/admin/procesos" },
    { label: "Documentos pendientes", href: "/gestion-procesos/admin/documentos" },
    { label: "Ver operación", href: "/gestion-procesos/admin/operacion" },
    { label: "Abrir auditoría", href: "/gestion-procesos/admin/auditoria" },
    { label: "Editar sitio público", href: "/gestion-procesos/admin/contenido" },
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      {error && <Alert kind="error">Algunos datos no pudieron actualizarse. Puedes reintentar.</Alert>}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{greetingAt(now)}</p>
          <h1 className="mt-1 text-3xl font-semibold text-foreground">Centro de control</h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            Alejandra Muñoz | Abogada y Asociados · {now.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </header>

      <section aria-label="Resumen de la plataforma" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <Card title="Acciones rápidas" description="Accede directamente a las tareas administrativas frecuentes.">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href} prefetch={action.href !== "/gestion-procesos/admin/contenido"} onClick={(event) => { if (action.href === "/gestion-procesos/admin/contenido") { event.preventDefault(); window.location.assign(action.href); } }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
              {action.label}<ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ))}
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card title="Requiere atención" description="Pendientes y errores confirmados por los registros del sistema.">
          {data.atencion.some((item) => item.count > 0) ? (
            <ul className="space-y-2">
              {data.atencion.filter((item) => item.count > 0).map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 transition-colors hover:bg-surface-hover">
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    <Badge tone={item.tone === "danger" ? "risk" : "attention"}>{item.count.toLocaleString("es-CO")}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Todo está al día" description="No hay solicitudes, tareas vencidas ni errores que requieran atención." />
          )}
        </Card>

        <Card
          title="Actividad reciente"
          description="Cambios y resultados recientes en lenguaje claro."
          action={<Link href="/gestion-procesos/admin/auditoria" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Ver auditoría<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        >
          {data.actividad.length > 0 ? (
            <ol className="space-y-4">
              {data.actividad.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${event.tipo === "error" ? "bg-danger-light text-danger" : "bg-primary-light text-primary"}`}>
                    <Activity aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground"><span className="font-semibold">{event.actor}</span> {event.descripcion}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
                      <Link href={event.href} className="font-medium text-primary hover:underline">{event.recurso}</Link>
                      <span aria-hidden="true">·</span>
                      <time dateTime={event.fecha ?? undefined}>{formatDate(event.fecha, true)}</time>
                      {event.tipo === "error" && <Badge tone="risk">Error</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Aún no hay actividad" description="Los cambios recientes aparecerán aquí." />
          )}
        </Card>
      </section>

      <Card title="Procesos que requieren seguimiento" description="Procesos activos de la firma, ordenados por riesgo y tareas pendientes.">
        <div className="space-y-4">
          <FilterBar>
            <label className="grid gap-1.5 text-sm font-medium text-foreground-secondary">
              Filtrar procesos
              <select
                value={processFilter}
                onChange={(event) => {
                  setProcessFilter(event.target.value as ProcessFilter);
                  setPage(1);
                }}
                className="min-h-10 min-w-56 rounded-lg border border-border bg-surface px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </FilterBar>
          <DataTable
            rows={filteredProcesses.slice((page - 1) * pageSize, page * pageSize)}
            rowKey={(process) => process.id}
            columns={columns}
            emptyTitle="No hay procesos para este filtro"
            emptyDescription="Prueba otra opción o consulta el listado completo de procesos."
          />
          {filteredProcesses.length > 0 && (
            <Pagination page={page} pageSize={pageSize} total={filteredProcesses.length} onPageChange={setPage} label="procesos" />
          )}
        </div>
      </Card>

      <section aria-label="Indicadores por ámbito" className="grid gap-5 lg:grid-cols-2">
        <Card title="Firma" description="Alejandra Muñoz | Abogada y Asociados">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-foreground-muted">Procesos activos</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/procesos" className="hover:text-primary hover:underline">{data.firma.procesos}</Link></dd></div>
            <div><dt className="text-foreground-muted">Radicados</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/radicados" className="hover:text-primary hover:underline">{data.firma.radicados}</Link></dd></div>
            <div><dt className="text-foreground-muted">Tareas</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/tareas" className="hover:text-primary hover:underline">{data.firma.tareas}</Link></dd></div>
            <div><dt className="text-foreground-muted">Documentos</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/documentos" className="hover:text-primary hover:underline">{data.firma.documentos}</Link></dd></div>
          </dl>
        </Card>
        <Card title="SaaS individual" description={`${data.saas.abogados} cuentas de abogados externos`}>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-foreground-muted">Procesos activos</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/saas/procesos" className="hover:text-primary hover:underline">{data.saas.procesos}</Link></dd></div>
            <div><dt className="text-foreground-muted">Radicados</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/saas/radicados" className="hover:text-primary hover:underline">{data.saas.radicados}</Link></dd></div>
            <div><dt className="text-foreground-muted">Tareas</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/saas/tareas" className="hover:text-primary hover:underline">{data.saas.tareas}</Link></dd></div>
            <div><dt className="text-foreground-muted">Abogados</dt><dd className="mt-1 text-xl font-semibold"><Link href="/gestion-procesos/admin/usuarios" className="hover:text-primary hover:underline">{data.saas.abogados}</Link></dd></div>
          </dl>
        </Card>
      </section>
    </section>
  );
}
