"use client";

import { apiRequest } from "@/lib/api";
import { iniciarWorkflowConsultaRadicado } from "@/lib/api";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";


type Client = {
  id: number;
  nombre_completo: string;
  email: string;
};

type Radicado = {
  id: number;
  numero: string;
  actuaciones: {
    id: number;
    actuacion: string;
    fecha_actuacion?: string | null;
  }[];
};

type Process = {
  id: number;
  nombre: string;
  descripcion?: string;
  admite_colaboradores: boolean;
  soy_responsable: boolean;
  puede_gestionar_equipo: boolean;
  responsable: { id: number; nombre_completo: string };
  colaboradores: { id: number; nombre_completo: string }[];
  abogados_disponibles: { id: number; nombre_completo: string }[];
  clientes: Client[];
  radicados: Radicado[];
  tareas: {
    id: number;
    titulo: string;
    estado: string;
  }[];
  solicitudes_documento: {
    id: number;
    titulo: string;
    instrucciones?: string | null;
    cliente_id: number;
    cliente: string;
    atendida_en?: string | null;
    created_at: string;
  }[];
  documentos: {
    id: number;
    nombre_archivo: string;
    cliente: string;
    mime_type: string;
    created_at: string;
  }[];
  notificaciones: {
    id: number;
    cliente: string;
    asunto: string;
    cuerpo: string;
    created_at: string;
  }[];
};

type SimpleRadicado = {
  id: number;
  numero: string;
};

async function requestProcessDetail(id: string, token: string) {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const [detail, clients, radicados] = await Promise.all([
    apiRequest(`/api/expedientes/procesos/${id}`, { headers: authHeaders }),
    apiRequest(`/api/expedientes/clientes`, { headers: authHeaders }),
    apiRequest(`/api/radicados`, { headers: authHeaders }),
  ]);
  const [processData, clientData, radicadoData] = await Promise.all([
    detail.json(), clients.json(), radicados.json(),
  ]);
  if (!detail.ok || !clients.ok || !radicados.ok) {
    throw new Error(processData.detail || clientData.detail || radicadoData.detail || "No fue posible cargar el proceso.");
  }
  return { processData, clientData, radicadoData };
}

