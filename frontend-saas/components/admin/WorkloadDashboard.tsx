"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckSquare, FolderOpen, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";

type Rows = { responsable_id: number; responsable: string; cantidad: number }[];
type Metrics = { procesos_activos: number; tareas_abiertas: number; vencidas: number; por_vencer_7_dias: number; procesos_por_responsable: Rows; tareas_por_responsable: Rows; actividad_reciente: { tipo: string; titulo: string; fecha: string; proceso_id: number }[] };

export default function WorkloadDashboard() {
  const { token, user } = useSession();
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const allowed = user?.rol === "ADMIN" || user?.rol === "ABOGADO_ADMIN";
  useEffect(() => {
    if (!token || !allowed) return;
    fetchApi("/api/expedientes/metricas-carga", { token }).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "No fue posible cargar las métricas."));
  }, [token, allowed]);
  if (!allowed) return <section><h1 className="text-2xl font-semibold">Sin acceso</h1><p className="mt-2 text-sm text-foreground-muted">Esta vista está disponible para administración y abogados administradores.</p></section>;
  if (error) return <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</p>;
  if (!data) return <p className="py-12 text-center text-sm text-foreground-muted"><RefreshCw className="mr-2 inline size-4 animate-spin" />Cargando métricas…</p>;
  const cards = [
    { label: "Procesos activos", value: data.procesos_activos, icon: FolderOpen },
    { label: "Tareas abiertas", value: data.tareas_abiertas, icon: CheckSquare },
    { label: "Tareas vencidas", value: data.vencidas, icon: AlertTriangle },
    { label: "Vencen en 7 días", value: data.por_vencer_7_dias, icon: Activity },
  ];
  const table = (title: string, rows: Rows) => {
    const base = user?.rol === "ADMIN" ? "/gestion-procesos/admin" : "/gestion-procesos/abogado";
    const href = `${base}/${title.startsWith("Procesos") ? "procesos" : "tareas"}`;
    return (
      <Card title={title}>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.responsable_id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <Link href={href} className="font-medium text-brand-900 hover:underline">{row.responsable}</Link>
                <Link href={href} aria-label={`Ver ${row.cantidad} registros de ${row.responsable}`} className="rounded-full bg-surface-hover px-2.5 py-1 font-semibold tabular-nums hover:bg-brand-50">
                  {row.cantidad}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-foreground-muted">No hay registros para este alcance.</p>
        )}
      </Card>
    );
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        overline={user?.rol === "ADMIN" ? "Visión global" : "Firma"}
        title="Métricas y carga de trabajo"
        description="Procesos, tareas y próximos vencimientos por responsable."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Procesos activos" value={data.procesos_activos} icon={FolderOpen} />
        <StatCard label="Tareas abiertas" value={data.tareas_abiertas} icon={CheckSquare} />
        <StatCard label="Tareas vencidas" value={data.vencidas} icon={AlertTriangle} tone={data.vencidas > 0 ? "danger" : "default"} />
        <StatCard label="Vencen en 7 días" value={data.por_vencer_7_dias} icon={Activity} tone={data.por_vencer_7_dias > 0 ? "warning" : "default"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {table("Procesos activos por responsable", data.procesos_por_responsable)}
        {table("Tareas abiertas por responsable", data.tareas_por_responsable)}
      </div>
      <Card title="Actividad reciente">
        {data.actividad_reciente.length ? (
          <ul className="divide-y divide-border">
            {data.actividad_reciente.map((item, index) => {
              const href = user?.rol === "ADMIN" ? `/gestion-procesos/admin/procesos?detalle=${item.proceso_id}` : `/gestion-procesos/abogado/procesos/${item.proceso_id}`;
              return (
                <li key={`${item.proceso_id}:${item.fecha}:${index}`}>
                  <Link href={href} className="flex flex-col gap-1 py-3 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="mr-2 rounded-full bg-surface-hover px-2 py-1 text-xs">{item.tipo}</span>
                      <span className="text-sm">{item.titulo}</span>
                    </span>
                    <time className="text-xs text-foreground-muted" dateTime={item.fecha}>
                      {new Date(item.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-sm text-foreground-muted">Aún no hay actividad registrada.</p>
        )}
      </Card>
    </div>
  );
}
