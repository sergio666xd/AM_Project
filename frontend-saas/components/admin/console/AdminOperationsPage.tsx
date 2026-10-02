"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Play,
  RefreshCw,
  Save,
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
type ConsultationConfig = {
  activa: boolean;
  dias_habilitados: number[];
  horas_colombia: string[];
  proxima_ejecucion: string | null;
};
type SweepRun = {
  id: string;
  tipo: string;
  estado: string;
  inicio: string;
  finalizacion: string | null;
  total_radicados: number;
  procesados: number;
  errores: number;
  actuaciones_nuevas: number;
};
type SweepRadicadoDetail = {
  id: number;
  radicado_id: number;
  numero: string;
  estado: string;
  actuaciones_nuevas: number;
  error: string | null;
};
type SweepDetails = { ejecucion: SweepRun; radicados: SweepRadicadoDetail[] };
type OperationsData = {
  vision: Vision;
  redis: RedisStatus;
  consultationConfig: ConsultationConfig;
  sweeps: SweepRun[];
};
async function loadOperations(token: string): Promise<OperationsData> {
  const [vision, redis, consultationConfig, sweeps] = await Promise.all([
    fetchApi("/api/admin/vision-global", { method: "GET", token }),
    fetchApi("/api/test-redis", { method: "GET", token }),
    fetchApi("/api/admin/consultas/configuracion", { method: "GET", token }),
    fetchApi("/api/admin/consultas/ejecuciones?limite=8", { method: "GET", token }),
  ]);
  return { vision, redis, consultationConfig, sweeps };
}

