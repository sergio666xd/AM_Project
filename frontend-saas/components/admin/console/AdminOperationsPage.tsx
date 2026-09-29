"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  RefreshCw,
  ServerCog,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

type Vision = {
  resumen: {
    consultas_error: number;
    consultas_en_cola: number;
    solicitudes_documento_pendientes: number;
    tareas: number;
  };
  operacion: { motor_local: string; webhooks_vercel: string };
};
type RedisStatus = { ok: boolean; redis: string };
type OperationsData = { vision: Vision; redis: RedisStatus };
async function loadOperations(token: string): Promise<OperationsData> {
  const [vision, redis] = await Promise.all([
    fetchApi("/api/admin/vision-global", { method: "GET", token }),
    fetchApi("/api/test-redis", { method: "GET", token }),
  ]);
  return { vision, redis };
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "text-foreground",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <Icon className={`size-4 ${tone}`} />
      <p className="mt-3 text-xs text-foreground-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function AdminOperationsPage() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token =
    typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadOperations(token)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible consultar la operación.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setData(await loadOperations(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible consultar la operación.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Panel Administrativo · Global
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Operación
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Estado de servicios y colas disponibles en el backend.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Actualizar estado de operación"
          className="grid size-10 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {loading && !data ? (
        <div className="grid min-h-40 place-items-center text-sm text-foreground-muted">
          Consultando servicios...
        </div>
      ) : (
        data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={Database}
                label="Redis"
                value={data.redis.ok ? "Conectado" : data.redis.redis}
                tone={data.redis.ok ? "text-success" : "text-warning"}
              />
              <Metric
                icon={ServerCog}
                label="Motor de tareas"
                value={data.vision.operacion.motor_local}
              />
              <Metric
                icon={Clock3}
                label="Consultas en cola"
                value={data.vision.resumen.consultas_en_cola}
                tone="text-info"
              />
              <Metric
                icon={AlertCircle}
                label="Consultas con error"
                value={data.vision.resumen.consultas_error}
                tone={
                  data.vision.resumen.consultas_error
                    ? "text-danger"
                    : "text-success"
                }
              />
            </section>
            <section className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-primary" />
                  <div>
                    <h2 className="font-semibold">Solicitudes documentales</h2>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {data.vision.resumen.solicitudes_documento_pendientes}{" "}
                      pendientes de respuesta
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center gap-3">
                  <Activity className="size-5 text-primary" />
                  <div>
                    <h2 className="font-semibold">Webhooks</h2>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {data.vision.operacion.webhooks_vercel}
                    </p>
                  </div>
                </div>
              </div>
            </section>
            <p className="flex items-start gap-2 text-xs text-foreground-muted">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              El estado del worker Celery no se expone como healthcheck
              independiente; la cola muestra consultas registradas en la base de
              datos.
            </p>
          </>
        )
      )}
    </section>
  );
}