export default function ProcesoDetallePage() {
  const { id } = useParams<{ id: string }>();

  const [process, setProcess] = useState<Process | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allRadicados, setAllRadicados] = useState<SimpleRadicado[]>([]);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [nuevoNumero, setNuevoNumero] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentInstructions, setDocumentInstructions] = useState("");
  const [documentClientId, setDocumentClientId] = useState("");
  const [notificationActuationId, setNotificationActuationId] = useState("");
  const [notificationClientId, setNotificationClientId] = useState("");
  const [notificationComments, setNotificationComments] = useState("");
  const [selectedColleagueId, setSelectedColleagueId] = useState("");

  const [clientQuery, setClientQuery] = useState("");
  const [radicadoQuery, setRadicadoQuery] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [showClientModal, setShowClientModal] = useState(false);
  const [showRadicadoModal, setShowRadicadoModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<number | null>(null);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    }),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await requestProcessDetail(id, localStorage.getItem("token") || "");
      setProcess(result.processData);
      setNombre(result.processData.nombre);
      setDescripcion(result.processData.descripcion || "");
      setAllClients(result.clientData);
      setAllRadicados(result.radicadoData);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al cargar el proceso."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    requestProcessDetail(id, localStorage.getItem("token") || "")
      .then((result) => {
        if (!active) return;
        setProcess(result.processData);
        setNombre(result.processData.nombre);
        setDescripcion(result.processData.descripcion || "");
        setAllClients(result.clientData);
        setAllRadicados(result.radicadoData);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Error al cargar el proceso.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => {
      setNotice("");
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function action(
    path: string,
    method = "POST",
    body?: unknown
  ) {
    try {
      setError("");
      setWorking(true);

      const response = await apiRequest(`${path}`, {
        method,
        headers: body
          ? {
              ...headers(),
              "Content-Type": "application/json",
            }
          : headers(),
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible completar la acción."
        );
      }

      if (typeof data.consulta_id === "number") {
        try {
          await iniciarWorkflowConsultaRadicado(
            localStorage.getItem("token") || "",
            {
              tipo: "AUTOMATICA_NUEVO",
              radicado_id: Number(data.id),
              consulta_id: data.consulta_id,
            },
          );
          data.mensaje = `${data.mensaje} Workflow de consulta iniciado.`;
        } catch {
          data.mensaje = `${data.mensaje} No fue posible iniciar el Workflow; informa a ADMIN.`;
        }
      }

      setNotice(data.mensaje || "Cambios guardados correctamente.");

      await load();

      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al guardar."
      );

      return false;
    } finally {
      setWorking(false);
    }
  }

  async function addColleague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedColleagueId) return;
    const saved = await action(
      `/api/expedientes/procesos/${id}/colaboradores`,
      "POST",
      { abogado_id: Number(selectedColleagueId) },
    );
    if (saved) setSelectedColleagueId("");
  }

  async function removeColleague(colleagueId: number) {
    await action(
      `/api/expedientes/procesos/${id}/colaboradores/${colleagueId}`,
      "DELETE",
    );
  }

  async function downloadDocument(documentId: number, filename: string) {
    setDownloadingDocumentId(documentId);
    setError("");
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${documentId}/archivo`, {
        headers: headers(),
      });
      if (!response.ok) {
        const result: { detail?: string } = await response.json().catch(() => ({}));
        throw new Error(result.detail || "No fue posible descargar el documento.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible descargar el documento.");
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  const availableClients = useMemo(() => {
    if (!process) return [];

    const normalized = clientQuery.trim().toLowerCase();

    return allClients
      .filter(
        (client) =>
          !process.clientes.some(
            (existing) => existing.id === client.id
          )
      )
      .filter((client) => {
        if (!normalized) return true;

        return `${client.nombre_completo} ${client.email}`
          .toLowerCase()
          .includes(normalized);
      });
  }, [allClients, process, clientQuery]);

  const availableRadicados = useMemo(() => {
    if (!process) return [];

    const normalized = radicadoQuery.trim();

    return allRadicados
      .filter(
        (radicado) =>
          !process.radicados.some(
            (existing) => existing.id === radicado.id
          )
      )
      .filter((radicado) =>
        normalized ? radicado.numero.includes(normalized) : true
      );
  }, [allRadicados, process, radicadoQuery]);

  const totalActuaciones = useMemo(
    () =>
      process?.radicados.reduce(
        (total, radicado) => total + radicado.actuaciones.length,
        0
      ) || 0,
    [process]
  );

  const availableActuations = useMemo(
    () => process?.radicados.flatMap((radicado) => radicado.actuaciones.map((actuacion) => ({
      id: actuacion.id,
      label: `${radicado.numero} · ${actuacion.actuacion || "Actuación judicial"}`,
    }))) ?? [],
    [process]
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[var(--foreground-muted)]">
          <Loader2 className="size-5 animate-spin" />
          Cargando proceso...
        </div>
      </div>
    );
  }

  if (!process) {
    return (
      <div className="space-y-4">
        <Link
          href="/gestion-procesos/abogado/procesos"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)]"
        >
          <ArrowLeft className="size-4" />
          Procesos
        </Link>

        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error || "No fue posible cargar el proceso."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* TOAST */}
      {notice && (
        <div className="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-emerald-500/20 bg-[var(--surface)] px-4 py-3 text-sm shadow-xl">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />

          <span className="text-[var(--foreground)]">
            {notice}
          </span>

          <button
            type="button"
            onClick={() => setNotice("")}
            className="ml-auto rounded-md p-1 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* NAVEGACIÓN */}
      <Link
        href="/gestion-procesos/abogado/procesos"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--foreground-muted)] transition hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="size-4" />
        Procesos
      </Link>

      {/* HEADER */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Ficha integral del proceso
          </p>

          <div className="mt-1 flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
              <BriefcaseBusiness className="size-5" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
                {process.nombre}
              </h1>

              <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                Proceso #{process.id}
              </p>
            </div>
          </div>
        </div>

        {/* RESUMEN */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs text-[var(--foreground-muted)]">
              Clientes
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {process.clientes.length}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs text-[var(--foreground-muted)]">
              Radicados
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {process.radicados.length}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs text-[var(--foreground-muted)]">
              Actuaciones
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {totalActuaciones}
            </p>
          </div>
        </div>
      </header>

      {process.admite_colaboradores && (
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <header className="flex items-start gap-3">
            <Users className="mt-0.5 size-5 text-[var(--primary)]" />
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">Equipo del proceso</h2>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                Responsable: {process.responsable.nombre_completo}. Los colaboradores internos acceden solo a este expediente.
              </p>
            </div>
          </header>
          {process.colaboradores.length ? (
            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {process.colaboradores.map((colleague) => (
                <li key={colleague.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="text-[var(--foreground)]">{colleague.nombre_completo}</span>
                  {process.puede_gestionar_equipo && (
                    <button type="button" disabled={working} onClick={() => void removeColleague(colleague.id)} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">Retirar acceso</button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">No hay colaboradores asignados.</p>
          )}
          {process.puede_gestionar_equipo && process.abogados_disponibles.length > 0 && (
            <form onSubmit={addColleague} className="flex flex-wrap gap-2">
              <select required value={selectedColleagueId} onChange={(event) => setSelectedColleagueId(event.target.value)} aria-label="Abogado colaborador" className="min-w-56 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                <option value="">Seleccionar abogado interno</option>
                {process.abogados_disponibles.map((colleague) => <option key={colleague.id} value={colleague.id}>{colleague.nombre_completo}</option>)}
              </select>
              <button type="submit" disabled={working || !selectedColleagueId} className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><UserPlus className="size-4" />Asignar colaborador</button>
            </form>
          )}
        </section>
      )}

      {/* ERROR */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="rounded-lg p-1 hover:bg-red-500/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* INFORMACIÓN GENERAL */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Información general
          </h2>

          <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
            Actualiza los datos básicos del proceso.
          </p>
        </div>

        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();

            void action(
              `/api/expedientes/procesos/${id}`,
              "PUT",
              {
                nombre,
                descripcion,
              }
            );
          }}
          className="grid gap-4 p-5 lg:grid-cols-[1fr_2fr_auto] lg:items-end"
        >
          <div>
            <label
              htmlFor="process-name"
              className="mb-1.5 block text-xs font-medium text-[var(--foreground-muted)]"
            >
              Nombre del proceso
            </label>

            <input
              id="process-name"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="process-description"
              className="mb-1.5 block text-xs font-medium text-[var(--foreground-muted)]"
            >
              Descripción
            </label>

            <input
              id="process-description"
              value={descripcion}
              onChange={(event) =>
                setDescripcion(event.target.value)
              }
              placeholder="Descripción del proceso"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
            />
          </div>

          <button
            disabled={working}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {working ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar
          </button>
        </form>
      </section>

      {/* CLIENTES + RADICADOS */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* CLIENTES */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Users className="size-4" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Clientes con acceso
                </h2>

                <p className="text-xs text-[var(--foreground-muted)]">
                  {process.clientes.length} cliente
                  {process.clientes.length === 1 ? "" : "s"} asignado
                  {process.clientes.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setClientQuery("");
                setShowClientModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
            >
              <UserPlus className="size-4" />
              Agregar
            </button>
          </div>

          <div className="p-4">
            {process.clientes.length > 0 ? (
              <div className="space-y-2">
                {process.clientes.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">
                        {client.nombre_completo}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-[var(--foreground-muted)]">
                        {client.email}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={working}
                      onClick={() =>
                        void action(
                          `/api/expedientes/procesos/${id}/clientes/${client.id}`,
                          "DELETE"
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" />
                      Retirar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-8 text-center">
                <Users className="mx-auto size-6 text-[var(--foreground-muted)]" />

                <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                  Sin clientes asignados
                </p>

                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  Agrega un cliente para darle acceso al proceso.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* RADICADOS */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <FileText className="size-4" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Radicados y actuaciones
                </h2>

                <p className="text-xs text-[var(--foreground-muted)]">
                  {process.radicados.length} radicado
                  {process.radicados.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setRadicadoQuery("");
                setNuevoNumero("");
                setShowRadicadoModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
            >
              <Plus className="size-4" />
              Agregar
            </button>
          </div>

          <div className="p-4">
            {process.radicados.length > 0 ? (
              <div className="space-y-2">
                {process.radicados.map((radicado) => (
                  <div
                    key={radicado.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-semibold text-[var(--foreground)]">
                          {radicado.numero}
                        </p>

                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          {radicado.actuaciones.length} actuación
                          {radicado.actuaciones.length === 1
                            ? ""
                            : "es"}{" "}
                          registrada
                          {radicado.actuaciones.length === 1
                            ? ""
                            : "s"}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void action(
                            `/api/expedientes/procesos/${id}/radicados/${radicado.id}`,
                            "DELETE"
                          )
                        }
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="size-3.5" />
                        Retirar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-8 text-center">
                <FileText className="mx-auto size-6 text-[var(--foreground-muted)]" />

                <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                  Sin radicados asociados
                </p>

                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  Crea un nuevo radicado o asocia uno existente.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* MÓDULOS SECUNDARIOS */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* TAREAS */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Tareas del proceso
              </h2>

              <p className="text-xs text-[var(--foreground-muted)]">
                {process.tareas.length} tarea
                {process.tareas.length === 1 ? "" : "s"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setTaskTitle("");
                setShowTaskModal(true);
              }}
              className="rounded-lg border border-[var(--border)] p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
              aria-label="Crear tarea"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <div className="p-4">
            {process.tareas.length > 0 ? (
              <div className="space-y-2">
                {process.tareas.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3"
                  >
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {task.titulo}
                    </p>

                    <span className="mt-2 inline-flex rounded-full bg-[var(--primary)]/10 px-2 py-1 text-[10px] font-medium text-[var(--primary)]">
                      {task.estado}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-[var(--foreground-muted)]">
                No hay tareas asociadas.
              </p>
            )}
          </div>
        </section>

        {/* DOCUMENTOS */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]"><FileText className="size-4" /></div>
              <div><h2 className="text-sm font-semibold text-[var(--foreground)]">Documentos</h2><p className="text-xs text-[var(--foreground-muted)]">{process.documentos.length} entregado{process.documentos.length === 1 ? "" : "s"}</p></div>
            </div>
            <button type="button" disabled={!process.clientes.length || working} onClick={() => { setDocumentTitle(""); setDocumentInstructions(""); setDocumentClientId(String(process.clientes[0]?.id ?? "")); setShowDocumentRequestModal(true); }} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"><Plus className="size-4" />Solicitar</button>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Solicitudes</h3>
              {process.solicitudes_documento.length ? <div className="space-y-2">{process.solicitudes_documento.map((request) => <div key={request.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-[var(--foreground)]">{request.titulo}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">{request.cliente}</p>{request.instrucciones && <p className="mt-2 text-xs text-[var(--foreground-muted)]">{request.instrucciones}</p>}</div><span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ${request.atendida_en ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{request.atendida_en ? "Entregada" : "Pendiente"}</span></div>
              </div>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">No hay solicitudes para este proceso.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Archivos entregados</h3>
              {process.documentos.length ? <div className="space-y-2">{process.documentos.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--foreground)]">{document.nombre_archivo}</p><p className="truncate text-xs text-[var(--foreground-muted)]">{document.cliente} · {new Date(document.created_at).toLocaleDateString("es-CO")}</p></div></div><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void downloadDocument(document.id, document.nombre_archivo)} aria-label={`Descargar ${document.nombre_archivo}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"><Download className="size-3.5" />{downloadingDocumentId === document.id ? "Descargando" : "Descargar"}</button></div>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Aún no se han entregado archivos.</p>}
            </div>
          </div>
        </section>

        {/* NOTIFICACIONES */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Bell className="size-4" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Notificaciones
                </h2>

                <p className="text-xs text-[var(--foreground-muted)]">
                  Avisos a clientes
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {availableActuations.length > 0 && process.clientes.length > 0 ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const sent = await action(
                    `/api/expedientes/procesos/${id}/actuaciones/${notificationActuationId}/notificar`,
                    "POST",
                    { cliente_id: Number(notificationClientId), comentarios: notificationComments.trim() },
                  );
                  if (sent) setNotificationComments("");
                }}
                className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3"
              >
                <label className="block text-xs font-medium text-[var(--foreground)]">
                  Actuación
                  <select required value={notificationActuationId} onChange={(event) => setNotificationActuationId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <option value="">Seleccionar actuación</option>
                    {availableActuations.map((actuacion) => <option key={actuacion.id} value={actuacion.id}>{actuacion.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-[var(--foreground)]">
                  Cliente
                  <select required value={notificationClientId} onChange={(event) => setNotificationClientId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <option value="">Seleccionar cliente</option>
                    {process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-[var(--foreground)]">
                  Comentarios
                  <textarea rows={2} maxLength={2000} value={notificationComments} onChange={(event) => setNotificationComments(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
                </label>
                <button type="submit" disabled={working || !notificationActuationId || !notificationClientId} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><Bell className="size-3.5" />Enviar aviso</button>
              </form>
            ) : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Asigna un cliente y registra una actuación para habilitar los avisos.</p>}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Enviadas recientemente</h3>
              {process.notificaciones.length ? <div className="space-y-2">{process.notificaciones.map((notification) => <article key={notification.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-[var(--foreground)]">{notification.asunto}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Para {notification.cliente} · {new Date(notification.created_at).toLocaleString("es-CO")}</p></div><CheckCircle2 className="size-4 shrink-0 text-emerald-600" /></div>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[var(--foreground-secondary)]">{notification.cuerpo}</p>
              </article>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Aún no se han enviado notificaciones.</p>}
            </div>
          </div>
        </section>
      </div>

      {showDocumentRequestModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="document-request-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form onSubmit={async (event) => { event.preventDefault(); const ok = await action(`/api/expedientes/procesos/${id}/solicitudes-documento`, "POST", { cliente_id: Number(documentClientId), titulo: documentTitle.trim(), instrucciones: documentInstructions.trim() || null }); if (ok) setShowDocumentRequestModal(false); }} className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="document-request-title" className="text-base font-semibold text-[var(--foreground)]">Solicitar documento</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">La solicitud se mostrará al cliente asignado a este proceso.</p></div><button type="button" aria-label="Cerrar" onClick={() => setShowDocumentRequestModal(false)} className="rounded-md p-1 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"><X className="size-5" /></button></div>
            <label className="block text-sm font-medium text-[var(--foreground)]">Cliente<select required value={documentClientId} onChange={(event) => setDocumentClientId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Selecciona un cliente</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>
            <label className="block text-sm font-medium text-[var(--foreground)]">Documento solicitado<input required maxLength={255} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
            <label className="block text-sm font-medium text-[var(--foreground)]">Instrucciones<textarea rows={3} value={documentInstructions} onChange={(event) => setDocumentInstructions(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
            <footer className="flex justify-end gap-2 border-t border-[var(--border)] pt-4"><button type="button" disabled={working} onClick={() => setShowDocumentRequestModal(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)]">Cancelar</button><button type="submit" disabled={working || !documentClientId || !documentTitle.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working && <Loader2 className="size-4 animate-spin" />}Enviar solicitud</button></footer>
          </form>
        </div>
      )}

      {/* MODAL CLIENTE */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Agregar cliente
                </h2>

                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Concede acceso de cliente a este proceso.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowClientModal(false)}
                className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-muted)]" />

                <input
                  value={clientQuery}
                  onChange={(event) =>
                    setClientQuery(event.target.value)
                  }
                  placeholder="Buscar por nombre o correo..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {availableClients.length > 0 ? (
                  availableClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      disabled={working}
                      onClick={async () => {
                        const ok = await action(
                          `/api/expedientes/procesos/${id}/clientes/${client.id}`
                        );

                        if (ok) {
                          setShowClientModal(false);
                          setClientQuery("");
                        }
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-left transition hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                          {client.nombre_completo}
                        </span>

                        <span className="mt-0.5 block truncate text-xs text-[var(--foreground-muted)]">
                          {client.email}
                        </span>
                      </span>

                      <UserPlus className="ml-3 size-4 shrink-0 text-[var(--primary)]" />
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-center text-sm text-[var(--foreground-muted)]">
                    No hay clientes disponibles.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RADICADO */}
      {showRadicadoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Agregar radicado
                </h2>

                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Crea un radicado nuevo o asocia uno existente.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRadicadoModal(false)}
                className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* CREAR */}
              <form
                onSubmit={async (event) => {
                  event.preventDefault();

                  const ok = await action(
                    `/api/expedientes/procesos/${id}/radicados`,
                    "POST",
                    {
                      numero: nuevoNumero,
                    }
                  );

                  if (ok) {
                    setNuevoNumero("");
                    setShowRadicadoModal(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Crear y asociar
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                    Ingresa un número de radicado de 23 dígitos.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    required
                    pattern="[0-9]{23}"
                    maxLength={23}
                    value={nuevoNumero}
                    onChange={(event) =>
                      setNuevoNumero(
                        event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 23)
                      )
                    }
                    placeholder="Ej. 05001310300120260000001"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 font-mono text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
                  />

                  <button
                    disabled={working || nuevoNumero.length !== 23}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    Crear
                  </button>
                </div>
              </form>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-xs text-[var(--foreground-muted)]">
                  O
                </span>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              {/* EXISTENTE */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Asociar existente
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                    Selecciona un radicado que ya exista en el despacho.
                  </p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-muted)]" />

                  <input
                    value={radicadoQuery}
                    onChange={(event) =>
                      setRadicadoQuery(event.target.value)
                    }
                    placeholder="Buscar por número..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] py-2.5 pl-9 pr-3 font-mono text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {availableRadicados.length > 0 ? (
                    availableRadicados.map((radicado) => (
                      <button
                        key={radicado.id}
                        type="button"
                        disabled={working}
                        onClick={async () => {
                          const ok = await action(
                            `/api/expedientes/procesos/${id}/radicados/${radicado.id}`
                          );

                          if (ok) {
                            setRadicadoQuery("");
                            setShowRadicadoModal(false);
                          }
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-left hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5"
                      >
                        <span className="font-mono text-sm text-[var(--foreground)]">
                          {radicado.numero}
                        </span>

                        <Link2 className="size-4 text-[var(--primary)]" />
                      </button>
                    ))
                  ) : (
                    <p className="py-4 text-center text-xs text-[var(--foreground-muted)]">
                      No hay radicados disponibles.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAREA */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Nueva tarea
                </h2>

                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Crea una tarea asociada a este proceso.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form
              onSubmit={async (event) => {
                event.preventDefault();

                const ok = await action(
                  "/api/tareas",
                  "POST",
                  {
                    titulo: taskTitle,
                    proceso_id: Number(id),
                    prioridad: "MEDIA",
                  }
                );

                if (ok) {
                  setTaskTitle("");
                  setShowTaskModal(false);
                }
              }}
            >
              <div className="p-5">
                <label
                  htmlFor="task-title"
                  className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
                >
                  Título de la tarea
                </label>

                <input
                  id="task-title"
                  required
                  autoFocus
                  value={taskTitle}
                  onChange={(event) =>
                    setTaskTitle(event.target.value)
                  }
                  placeholder="Ej. Revisar actuación judicial"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  disabled={working}
                  className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface)]"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={working || !taskTitle.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {working && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Crear tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}