const WEEKDAYS = [
  { value: 0, label: "Lun" },
  { value: 1, label: "Mar" },
  { value: 2, label: "Mié" },
  { value: 3, label: "Jue" },
  { value: 4, label: "Vie" },
  { value: 5, label: "Sáb" },
  { value: 6, label: "Dom" },
];

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
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [startingManual, setStartingManual] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [sweepDetails, setSweepDetails] = useState<SweepDetails | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState("");
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

  async function saveSchedule() {
    if (!token || !data) return;
    setSavingSchedule(true);
    setScheduleMessage("");
    setError("");
    try {
      const consultationConfig = await fetchApi("/api/admin/consultas/configuracion", {
        method: "PUT",
        token,
        body: JSON.stringify({
          activa: data.consultationConfig.activa,
          dias_habilitados: data.consultationConfig.dias_habilitados,
        }),
      });
      setData({ ...data, consultationConfig });
      setScheduleMessage("Configuración guardada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar la configuración.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function startManualSweep() {
    if (!token) return;
    setStartingManual(true);
    setScheduleMessage("");
    setError("");
    try {
      const response = await fetch("/workflow-admin/consultas", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || `Error ${response.status}`);
      setScheduleMessage(`Consulta iniciada: ${result.workflow_run_id || "en ejecución"}.`);
      setData(await loadOperations(token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar la consulta.");
    } finally {
      setStartingManual(false);
    }
  }

  async function toggleSweepDetails(runId: string) {
    if (!token) return;
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setSweepDetails(null);
      return;
    }
    setExpandedRunId(runId);
    setSweepDetails(null);
    setError("");
    try {
      const details = await fetchApi(
        `/api/admin/consultas/ejecuciones/${encodeURIComponent(runId)}?limite=250`,
        { method: "GET", token },
      );
      setSweepDetails(details);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar el detalle de la ejecución.");
      setExpandedRunId(null);
    }
  }

  function toggleWeekday(day: number) {
    if (!data) return;
    const selected = new Set(data.consultationConfig.dias_habilitados);
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    setData({
      ...data,
      consultationConfig: {
        ...data.consultationConfig,
        dias_habilitados: [...selected].sort((left, right) => left - right),
      },
    });
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
            <section className="space-y-4 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="size-5 text-primary" />
                  <div>
                    <h2 className="font-semibold">Consultas judiciales</h2>
                    <p className="text-sm text-foreground-muted">Horarios Colombia: 12:00 y 17:00</p>
                    <p className="text-xs text-foreground-muted">
                      Próxima ventana: {data.consultationConfig.proxima_ejecucion
                        ? new Date(data.consultationConfig.proxima_ejecucion).toLocaleString("es-CO", { timeZone: "America/Bogota" })
                        : "Sin programación"}
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={data.consultationConfig.activa}
                    onChange={(event) => setData({
                      ...data,
                      consultationConfig: { ...data.consultationConfig, activa: event.target.checked },
                    })}
                    className="size-4 accent-primary"
                  />
                  Activas
                </label>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Días de consulta">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={data.consultationConfig.dias_habilitados.includes(day.value)}
                      onChange={() => toggleWeekday(day.value)}
                      className="size-4 accent-primary"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveSchedule()}
                  disabled={savingSchedule}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Save className="size-4" />
                  {savingSchedule ? "Guardando..." : "Guardar configuración"}
                </button>
                <button
                  type="button"
                  onClick={() => void startManualSweep()}
                  disabled={startingManual}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                >
                  <Play className="size-4" />
                  {startingManual ? "Iniciando..." : "Consultar ahora"}
                </button>
                {scheduleMessage && <span role="status" className="text-sm text-success">{scheduleMessage}</span>}
              </div>
              <div className="overflow-x-auto border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-semibold">Ejecuciones recientes</h3>
                {data.sweeps.length === 0 ? (
                  <p className="text-sm text-foreground-muted">Sin ejecuciones registradas.</p>
                ) : (
                  <table className="w-full min-w-190 text-left text-sm">
                    <thead className="text-xs text-foreground-muted">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Inicio</th>
                        <th className="py-2 pr-4 font-medium">Tipo</th>
                        <th className="py-2 pr-4 font-medium">Estado</th>
                        <th className="py-2 pr-4 font-medium">Radicados</th>
                        <th className="py-2 pr-4 font-medium">Novedades</th>
                        <th className="py-2 font-medium">Errores</th>
                        <th className="py-2 font-medium">Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sweeps.map((sweep) => (
                        <Fragment key={sweep.id}>
                          <tr className="border-t border-border">
                            <td className="py-2 pr-4">{new Date(sweep.inicio).toLocaleString("es-CO")}</td>
                            <td className="py-2 pr-4">{sweep.tipo}</td>
                            <td className="py-2 pr-4">{sweep.estado}</td>
                            <td className="py-2 pr-4">{sweep.procesados}/{sweep.total_radicados}</td>
                            <td className="py-2 pr-4">{sweep.actuaciones_nuevas}</td>
                            <td className="py-2 pr-4">{sweep.errores}</td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() => void toggleSweepDetails(sweep.id)}
                                aria-expanded={expandedRunId === sweep.id}
                                className="text-primary underline-offset-2 hover:underline"
                              >
                                {expandedRunId === sweep.id ? "Ocultar" : "Ver"}
                              </button>
                            </td>
                          </tr>
                          {expandedRunId === sweep.id && (
                            <tr className="border-t border-border bg-surface-secondary">
                              <td colSpan={7} className="p-3">
                                {!sweepDetails || sweepDetails.ejecucion.id !== sweep.id ? (
                                  <p className="text-sm text-foreground-muted">Cargando detalle...</p>
                                ) : sweepDetails.radicados.length === 0 ? (
                                  <p className="text-sm text-foreground-muted">La ejecución aún no registra radicados.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {sweepDetails.radicados.map((item) => (
                                      <div key={item.id} className="flex flex-wrap justify-between gap-2 text-sm">
                                        <span>{item.numero} · {item.estado} · {item.actuaciones_nuevas} novedad(es)</span>
                                        {item.error && <span className="text-danger">{item.error}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
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
