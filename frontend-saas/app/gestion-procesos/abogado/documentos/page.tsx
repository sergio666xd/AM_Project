"use client";

import { apiRequest } from "@/lib/api";
import Image from "next/image";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";


type Request = {
  id: number;
  proceso_id: number;
  proceso: string;
  cliente: string;
  titulo: string;
  instrucciones?: string;
  atendida_en?: string;
};

type Document = {
  id: number;
  proceso_id: number;
  solicitud_id: number;
  proceso: string;
  cliente: string;
  nombre_archivo: string;
  mime_type: string;
  created_at: string;
  estado_revision?: string;
  comentario_revision?: string | null;
};

type Process = {
  id: number;
  nombre: string;
};

type Client = {
  id: number;
  nombre_completo: string;
};

export default function DocumentosPage() {
  const [data, setData] = useState<{
    solicitudes: Request[];
    documentos: Document[];
  }>({
    solicitudes: [],
    documentos: [],
  });

  const [processes, setProcesses] = useState<Process[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [query, setQuery] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODAS");
  const [filtroEstadoArchivo, setFiltroEstadoArchivo] = useState("TODOS");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [mostrarModal, setMostrarModal] = useState(false);
  const [documentoActivo, setDocumentoActivo] = useState<Document | null>(null);
  const [archivoPreview, setArchivoPreview] = useState("");
  const [estadoRevision, setEstadoRevision] = useState("EN_REVISION");
  const [comentarioRevision, setComentarioRevision] = useState("");
  const [guardandoRevision, setGuardandoRevision] = useState(false);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${
        typeof window !== "undefined"
          ? localStorage.getItem("token") || ""
          : ""
      }`,
    }),
    [],
  );

  const load = useCallback(async () => {
    try {
      setActualizando(true);
      setError("");

      const [documentsResponse, processesResponse, clientsResponse] =
        await Promise.all([
          apiRequest(`/api/expedientes/documentos`, {
            headers: headers(),
          }),
          apiRequest(`/api/expedientes/procesos`, {
            headers: headers(),
          }),
          apiRequest(`/api/expedientes/clientes`, {
            headers: headers(),
          }),
        ]);

      const [
        documentsData,
        processesData,
        clientsData,
      ] = await Promise.all([
        documentsResponse.json(),
        processesResponse.json(),
        clientsResponse.json(),
      ]);

      if (!documentsResponse.ok) {
        throw new Error(
          documentsData.detail ||
            "No fue posible cargar los documentos.",
        );
      }

      if (!processesResponse.ok) {
        throw new Error(
          processesData.detail ||
            "No fue posible cargar los procesos.",
        );
      }

      if (!clientsResponse.ok) {
        throw new Error(
          clientsData.detail ||
            "No fue posible cargar los clientes.",
        );
      }

      setData({
        solicitudes: Array.isArray(documentsData.solicitudes)
          ? documentsData.solicitudes
          : [],
        documentos: Array.isArray(documentsData.documentos)
          ? documentsData.documentos
          : [],
      });

      setProcesses(
        Array.isArray(processesData) ? processesData : [],
      );

      setClients(
        Array.isArray(clientsData) ? clientsData : [],
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al cargar la información.",
      );
    } finally {
      setLoading(false);
      setActualizando(false);
    }
  }, [headers]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (loading || !processes.length) return;
    const timer = window.setTimeout(() => {
      const requestedProcess = Number(new URLSearchParams(window.location.search).get("proceso"));
      if (Number.isInteger(requestedProcess) && processes.some((process) => process.id === requestedProcess)) setSelectedProcessId(requestedProcess);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, processes]);

  useEffect(() => {
    if (selectedProcessId === null || loading || !window.location.hash) return;
    const timer = window.setTimeout(() => document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => window.clearTimeout(timer);
  }, [selectedProcessId, loading, data]);

  useEffect(() => () => {
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
  }, [archivoPreview]);

  const abrirDocumento = async (documento: Document) => {
    setError("");
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${documento.id}/archivo`, { headers: headers() });
      if (!response.ok) throw new Error("No fue posible abrir el documento.");
      const blob = await response.blob();
      setArchivoPreview((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob); });
      setDocumentoActivo(documento);
      setEstadoRevision(documento.estado_revision === "RECIBIDO" ? "EN_REVISION" : documento.estado_revision || "EN_REVISION");
      setComentarioRevision(documento.comentario_revision || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible abrir el documento.");
    }
  };

  const guardarRevision = async () => {
    if (!documentoActivo) return;
    setGuardandoRevision(true);
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${documentoActivo.id}/revision`, {
        method: "PATCH", headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ estado_revision: estadoRevision, comentario_revision: comentarioRevision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "No fue posible guardar la revisión.");
      setNotice("Revisión documental guardada.");
      setDocumentoActivo(null);
      setArchivoPreview("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar la revisión.");
    } finally { setGuardandoRevision(false); }
  };

  const solicitudesFiltradas = useMemo(() => {
    const text = query.toLowerCase().trim();

    return data.solicitudes.filter((item) => {
      if (selectedProcessId !== null && item.proceso_id !== selectedProcessId) return false;
      const matchesSearch =
        !text ||
        `${item.titulo} ${item.proceso} ${item.cliente} ${
          item.instrucciones || ""
        }`
          .toLowerCase()
          .includes(text);

      const matchesStatus =
        filtroEstado === "TODAS" ||
        (filtroEstado === "PENDIENTES" && !item.atendida_en) ||
        (filtroEstado === "ENTREGADAS" && !!item.atendida_en);

      return matchesSearch && matchesStatus;
    });
  }, [data.solicitudes, query, filtroEstado, selectedProcessId]);

  const documentosFiltrados = useMemo(() => {
    const text = query.toLowerCase().trim();

    return data.documentos.filter((item) => {
      if (selectedProcessId !== null && item.proceso_id !== selectedProcessId) return false;
      if (filtroEstadoArchivo !== "TODOS" && (item.estado_revision || "RECIBIDO") !== filtroEstadoArchivo) return false;
      return (
        !text ||
        `${item.nombre_archivo} ${item.proceso} ${item.cliente} ${item.mime_type}`
          .toLowerCase()
          .includes(text)
      );
    });
  }, [data.documentos, query, filtroEstadoArchivo, selectedProcessId]);

  const carpetasFiltradas = useMemo(() => {
    const text = query.toLowerCase().trim();
    if (!text) return processes;
    return processes.filter((process) => process.nombre.toLowerCase().includes(text)
      || data.solicitudes.some((item) => item.proceso_id === process.id && `${item.titulo} ${item.cliente} ${item.instrucciones || ""}`.toLowerCase().includes(text))
      || data.documentos.some((item) => item.proceso_id === process.id && `${item.nombre_archivo} ${item.cliente} ${item.mime_type}`.toLowerCase().includes(text)));
  }, [processes, data.solicitudes, data.documentos, query]);

  const pendientes = data.solicitudes.filter(
    (item) => !item.atendida_en,
  ).length;

  const entregadas = data.solicitudes.filter(
    (item) => !!item.atendida_en,
  ).length;

  if (loading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        style={{ color: "var(--foreground-muted)" }}
      >
        Cargando documentos...
      </div>
    );
  }

  return (
    <div
      className="space-y-5"
      style={{ color: "var(--foreground)" }}
    >
      {/* ENCABEZADO */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText
              size={24}
              style={{ color: "var(--primary)" }}
            />
            <h1 className="text-2xl font-semibold">
              Documentos
            </h1>
          </div>

          <p
            className="mt-1 text-sm"
            style={{ color: "var(--foreground-muted)" }}
          >
            Solicita documentos a tus clientes y consulta los
            archivos entregados.
          </p>
        </div>

        <button
          onClick={() => setMostrarModal(true)}
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition"
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <Plus size={17} />
          Solicitar documento
        </button>
      </div>

      {/* BARRA DE HERRAMIENTAS */}
      <div
        className="rounded-xl border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{
                color: "var(--foreground-muted)",
              }}
            />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Buscar proceso, cliente o documento..."
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <select
            value={filtroEstado}
            onChange={(event) =>
              setFiltroEstado(event.target.value)
            }
            className="rounded-lg border px-3 py-2.5 text-sm outline-none"
            style={{
              background: "var(--surface-muted)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          >
            <option value="TODAS">Todas las solicitudes</option>
            <option value="PENDIENTES">Pendientes</option>
            <option value="ENTREGADAS">Entregadas</option>
          </select>

          <select value={filtroEstadoArchivo} onChange={(event) => setFiltroEstadoArchivo(event.target.value)} aria-label="Filtrar archivos por estado" className="rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option value="TODOS">Todos los estados de archivo</option>
            <option value="RECIBIDO">Recibidos</option>
            <option value="EN_REVISION">En revisión</option>
            <option value="APROBADO">Aprobados</option>
            <option value="REQUIERE_CORRECCION">Requieren corrección</option>
            <option value="RECHAZADO">Rechazados</option>
          </select>

          <button
            onClick={() => void load()}
            disabled={actualizando}
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition disabled:opacity-50"
            style={{
              color: "var(--foreground-secondary)",
            }}
          >
            <RefreshCw
              size={16}
              className={actualizando ? "animate-spin" : ""}
            />
            Actualizar
          </button>
        </div>
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumenCard
          label="Solicitudes"
          value={data.solicitudes.length}
        />

        <ResumenCard
          label="Pendientes"
          value={pendientes}
          danger={pendientes > 0}
        />

        <ResumenCard
          label="Entregadas"
          value={entregadas}
          success
        />

        <ResumenCard
          label="Archivos"
          value={data.documentos.length}
        />
      </div>

      {/* MENSAJES */}
      {error && (
        <div
          className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
          style={{
            background: "var(--danger-light)",
            borderColor: "var(--danger)",
            color: "var(--danger)",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>

          <button
            onClick={() => setError("")}
            aria-label="Cerrar error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {notice && (
        <div
          className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
          style={{
            background: "var(--success-light)",
            borderColor: "var(--success)",
            color: "var(--success)",
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
          </div>

          <button
            onClick={() => setNotice("")}
            aria-label="Cerrar notificación"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {selectedProcessId === null ? (
        <section className="space-y-3">
          <div><h2 className="text-lg font-semibold">Carpetas por proceso</h2><p className="text-sm" style={{ color: "var(--foreground-muted)" }}>Abre una carpeta para ver solicitudes y archivos; los filtros se aplican dentro de cada proceso.</p></div>
          {carpetasFiltradas.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{carpetasFiltradas.map((process) => {
            const requests = data.solicitudes.filter((item) => item.proceso_id === process.id);
            const documents = data.documentos.filter((item) => item.proceso_id === process.id);
            return <button type="button" key={process.id} onClick={() => setSelectedProcessId(process.id)} className="rounded-xl border p-4 text-left transition hover:border-primary hover:bg-surface-hover" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-lg" style={{ background: "var(--primary-light)", color: "var(--primary)" }}><FileText size={21}/></div><span className="min-w-0"><span className="block truncate font-semibold">{process.nombre}</span><span className="text-xs" style={{ color: "var(--foreground-muted)" }}>Abrir carpeta</span></span></div><div className="mt-4 flex gap-4 border-t pt-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground-muted)" }}><span>{requests.filter((item) => !item.atendida_en).length} solicitudes pendientes</span><span>{documents.length} archivos</span></div></button>;
          })}</div> : <EmptyState icon={<FileText size={30}/>} title="No hay carpetas de procesos" description="Los documentos aparecerán organizados aquí cuando existan procesos asignados."/>}
        </section>
      ) : <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><div><button type="button" onClick={() => setSelectedProcessId(null)} className="text-xs font-medium text-primary hover:underline">← Todas las carpetas</button><h2 className="mt-1 text-lg font-semibold">{processes.find((process) => process.id === selectedProcessId)?.nombre || "Proceso"}</h2></div><span className="text-xs" style={{ color: "var(--foreground-muted)" }}>{solicitudesFiltradas.length} solicitudes · {documentosFiltrados.length} archivos visibles</span></div>
      {/* SOLICITUDES */}
      <section
        className="overflow-hidden rounded-xl border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="font-semibold">
              Solicitudes documentales
            </h2>

            <p
              className="mt-1 text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              Documentos solicitados a tus clientes.
            </p>
          </div>

          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: "var(--surface-muted)",
              color: "var(--foreground-secondary)",
            }}
          >
            {solicitudesFiltradas.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-muted)",
                }}
              >
                <th className="p-4">Documento</th>
                <th className="p-4">Proceso</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Estado</th>
              </tr>
            </thead>

            <tbody>
              {solicitudesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<FileText size={30} />}
                      title="No hay solicitudes"
                      description={
                        query || filtroEstado !== "TODAS"
                          ? "No hay solicitudes que coincidan con los filtros."
                          : "Todavía no has solicitado documentos a tus clientes."
                      }
                    />
                  </td>
                </tr>
              ) : (
                solicitudesFiltradas.map((item) => (
                  <tr id={`solicitud-${item.id}`}
                    key={item.id}
                    className="border-b transition hover:bg-surface-hover"
                    style={{
                      borderColor: "var(--border)",
                    }}
                  >
                    <td className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: item.atendida_en
                              ? "var(--success-light)"
                              : "var(--warning-light)",
                            color: item.atendida_en
                              ? "var(--success)"
                              : "var(--warning)",
                          }}
                        >
                          <FileText size={17} />
                        </div>

                        <div className="min-w-0">
                          <p className="font-medium">
                            {item.titulo}
                          </p>

                          <p
                            className="mt-1 max-w-md text-xs"
                            style={{
                              color: "var(--foreground-muted)",
                            }}
                          >
                            {item.instrucciones ||
                              "Sin instrucciones adicionales."}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span
                        className="text-sm"
                        style={{
                          color: "var(--foreground-secondary)",
                        }}
                      >
                        {item.proceso}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="text-sm">
                        {item.cliente}
                      </span>
                    </td>

                    <td className="p-4">
                      {item.atendida_en ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: "var(--success-light)",
                            color: "var(--success)",
                          }}
                        >
                          <CheckCircle2 size={13} />
                          Entregada
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: "var(--warning-light)",
                            color: "var(--warning)",
                          }}
                        >
                          <Upload size={13} />
                          Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ARCHIVOS */}
      <section
        className="overflow-hidden rounded-xl border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="font-semibold">Archivos entregados</h2>

            <p
              className="mt-1 text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              Documentos enviados por tus clientes.
            </p>
          </div>

          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: "var(--surface-muted)",
              color: "var(--foreground-secondary)",
            }}
          >
            {documentosFiltrados.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-muted)",
                }}
              >
                <th className="p-4">Archivo</th>
                <th className="p-4">Proceso</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Revisión</th>
              </tr>
            </thead>

            <tbody>
              {documentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<FileText size={30} />}
                      title="No hay archivos entregados"
                      description={
                        query
                          ? "No hay archivos que coincidan con la búsqueda."
                          : "Los documentos enviados por los clientes aparecerán aquí."
                      }
                    />
                  </td>
                </tr>
              ) : (
                documentosFiltrados.map((item) => (
                  <tr id={`documento-${item.id}`}
                    key={item.id}
                    className="border-b transition hover:bg-surface-hover"
                    style={{
                      borderColor: "var(--border)",
                    }}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: "var(--primary-light)",
                            color: "var(--primary)",
                          }}
                        >
                          <FileText size={17} />
                        </div>

                        <span className="font-medium">
                          {item.nombre_archivo}
                        </span>
                      </div>
                    </td>

                    <td className="p-4">
                      {item.proceso}
                    </td>

                    <td className="p-4">
                      {item.cliente}
                    </td>

                    <td className="p-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs"
                        style={{
                          background: "var(--surface-muted)",
                          color: "var(--foreground-secondary)",
                        }}
                      >
                        {item.mime_type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className="text-sm"
                        style={{
                          color: "var(--foreground-muted)",
                        }}
                      >
                        {formatearFecha(item.created_at)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-start gap-2">
                        <span className="text-xs text-foreground-muted">{(item.estado_revision || "RECIBIDO").replaceAll("_", " ")}</span>
                        <button type="button" onClick={() => void abrirDocumento(item)} className="rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
                          Vista previa y revisar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>}

      {documentoActivo && archivoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="documento-preview-titulo" onMouseDown={(event) => { if (event.target === event.currentTarget) { setDocumentoActivo(null); setArchivoPreview(""); } }}>
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <header className="flex items-center justify-between gap-4 border-b p-4" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0"><h2 id="documento-preview-titulo" className="truncate font-semibold">{documentoActivo.nombre_archivo}</h2><p className="text-xs text-foreground-muted">{documentoActivo.proceso} · {documentoActivo.cliente}</p></div>
              <button type="button" onClick={() => { setDocumentoActivo(null); setArchivoPreview(""); }} aria-label="Cerrar vista" className="rounded-lg p-2"><X size={18} /></button>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-[45vh] bg-black/5 p-2">{documentoActivo.mime_type.startsWith("image/") ? <Image src={archivoPreview} alt={documentoActivo.nombre_archivo} width={1600} height={1200} unoptimized className="mx-auto max-h-[72vh] w-auto max-w-full object-contain" /> : documentoActivo.mime_type === "application/pdf" ? <iframe src={archivoPreview} title={documentoActivo.nombre_archivo} className="h-[68vh] w-full rounded-lg bg-white" /> : <div className="flex h-full min-h-64 items-center justify-center text-sm text-foreground-muted">Vista previa no disponible. Descarga el archivo para consultarlo.</div>}</div>
              <aside className="space-y-4 border-t p-4 lg:border-l lg:border-t-0" style={{ borderColor: "var(--border)" }}>
                <label className="block text-sm font-medium">Estado de revisión<select value={estadoRevision} onChange={(event) => setEstadoRevision(event.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}><option value="EN_REVISION">En revisión</option><option value="APROBADO">Aprobado</option><option value="REQUIERE_CORRECCION">Requiere corrección</option><option value="RECHAZADO">Rechazado</option></select></label>
                <label className="block text-sm font-medium">Comentario<textarea value={comentarioRevision} onChange={(event) => setComentarioRevision(event.target.value)} rows={5} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void guardarRevision()} disabled={guardandoRevision} className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{guardandoRevision ? "Guardando…" : "Guardar revisión"}</button><a href={archivoPreview} download={documentoActivo.nombre_archivo} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>Descargar</a></div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {mostrarModal && (
        <SolicitudDocumentoModal
          processes={processes}
          clients={clients}
          onClose={() => setMostrarModal(false)}
          onCreated={() => {
            setMostrarModal(false);
            setNotice("Solicitud de documento enviada al cliente.");
            void load();
          }}
          onError={(message) => setError(message)}
        />
      )}
    </div>
  );
}

function ResumenCard({
  label,
  value,
  danger,
  success,
}: {
  label: string;
  value: number;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <p
        className="text-xs"
        style={{
          color: "var(--foreground-muted)",
        }}
      >
        {label}
      </p>

      <p
        className="mt-1 text-2xl font-semibold"
        style={{
          color: danger
            ? "var(--danger)"
            : success
              ? "var(--success)"
              : "var(--foreground)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="py-14 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
        style={{
          background: "var(--surface-muted)",
          color: "var(--foreground-muted)",
        }}
      >
        {icon}
      </div>

      <p className="mt-3 text-sm font-medium">{title}</p>

      <p
        className="mt-1 text-xs"
        style={{
          color: "var(--foreground-muted)",
        }}
      >
        {description}
      </p>
    </div>
  );
}

function SolicitudDocumentoModal({
  processes,
  clients,
  onClose,
  onCreated,
  onError,
}: {
  processes: Process[];
  clients: Client[];
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState("");

  const selectedProcess = processes.find(
    (process) =>
      String(process.id) === selectedProcessId,
  );

  /*
   * El endpoint de solicitudes necesita:
   * POST /api/expedientes/procesos/{proceso_id}/solicitudes-documento
   *
   * Por eso primero se selecciona el proceso.
   */

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const clienteId = String(
      form.get("cliente_id") || "",
    );

    const titulo = String(
      form.get("titulo") || "",
    ).trim();

    const instrucciones = String(
      form.get("instrucciones") || "",
    ).trim();
    const fechaLimiteLocal = String(form.get("fecha_limite") || "");

    if (!selectedProcessId) {
      onError("Debes seleccionar un proceso.");
      return;
    }

    if (!clienteId) {
      onError("Debes seleccionar un cliente.");
      return;
    }

    if (!titulo) {
      onError("El título de la solicitud es obligatorio.");
      return;
    }

    try {
      setSaving(true);

      const response = await apiRequest(
        `/api/expedientes/procesos/${selectedProcessId}/solicitudes-documento`,
        {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cliente_id: Number(clienteId),
            titulo,
            instrucciones: instrucciones || null,
            fecha_limite: fechaLimiteLocal ? new Date(fechaLimiteLocal).toISOString() : null,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "No se pudo enviar la solicitud de documento.",
        );
      }

      onCreated();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo enviar la solicitud.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-5 sm:p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: "var(--primary-light)",
                  color: "var(--primary)",
                }}
              >
                <FileText size={18} />
              </div>

              <h2 className="text-lg font-semibold">
                Solicitar documento
              </h2>
            </div>

            <p
              className="mt-2 text-xs"
              style={{
                color: "var(--foreground-muted)",
              }}
            >
              Envía una solicitud de documento a un cliente
              asociada a un proceso.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2"
            style={{
              color: "var(--foreground-muted)",
            }}
            aria-label="Cerrar"
          >
            <X size={19} />
          </button>
        </div>

        {/* FORMULARIO */}
        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Proceso
            </label>

            <select
              name="proceso_id"
              required
              value={selectedProcessId}
              onChange={(event) =>
                setSelectedProcessId(event.target.value)
              }
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <option value="">Selecciona un proceso</option>

              {processes.map((process) => (
                <option
                  key={process.id}
                  value={process.id}
                >
                  {process.nombre}
                </option>
              ))}
            </select>

            {selectedProcess && (
              <p
                className="mt-1.5 text-xs"
                style={{
                  color: "var(--foreground-muted)",
                }}
              >
                La solicitud quedará asociada a{" "}
                <strong>{selectedProcess.nombre}</strong>.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Fecha límite <span className="font-normal text-foreground-muted">(opcional)</span></label>
            <input name="fecha_limite" type="datetime-local" className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Cliente
            </label>

            <select
              name="cliente_id"
              required
              defaultValue=""
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <option value="">Selecciona un cliente</option>

              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.nombre_completo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Documento solicitado
            </label>

            <input
              name="titulo"
              required
              autoFocus
              placeholder="Ej. Copia de la cédula de ciudadanía"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Instrucciones
              <span
                className="ml-1 font-normal"
                style={{
                  color: "var(--foreground-muted)",
                }}
              >
                (opcional)
              </span>
            </label>

            <textarea
              name="instrucciones"
              rows={4}
              placeholder="Indica al cliente qué debe enviar, formato, páginas, condiciones, etc."
              className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div
            className="rounded-lg border p-3"
            style={{
              background: "var(--primary-light)",
              borderColor: "var(--border)",
            }}
          >
            <p
              className="text-xs leading-5"
              style={{
                color: "var(--foreground-secondary)",
              }}
            >
              El cliente recibirá la solicitud y podrá cargar
              el archivo correspondiente desde su plataforma.
            </p>
          </div>

          {/* ACTIONS */}
          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{
              borderColor: "var(--border)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border px-4 py-2.5 text-sm font-medium"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground-secondary)",
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {saving && (
                <RefreshCw
                  size={15}
                  className="animate-spin"
                />
              )}

              {saving
                ? "Enviando..."
                : "Enviar solicitud"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${
      typeof window !== "undefined"
        ? localStorage.getItem("token") || ""
        : ""
    }`,
  };
}

function formatearFecha(fecha?: string) {
  if (!fecha) return "—";

  const date = new Date(fecha);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
