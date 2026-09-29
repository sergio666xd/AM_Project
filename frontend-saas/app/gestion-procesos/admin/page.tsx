"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  FolderOpen,
  RefreshCw,
  Users,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Inventory = Record<string, unknown>[];
type DashboardData = {
  totalUsers: number;
  activeUsers: number;
  pendingRequests: number;
  activePlans: number;
  firm: {
    processes: number;
    radicados: number;
    tasks: number;
    documents: number;
  };
  saas: {
    processes: number;
    radicados: number;
    tasks: number;
    lawyers: number;
  };
  operation: { consultationsInQueue: number; consultationErrors: number };
};

async function loadDashboard(token: string): Promise<DashboardData> {
  const [
    vision,
    users,
    plans,
    requests,
    firmProcesses,
    firmRadicados,
    firmTasks,
    firmDocuments,
    saasProcesses,
    saasRadicados,
    saasTasks,
  ] = await Promise.all([
    fetchApi("/api/admin/vision-global", { method: "GET", token }),
    fetchApi("/api/admin/usuarios", { method: "GET", token }),
    fetchApi("/api/admin/planes", { method: "GET", token }),
    fetchApi("/api/admin/solicitudes", { method: "GET", token }),
    fetchApi("/api/admin/inventario/procesos?sector=FIRMA", {
      method: "GET",
      token,
    }),
    fetchApi("/api/admin/inventario/radicados?sector=FIRMA", {
      method: "GET",
      token,
    }),
    fetchApi("/api/admin/inventario/tareas?sector=FIRMA", {
      method: "GET",
      token,
    }),
    fetchApi("/api/admin/inventario/documentos?sector=FIRMA", {
      method: "GET",
      token,
    }),
    fetchApi("/api/admin/inventario/procesos?sector=SAAS", {
      method: "GET",
      token,
    }),
    fetchApi("/api/admin/inventario/radicados?sector=SAAS", {
      method: "GET",
      token,
    }),
    fetchApi("/api/admin/inventario/tareas?sector=SAAS", {
      method: "GET",
      token,
    }),
  ]);
  const accountUsers = users as { rol: string; estado: string }[];
  const planItems = plans as { activo: boolean }[];
  return {
    totalUsers: accountUsers.length,
    activeUsers: accountUsers.filter((user) => user.estado === "ACTIVO").length,
    pendingRequests: Array.isArray(requests) ? requests.length : 0,
    activePlans: planItems.filter((plan) => plan.activo).length,
    firm: {
      processes: (firmProcesses as Inventory).length,
      radicados: (firmRadicados as Inventory).length,
      tasks: (firmTasks as Inventory).length,
      documents: (firmDocuments as Inventory).length,
    },
    saas: {
      processes: (saasProcesses as Inventory).length,
      radicados: (saasRadicados as Inventory).length,
      tasks: (saasTasks as Inventory).length,
      lawyers: accountUsers.filter((user) => user.rol === "ABOGADO").length,
    },
    operation: {
      consultationsInQueue: vision.resumen.consultas_en_cola,
      consultationErrors: vision.resumen.consultas_error,
    },
  };
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
}) {
  return (
    <div className="border-l-2 border-[var(--primary)] pl-3">
      <p className="text-xs text-[var(--foreground-muted)]">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-[var(--foreground)]">
        <Icon className="size-4 text-[var(--primary)]" />
        {value}
      </p>
    </div>
  );
}

function ScopeSection({
  title,
  description,
  href,
  metrics,
}: {
  title: string;
  description: string;
  href: string;
  metrics: { label: string; value: number; icon: typeof Activity }[];
}) {
  return (
    <section className="space-y-4 border-t border-[var(--border)] py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {description}
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)] hover:underline"
        >
          Abrir sector <ArrowRight className="size-4" />
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {metrics.map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  );
}

export default function AdminDashboard() {
  const { token, loading: sessionLoading } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    loadDashboard(token)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar la consola global.",
          );
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
    setError("");
    try {
      setData(await loadDashboard(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar la consola global.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading || sessionLoading)
    return (
      <div className="grid min-h-72 place-items-center text-sm text-[var(--foreground-muted)]">
        <RefreshCw className="size-5 animate-spin" />
        Cargando consola...
      </div>
    );

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--primary)]">
            Panel Administrativo · Control global
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
            Administración
          </h1>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Dos sectores operativos, con datos y responsables diferenciados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-light)] p-3 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}
      {data && (
        <>
          <section className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-4">
            <Metric label="Usuarios" value={data.totalUsers} icon={Users} />
            <Metric
              label="Usuarios activos"
              value={data.activeUsers}
              icon={Activity}
            />
            <Metric
              label="Planes activos"
              value={data.activePlans}
              icon={FileText}
            />
            <Metric
              label="Solicitudes de acceso"
              value={data.pendingRequests}
              icon={Users}
            />
          </section>
          <ScopeSection
            title="Firma"
            description="Alejandra Muñoz Abogada y Asociados"
            href="/gestion-procesos/admin/procesos"
            metrics={[
              {
                label: "Procesos",
                value: data.firm.processes,
                icon: BriefcaseBusiness,
              },
              {
                label: "Radicados",
                value: data.firm.radicados,
                icon: FolderOpen,
              },
              { label: "Tareas", value: data.firm.tasks, icon: Activity },
              {
                label: "Documentos",
                value: data.firm.documents,
                icon: FileText,
              },
            ]}
          />
          <ScopeSection
            title="SaaS individual"
            description={`${data.saas.lawyers} cuentas de abogados externos · sin organizaciones compartidas`}
            href="/gestion-procesos/admin/saas/procesos"
            metrics={[
              { label: "Abogados", value: data.saas.lawyers, icon: Users },
              {
                label: "Procesos",
                value: data.saas.processes,
                icon: BriefcaseBusiness,
              },
              {
                label: "Radicados",
                value: data.saas.radicados,
                icon: FolderOpen,
              },
              { label: "Tareas", value: data.saas.tasks, icon: Activity },
            ]}
          />
          <section className="grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Consultas judiciales
              </p>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                {data.operation.consultationsInQueue} en cola ·{" "}
                {data.operation.consultationErrors} con error
              </p>
              <Link
                href="/gestion-procesos/admin/operacion"
                className="mt-3 inline-flex text-sm font-semibold text-[var(--primary)]"
              >
                Ver operación
              </Link>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Contenido público
              </p>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Edición estructurada de páginas institucionales.
              </p>
              <Link
                href="/gestion-procesos/admin/contenido"
                className="mt-3 inline-flex text-sm font-semibold text-[var(--primary)]"
              >
                Editar páginas
              </Link>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
