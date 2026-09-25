"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

interface DashboardData {
  usuario: {
    nombre: string;
  };

  plan: {
    id: number;
    nombre: string;
    limite_radicados: number;
    precio_mensual: number;
  } | null;

  resumen: {
    total_radicados: number;
    limite_radicados: number;
    consultas_pendientes: number;
    actuaciones_nuevas: number;
    consultas_error: number;
  };

  procesos_atencion: {
    radicado_id: number;
    numero: string;
    motivo: string;
    tipo: string;
  }[];

  ultimas_consultas: {
    id: number;
    radicado_id: number;
    radicado: string;
    tipo: string;
    estado: string;
    inicio: string | null;
    finalizacion: string | null;
    actuaciones_nuevas: number;
    detalle: string | null;
    error: string | null;
  }[];
}

export default function DashboardPage() {
  const { token, loading: sessionLoading } = useSession();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Todavía estamos comprobando la sesión
    if (sessionLoading) {
      return;
    }
    
    // Terminó la comprobación y no hay sesión
    if (!token) {
      router.replace("/gestion-procesos/auth/login");
      return;
    }
  
    // Desde aquí TypeScript sabe que token es string
    const authToken = token;
  
    async function cargarDashboard() {
      try {
        setLoading(true);
        setError("");
  
        const response = (await fetchApi("/api/dashboard", {
          method: "GET",
          token: authToken,
        })) as DashboardData;
  
        setData(response);
      } catch (err) {
        console.error("Error cargando dashboard:", err);
        setError("No fue posible cargar el dashboard.");
      } finally {
        setLoading(false);
      }
    }
    
    cargarDashboard();
  }, [token, sessionLoading, router]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--foreground-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Verificando sesión...
        </div>
      </div>
    );
  }
  
  if (!token) {
    return null;
  }
  
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--foreground-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Cargando dashboard...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error || "No hay información disponible."}
      </div>
    );
  }

  const {
    resumen,
    plan,
    procesos_atencion,
    ultimas_consultas,
  } = data;

  const porcentajeUso =
    resumen.limite_radicados > 0
      ? Math.min(
          (resumen.total_radicados / resumen.limite_radicados) * 100,
          100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Dashboard
        </h1>

        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Resumen de tu actividad judicial
        </p>
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Radicados */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Radicados
              </p>

              <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
                {resumen.total_radicados}
              </p>

              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                de {resumen.limite_radicados} disponibles
              </p>
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <FileText className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Consultas pendientes */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Consultas pendientes
              </p>

              <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
                {resumen.consultas_pendientes}
              </p>

              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                En cola o ejecutándose
              </p>
            </div>

            <div className="rounded-lg bg-amber-50 p-3 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <Clock3 className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Actuaciones nuevas */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Actuaciones nuevas
              </p>

              <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
                {resumen.actuaciones_nuevas}
              </p>

              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                Detectadas en consultas
              </p>
            </div>

            <div className="rounded-lg bg-green-50 p-3 text-green-600 dark:bg-green-950 dark:text-green-400">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Consultas con error */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Consultas con error
              </p>

              <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
                {resumen.consultas_error}
              </p>

              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                Requieren revisión
              </p>
            </div>

            <div className="rounded-lg bg-red-50 p-3 text-red-600 dark:bg-red-950 dark:text-red-400">
              <AlertCircle className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Segunda sección */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Procesos */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm xl:col-span-2">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="font-semibold text-[var(--foreground)]">
              Procesos que requieren atención
            </h2>

            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Procesos con novedades o situaciones pendientes
            </p>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {procesos_atencion.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-8 text-sm text-[var(--foreground-muted)]">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                No hay procesos que requieran atención.
              </div>
            ) : (
              procesos_atencion.map((proceso) => (
                <div
                  key={`${proceso.radicado_id}-${proceso.tipo}`}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="font-medium text-[var(--foreground)]">
                      {proceso.numero}
                    </p>

                    <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                      {proceso.motivo}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    Atención
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Plan */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="font-semibold text-[var(--foreground)]">
            Mi plan
          </h2>

          {plan ? (
            <>
              <p className="mt-4 text-lg font-semibold text-[var(--foreground)]">
                {plan.nombre}
              </p>

              <div className="mt-5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--foreground-muted)]">
                    Uso de radicados
                  </span>

                  <span className="font-medium text-[var(--foreground)]">
                    {resumen.total_radicados} / {plan.limite_radicados}
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${porcentajeUso}%` }}
                  />
                </div>
              </div>

              <p className="mt-4 text-sm text-[var(--foreground-muted)]">
                Tienes{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {Math.max(
                    plan.limite_radicados - resumen.total_radicados,
                    0
                  )}
                </span>{" "}
                cupos disponibles.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--foreground-muted)]">
              No tienes un plan asignado.
            </p>
          )}
        </div>
      </div>

      {/* Últimas consultas */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold text-[var(--foreground)]">
            Últimas consultas
          </h2>

          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Actividad reciente de tus procesos
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--foreground-muted)]">
                <th className="px-5 py-3 font-medium">
                  Radicado
                </th>

                <th className="px-5 py-3 font-medium">
                  Tipo
                </th>

                <th className="px-5 py-3 font-medium">
                  Estado
                </th>

                <th className="px-5 py-3 font-medium">
                  Novedades
                </th>

                <th className="px-5 py-3 font-medium">
                  Fecha
                </th>
              </tr>
            </thead>

            <tbody>
              {ultimas_consultas.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-sm text-[var(--foreground-muted)]"
                  >
                    Todavía no hay consultas registradas.
                  </td>
                </tr>
              ) : (
                ultimas_consultas.map((consulta) => (
                  <tr
                    key={consulta.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-5 py-4 font-medium text-[var(--foreground)]">
                      {consulta.radicado}
                    </td>

                    <td className="px-5 py-4 text-sm text-[var(--foreground-secondary)]">
                      {consulta.tipo}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-slate-700 dark:text-slate-200">
                        {consulta.estado}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-[var(--foreground-secondary)]">
                      {consulta.actuaciones_nuevas}
                    </td>

                    <td className="px-5 py-4 text-sm text-[var(--foreground-secondary)]">
                      {consulta.inicio
                        ? new Date(
                            consulta.inicio
                          ).toLocaleString("es-CO")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
