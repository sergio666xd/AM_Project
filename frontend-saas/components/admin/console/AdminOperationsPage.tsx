"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Play,
  RefreshCw,
  Search,
  Save,
  Send,
  ServerCog,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { IntegrationSettingsPanel } from "@/components/admin/console/IntegrationSettingsPanel";

type Vision = {
  resumen: {
    consultas_error: number;
    consultas_en_cola: number;
    solicitudes_documento_pendientes: number;
    tareas: number;
  };
  operacion: { motor_local: string; webhooks_vercel: string };
};
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
type RadicadoOption = { id: number; numero: string; ambito: string };
type IntegrationName = "RAMA" | "WORKFLOW" | "SMTP" | "WHATSAPP";
type IntegrationResult = {
  estado: string;
  detalle?: string;
  codigo_http?: number;
  workflow_run_id?: string;
  causa?: string;
  launcher_host?: string;
  content_type?: string;
};
type OperationsData = {
  vision: Vision;
  consultationConfig: ConsultationConfig;
  sweeps: SweepRun[];
};
async function loadOperations(token: string): Promise<OperationsData> {
  const [vision, consultationConfig, sweeps] = await Promise.all([
    fetchApi("/api/admin/vision-global", { method: "GET", token }),
    fetchApi("/api/admin/consultas/configuracion", { method: "GET", token }),
    fetchApi("/api/admin/consultas/ejecuciones?limite=8", { method: "GET", token }),
  ]);
  return { vision, consultationConfig, sweeps };
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
  const [manualMode, setManualMode] = useState<"TODOS" | "SELECCION">("TODOS");
  const [radicadoQuery, setRadicadoQuery] = useState("");
  const [radicadoOptions, setRadicadoOptions] = useState<RadicadoOption[]>([]);
  const [selectedRadicadoIds, setSelectedRadicadoIds] = useState<number[]>([]);
  const [searchingRadicados, setSearchingRadicados] = useState(false);
  const [integrationResults, setIntegrationResults] = useState<Partial<Record<IntegrationName, IntegrationResult>>>({});
  const [checkingIntegration, setCheckingIntegration] = useState<IntegrationName | null>(null);
  const [testChannel, setTestChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [testRecipient, setTestRecipient] = useState("");
  const [confirmTestSend, setConfirmTestSend] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
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

  async function checkIntegration(integration: IntegrationName) {
    if (!token) return;
    setCheckingIntegration(integration);
    setError("");
    try {
      const result = await fetchApi("/api/admin/diagnosticos/conexion", {
        method: "POST",
        token,
        body: JSON.stringify({ integracion: integration }),
      });
      setIntegrationResults((current) => ({ ...current, [integration]: result }));
    } catch (cause) {
      setIntegrationResults((current) => ({
        ...current,
        [integration]: { estado: cause instanceof Error ? cause.message : "FALLO" },
      }));
    } finally {
      setCheckingIntegration(null);
    }
  }

  async function sendIntegrationTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !confirmTestSend || !testRecipient.trim()) return;
    setSendingTest(true);
    setError("");
    setScheduleMessage("");
    try {
      const result = await fetchApi("/api/admin/diagnosticos/envio", {
        method: "POST",
        token,
        body: JSON.stringify({
          canal: testChannel,
          destinatario: testRecipient.trim(),
          confirmar_envio: confirmTestSend,
        }),
      });
      setScheduleMessage(`Prueba ${result.estado.toLowerCase()} por ${result.canal}.`);
      setConfirmTestSend(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible enviar el mensaje de prueba.");
    } finally {
      setSendingTest(false);
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

  async function startManualSweep(radicadoIds?: number[]) {
    if (!token) return;
    const ids = radicadoIds ?? selectedRadicadoIds;
    const selected = radicadoIds !== undefined || manualMode === "SELECCION";
    if (selected && ids.length === 0) {
      setError("Selecciona al menos un radicado.");
      return;
    }
    setStartingManual(true);
    setScheduleMessage("");
    setError("");
    try {
      const response = await fetch(selected ? "/workflow-admin/consultas/radicado" : "/workflow-admin/consultas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(selected ? { "Content-Type": "application/json" } : {}),
        },
        ...(selected ? {
          body: JSON.stringify({ tipo: "MANUAL", radicado_ids: ids }),
        } : {}),
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

  async function searchManualRadicados(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSearchingRadicados(true);
    setError("");
    try {
      const result = await fetchApi(
        `/api/admin/consultas/radicados?q=${encodeURIComponent(radicadoQuery)}&limite=50`,
        { method: "GET", token },
      );
      setRadicadoOptions(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible buscar radicados.");
    } finally {
      setSearchingRadicados(false);
    }
  }

  function toggleSelectedRadicado(radicadoId: number) {
    setSelectedRadicadoIds((current) => current.includes(radicadoId)
      ? current.filter((id) => id !== radicadoId)
      : [...current, radicadoId]);
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
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  disabled={startingManual || manualMode === "SELECCION" && selectedRadicadoIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                >
                  <Play className="size-4" />
                  {startingManual ? "Iniciando..." : manualMode === "TODOS" ? "Consultar todos" : `Consultar selección (${selectedRadicadoIds.length})`}
                </button>
                {scheduleMessage && <span role="status" className="text-sm text-success">{scheduleMessage}</span>}
              </div>
              <div className="space-y-3 rounded-md border border-border p-3">
                <div role="group" aria-label="Alcance de consulta manual" className="inline-flex gap-1 rounded-md border border-border p-1">
                  {(["TODOS", "SELECCION"] as const).map((mode) => (
                    <button key={mode} type="button" aria-pressed={manualMode === mode} onClick={() => setManualMode(mode)} className={`rounded px-3 py-1.5 text-sm ${manualMode === mode ? "bg-primary text-white" : "text-foreground-muted hover:bg-surface-hover"}`}>
                      {mode === "TODOS" ? "Todos los radicados" : "Selección manual"}
                    </button>
                  ))}
                </div>
                {manualMode === "SELECCION" && (
                  <>
                    <form onSubmit={searchManualRadicados} className="flex max-w-xl gap-2">
                      <input value={radicadoQuery} onChange={(event) => setRadicadoQuery(event.target.value)} placeholder="Buscar por número de radicado" className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
                      <button type="submit" disabled={searchingRadicados} aria-label="Buscar radicados" title="Buscar radicados" className="grid size-10 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50">
                        <Search className={`size-4 ${searchingRadicados ? "animate-pulse" : ""}`} />
                      </button>
                    </form>
                    {radicadoOptions.length > 0 && (
                      <div className="max-h-56 max-w-2xl overflow-y-auto rounded-md border border-border">
                        {radicadoOptions.map((radicado) => (
                          <label key={radicado.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-surface-hover">
                            <input type="checkbox" checked={selectedRadicadoIds.includes(radicado.id)} onChange={() => toggleSelectedRadicado(radicado.id)} className="size-4 accent-primary" />
                            <span className="font-medium">{radicado.numero}</span>
                            <span className="text-xs text-foreground-muted">{radicado.ambito}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-foreground-muted">{selectedRadicadoIds.length} radicado(s) seleccionado(s).</p>
                  </>
                )}
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
                        <th className="py-2 pr-4 font-medium">Fin</th>
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
                            <td className="py-2 pr-4">{sweep.finalizacion ? new Date(sweep.finalizacion).toLocaleString("es-CO") : "En curso"}</td>
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
                              <td colSpan={8} className="p-3">
                                {!sweepDetails || sweepDetails.ejecucion.id !== sweep.id ? (
                                  <p className="text-sm text-foreground-muted">Cargando detalle...</p>
                                ) : sweepDetails.radicados.length === 0 ? (
                                  <p className="text-sm text-foreground-muted">La ejecución aún no registra radicados.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {sweepDetails.radicados.some((item) => item.estado === "ERROR") && (
                                      <button
                                        type="button"
                                        disabled={startingManual}
                                        onClick={() => void startManualSweep(sweepDetails.radicados.filter((item) => item.estado === "ERROR").map((item) => item.radicado_id))}
                                        className="mb-2 inline-flex items-center gap-2 rounded-md border border-danger/30 px-3 py-2 text-sm text-danger hover:bg-danger-light disabled:opacity-50"
                                      >
                                        <RefreshCw className="size-4" />
                                        Reintentar {sweepDetails.radicados.filter((item) => item.estado === "ERROR").length} fallido(s)
                                      </button>
                                    )}
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
            <section className="space-y-4 border-t border-border pt-5">
              <div>
                <h2 className="font-semibold">Diagnóstico de integraciones</h2>
                <p className="mt-1 text-sm text-foreground-muted">Las comprobaciones no envían mensajes. El envío de prueba requiere destinatario y confirmación.</p>
              </div>
              <IntegrationSettingsPanel token={token} />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {([
                  ["RAMA", "Rama Judicial"],
                  ["WORKFLOW", "Workflows"],
                  ["SMTP", "SMTP"],
                  ["WHATSAPP", "WhatsApp · configuración"],
                ] as const).map(([integration, label]) => (
                  <div key={integration} className="flex items-center justify-between gap-3 border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p
                        role="status"
                        title={[
                          integrationResults[integration]?.causa,
                          integrationResults[integration]?.launcher_host,
                          integrationResults[integration]?.content_type,
                        ].filter(Boolean).join(" · ")}
                        className="break-all text-xs leading-4 text-foreground-muted"
                      >
                        {integrationResults[integration]
                          ? [
                            integrationResults[integration]?.estado,
                            integrationResults[integration]?.causa,
                            integrationResults[integration]?.launcher_host,
                            integrationResults[integration]?.content_type,
                          ].filter(Boolean).join(" · ")
                          : "Sin comprobar"}
                      </p>
                    </div>
                    <button type="button" onClick={() => void checkIntegration(integration)} disabled={checkingIntegration !== null} aria-label={`Comprobar ${label}`} title={`Comprobar ${label}`} className="grid size-9 shrink-0 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50">
                      <RefreshCw className={`size-4 ${checkingIntegration === integration ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>
              <form onSubmit={sendIntegrationTest} className="grid gap-3 border border-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1 text-xs text-foreground-muted">Canal
                  <select value={testChannel} onChange={(event) => setTestChannel(event.target.value as "EMAIL" | "WHATSAPP")} className="h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-foreground-muted">Destinatario explícito
                  <input required value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} type={testChannel === "EMAIL" ? "email" : "tel"} placeholder={testChannel === "EMAIL" ? "prueba@dominio.com" : "+573001234567"} className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <button type="submit" disabled={sendingTest || !confirmTestSend || !testRecipient.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white disabled:opacity-50">
                  <Send className="size-4" />{sendingTest ? "Enviando..." : "Enviar prueba real"}
                </button>
                <label className="flex items-start gap-2 text-xs text-foreground-muted sm:col-span-2">
                  <input type="checkbox" checked={confirmTestSend} onChange={(event) => setConfirmTestSend(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
                  Confirmo que autorizo un envío real al destinatario indicado. La acción quedará auditada.
                </label>
              </form>
            </section>
            <p className="flex items-start gap-2 text-xs text-foreground-muted">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              Las consultas, notificaciones y recordatorios se ejecutan como
              Vercel Workflows durables; la lista de ejecuciones se lee desde
              la base de datos.
            </p>
          </>
        )
      )}
    </section>
  );
}
