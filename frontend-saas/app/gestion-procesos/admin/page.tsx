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
  FolderOpen,
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
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { StatCard } from "@/components/ui/StatCard";
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
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }),
  });
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
        <Link href={`/gestion-procesos/admin/procesos?detalle=${process.id}`} className="group">
          <span className="font-semibold text-foreground group-hover:text-brand-700">{process.nombre}</span>
          <span className="mt-0.5 block max-w-52 truncate text-xs text-foreground-muted">
            {process.cliente ?? (process.clientes ? `${process.clientes} clientes` : "Sin cliente asignado")}
          </span>
        </Link>
      ),
    },
    { key: "responsable", header: "Responsable", render: (process) => <span className="text-foreground">{process.responsable}</span>, hideOnMobile: true },
    { key: "estado", header: "Estado", render: () => <Badge tone="normal">Activo</Badge> },
    { key: "actividad", header: "Última actividad", render: (process) => <span className="text-xs">{formatDate(process.ultima_actividad)}</span>, hideOnMobile: true },
    {
      key: "riesgo",
      header: "Riesgo",
      render: (process) => process.riesgo
        ? <Badge tone={process.vencido ? "overdue" : "risk"}>{process.riesgo}</Badge>
        : <span className="text-xs text-foreground-muted">Sin alerta</span>,
    },
    {
      key: "accion",
      header: "Próxima acción",
      hideOnMobile: true,
      render: (process) => process.proxima_accion
        ? <Link href="/gestion-procesos/admin/tareas" className="text-sm font-medium text-brand-700 hover:underline">{process.proxima_accion}</Link>
        : <span className="text-xs text-foreground-muted">Sin tareas pendientes</span>,
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
        <Button onClick={() => void refresh()} loading={loading} icon={<RefreshCw className="size-4" />}>
          Reintentar
        </Button>
      </div>
    );
  }

  const attentionItems = data.atencion.filter((item) => item.count > 0);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      {error && <Alert kind="error">Algunos datos no pudieron actualizarse. Puedes reintentar.</Alert>}

      {/* Page header with greeting */}
      <PageHeader
        title="Resumen"
        description={`${greetingAt(now)} · ${now.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        action={
          <Button variant="outline" onClick={() => void refresh()} loading={loading} icon={<RefreshCw className="size-4" />}>
            Actualizar
          </Button>
        }
      />

      {/* KPI row */}
      <section aria-label="Indicadores clave" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Usuarios activos"
          value={data.resumen.usuarios_activos.toLocaleString("es-CO")}
          icon={Users}
          detail="En todas las áreas"
          href="/gestion-procesos/admin/usuarios"
        />
        <StatCard
          label="Solicitudes pendientes"
          value={data.resumen.solicitudes_pendientes.toLocaleString("es-CO")}
          icon={UserCheck}
          detail="Registro y perfil"
          href="/gestion-procesos/admin/solicitudes"
          tone={data.resumen.solicitudes_pendientes > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Procesos activos"
          value={data.resumen.procesos_activos.toLocaleString("es-CO")}
          icon={BriefcaseBusiness}
          detail="Firma y SaaS"
          href="/gestion-procesos/admin/procesos"
        />
        <StatCard
          label="Alertas activas"
          value={data.resumen.alertas.toLocaleString("es-CO")}
          icon={AlertTriangle}
          detail="Requieren atención"
          href="/gestion-procesos/admin/alertas"
          tone={data.resumen.alertas > 0 ? "danger" : "default"}
        />
      </section>

      {/* Secondary metrics row */}
      <section aria-label="Métricas secundarias" className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Tareas pendientes"
          value={data.resumen.tareas_pendientes.toLocaleString("es-CO")}
          icon={CalendarClock}
          detail="Por completar o en curso"
          href="/gestion-procesos/admin/tareas"
          tone={data.resumen.tareas_pendientes > 5 ? "warning" : "default"}
        />
        <StatCard
          label="Documentos por revisar"
          value={data.resumen.documentos_pendientes.toLocaleString("es-CO")}
          icon={FileText}
          detail="Solicitudes sin atender"
          href="/gestion-procesos/admin/documentos/solicitudes"
        />
        <StatCard
          label="Errores operativos"
          value={data.resumen.errores_operativos.toLocaleString("es-CO")}
          icon={Activity}
          detail="Consultas y notificaciones"
          href="/gestion-procesos/admin/operacion"
          tone={data.resumen.errores_operativos > 0 ? "danger" : "default"}
        />
      </section>

      {/* Attention + Activity row */}
      <section className="grid gap-5 xl:grid-cols-2">
        {/* Attention panel */}
        <Card title="Requiere atención" description="Pendientes y errores confirmados.">
          {attentionItems.length > 0 ? (
            <ul className="space-y-1.5">
              {attentionItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`size-2 shrink-0 rounded-full ${item.tone === "danger" ? "bg-danger" : "bg-warning"}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                    </div>
                    <Badge tone={item.tone === "danger" ? "risk" : "attention"}>
                      {item.count.toLocaleString("es-CO")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Todo está al día" description="No hay solicitudes, tareas vencidas ni errores que requieran atención." />
          )}
        </Card>

        {/* Recent activity */}
        <Card
          title="Actividad reciente"
          description="Últimos cambios en la plataforma."
          action={
            <Link href="/gestion-procesos/admin/auditoria" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              Ver auditoría<ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          }
        >
          {data.actividad.length > 0 ? (
            <ol className="space-y-4">
              {data.actividad.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${event.tipo === "error" ? "bg-danger-light text-danger" : "bg-brand-50 text-brand-700"}`}>
                    <Activity aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{event.actor}</span> {event.descripcion}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
                      <Link href={event.href} className="font-medium text-brand-700 hover:underline">{event.recurso}</Link>
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

      {/* Critical processes table */}
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
                className="min-h-10 min-w-56 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
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

      {/* Scope indicators */}
      <section aria-label="Indicadores por ámbito" className="grid gap-5 lg:grid-cols-2">
        <Card title="Firma" description="Alejandra Muñoz | Abogada y Asociados">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-foreground-muted">Procesos activos</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/procesos" className="hover:text-brand-700">{data.firma.procesos}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Radicados</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/radicados" className="hover:text-brand-700">{data.firma.radicados}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Tareas</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/tareas" className="hover:text-brand-700">{data.firma.tareas}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Documentos</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/documentos" className="hover:text-brand-700">{data.firma.documentos}</Link>
              </dd>
            </div>
          </dl>
        </Card>
        <Card title="SaaS individual" description={`${data.saas.abogados} cuentas de abogados externos`}>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-foreground-muted">Procesos activos</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/saas/procesos" className="hover:text-brand-700">{data.saas.procesos}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Radicados</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/saas/radicados" className="hover:text-brand-700">{data.saas.radicados}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Tareas</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/saas/tareas" className="hover:text-brand-700">{data.saas.tareas}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Abogados</dt>
              <dd className="mt-1 text-xl font-bold text-foreground">
                <Link href="/gestion-procesos/admin/usuarios" className="hover:text-brand-700">{data.saas.abogados}</Link>
              </dd>
            </div>
          </dl>
        </Card>
      </section>
    </section>
  );
}
