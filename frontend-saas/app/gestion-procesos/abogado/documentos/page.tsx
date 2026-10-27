"use client";

import { apiRequest } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type StatusTone } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { formatDate, formatDateTime, reviewStatusLabel, toDate } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Plus,
  Trash2,
  X,
} from "lucide-react";


type Request = {
  id: number;
  proceso_id: number;
  proceso: string;
  cliente: string;
  titulo: string;
  instrucciones?: string;
  estado: string;
  documentos_requeridos: { id: string; nombre: string; estado: string; documento?: { id: number; nombre_archivo: string; estado_revision: string; comentario_revision?: string | null } | null }[];
  atendida_en?: string;
};

type Document = {
  id: number;
  proceso_id: number;
  solicitud_id: number | null;
  solicitud_item_id?: string | null;
  contrato_id?: number | null;
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

const REQUEST_STATUS: Record<string, string> = {
  FALTAN_DOCUMENTOS: "Faltan documentos",
  DOCUMENTOS_SUMINISTRADOS: "Documentos entregados",
  EN_REVISION: "En revisión",
  RECHAZADO: "Rechazada",
  APROBADO: "Aprobada",
  VENCIDO: "Vencida",
};

function requestStatusLabel(status: string) {
  return REQUEST_STATUS[status] ?? status.replaceAll("_", " ");
}

function requestTone(status: string): StatusTone {
  if (status === "APROBADO") return "completed";
  if (status === "RECHAZADO" || status === "VENCIDO") return "risk";
  if (status === "EN_REVISION" || status === "DOCUMENTOS_SUMINISTRADOS") return "review";
  return "pending";
}

function fileKind(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Imagen";
  if (mime.includes("word")) return "Word";
  if (mime.includes("sheet") || mime.includes("excel")) return "Excel";
  return mime.split("/").pop()?.toUpperCase() || "Archivo";
}

function requestedDocumentName(document: Document, requests: Request[]) {
  if (!document.solicitud_id) return null;
  const request = requests.find((item) => item.id === document.solicitud_id);
  if (!request) return null;
  return request.documentos_requeridos.find((item) => item.id === document.solicitud_item_id)?.nombre
    || (request.documentos_requeridos.length === 1 ? request.documentos_requeridos[0].nombre : request.titulo);
}

export default function DocumentosPage() {
  const { user } = useSession();
  const [data, setData] = useState<{
    solicitudes: Request[];
    documentos: Document[];
  }>({
    solicitudes: [],
    documentos: [],
  });

  const [processes, setProcesses] = useState<Process[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [filtroEstado, setFiltroEstado] = useState("TODAS");
  const [fileFilter, setFileFilter] = useState<string | null>("POR_REVISAR");
  const [tab, setTab] = useState<"archivos" | "solicitudes" | "contratos">("archivos");
  const [requestDetailId, setRequestDetailId] = useState<number | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [, setActualizando] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [mostrarModal, setMostrarModal] = useState(false);
  const [documentoActivo, setDocumentoActivo] = useState<Document | null>(null);
  const [archivoPreview, setArchivoPreview] = useState("");
  const [documentAction, setDocumentAction] = useState<{ id: number; type: "view" | "download" } | null>(null);
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

  useEffect(() => () => {
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
  }, [archivoPreview]);

  const abrirDocumento = async (documento: Document) => {
    if (documentAction) return;
    setDocumentAction({ id: documento.id, type: "view" });
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
    } finally {
      setDocumentAction(null);
    }
  };

  const descargarDocumento = async (documento: Document) => {
    if (documentAction) return;
    setDocumentAction({ id: documento.id, type: "download" });
    setError("");
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${documento.id}/archivo`, { headers: headers() });
      if (!response.ok) throw new Error("No fue posible descargar el documento.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = documento.nombre_archivo;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible descargar el documento.");
    } finally {
      setDocumentAction(null);
    }
  };

  const guardarRevision = async () => {
    if (!documentoActivo || documentoActivo.contrato_id) return;
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

  const eliminarSolicitud = async () => {
    if (!requestToDelete) return;
    const response = await apiRequest(`/api/expedientes/solicitudes-documento/${requestToDelete.id}`, {
      method: "DELETE", headers: headers(),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.detail || "No fue posible eliminar la solicitud.");
      throw new Error(result.detail || "No fue posible eliminar la solicitud.");
    }
    if (requestDetailId === requestToDelete.id) setRequestDetailId(null);
    setNotice(result.archivos_conservados ? "Solicitud eliminada. Los archivos ya cargados se conservan en el proceso." : "Solicitud eliminada.");
    await load();
  };

  useEffect(() => {
    if (loading || !window.location.hash) return;
    const target = decodeURIComponent(window.location.hash.slice(1));
    const timer = window.setTimeout(() => {
      const [kind, rawId] = target.split("-");
      const id = Number(rawId);
      if (kind === "solicitud" && data.solicitudes.some((item) => item.id === id)) {
        setTab("solicitudes");
        setRequestDetailId(id);
      } else if (kind === "documento") {
        const document = data.documentos.find((item) => item.id === id);
        if (document) {
          setTab(document.contrato_id ? "contratos" : "archivos");
          setFileFilter(null);
          void abrirDocumento(document);
        }
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }, 0);
    return () => window.clearTimeout(timer);
    // Solo al terminar la primera carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const reviewState = (item: Document) => item.estado_revision || "RECIBIDO";
  const toReview = (item: Document) => ["RECIBIDO", "EN_REVISION"].includes(reviewState(item));
  const inProcess = <T extends { proceso_id: number }>(item: T) => selectedProcessId === null || item.proceso_id === selectedProcessId;
  const files = data.documentos.filter((item) => !item.contrato_id && inProcess(item));
  const visibleFiles = files.filter((item) =>
    !fileFilter ||
    (fileFilter === "POR_REVISAR" && toReview(item)) ||
    reviewState(item) === fileFilter,
  );
  const requests = data.solicitudes.filter(inProcess);
  const pendingRequest = (item: Request) => ["FALTAN_DOCUMENTOS", "RECHAZADO"].includes(item.estado);
  const visibleRequests = requests.filter((item) =>
    filtroEstado === "TODAS" ||
    (filtroEstado === "PENDIENTES" && pendingRequest(item)) ||
    (filtroEstado === "ENTREGADAS" && !pendingRequest(item)),
  );
  const contracts = data.documentos.filter((item) => Boolean(item.contrato_id) && inProcess(item));
  const activeRequest = data.solicitudes.find((item) => item.id === requestDetailId) ?? null;

  const fileColumns: DataTableColumn<Document>[] = [
    {
      key: "nombre",
      header: "Documento",
      mobile: "title",
      sortValue: (item) => requestedDocumentName(item, data.solicitudes) || item.nombre_archivo,
      searchValue: (item) => `${requestedDocumentName(item, data.solicitudes) ?? ""} ${item.nombre_archivo}`,
      render: (item) => {
        const requiredName = requestedDocumentName(item, data.solicitudes);
        return (
          <span className="flex min-w-0 items-center gap-2.5">
            <FileText aria-hidden="true" className="hidden size-4 shrink-0 text-primary md:block" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{requiredName || item.nombre_archivo}</span>
              {requiredName && <span className="block truncate text-xs font-normal text-foreground-muted">{item.nombre_archivo}</span>}
            </span>
          </span>
        );
      },
      className: "max-w-xs",
    },
    { key: "estado", header: "Revisión", mobile: "badge", sortValue: (item) => reviewStatusLabel(reviewState(item)).label, render: (item) => <Badge tone={reviewStatusLabel(reviewState(item)).tone}>{reviewStatusLabel(reviewState(item)).label}</Badge> },
    { key: "cliente", header: "Cliente", mobile: "subtitle", sortValue: (item) => item.cliente, render: (item) => item.cliente },
    { key: "proceso", header: "Proceso", mobile: "meta", sortValue: (item) => item.proceso, render: (item) => <span className="block max-w-56 truncate">{item.proceso}</span> },
    { key: "tipo", header: "Tipo", mobile: "hidden", wideOnly: true, sortValue: (item) => fileKind(item.mime_type), render: (item) => fileKind(item.mime_type) },
    { key: "created_at", header: "Recibido", mobile: "meta", className: "whitespace-nowrap", sortValue: (item) => toDate(item.created_at), exportValue: (item) => formatDateTime(item.created_at), render: (item) => formatDate(item.created_at) },
  ];

  const fileActions: RowAction<Document>[] = [
    { label: "Vista previa y revisar", icon: <Eye />, onSelect: (item) => abrirDocumento(item), disabled: () => documentAction !== null },
    { label: "Descargar", icon: <Download />, onSelect: (item) => descargarDocumento(item), disabled: () => documentAction !== null },
    { label: "Ir al proceso", icon: <FolderOpen />, href: (item) => `/gestion-procesos/abogado/procesos/${item.proceso_id}`, separated: true },
  ];

  const requestColumns: DataTableColumn<Request>[] = [
    { key: "titulo", header: "Solicitud", mobile: "title", sortValue: (item) => item.titulo, searchValue: (item) => `${item.titulo} ${item.instrucciones ?? ""} ${item.documentos_requeridos.map((doc) => doc.nombre).join(" ")}`, render: (item) => <span className="font-medium text-foreground">{item.titulo}</span> },
    { key: "estado", header: "Estado", mobile: "badge", sortValue: (item) => item.estado, render: (item) => <Badge tone={requestTone(item.estado)}>{requestStatusLabel(item.estado)}</Badge> },
    { key: "cliente", header: "Cliente", mobile: "subtitle", sortValue: (item) => item.cliente, render: (item) => item.cliente },
    { key: "proceso", header: "Proceso", mobile: "meta", sortValue: (item) => item.proceso, render: (item) => <span className="block max-w-56 truncate">{item.proceso}</span> },
    {
      key: "recibidos",
      header: "Recibidos",
      mobile: "meta",
      align: "right",
      sortValue: (item) => item.documentos_requeridos.filter((doc) => doc.documento).length / Math.max(1, item.documentos_requeridos.length),
      exportValue: (item) => `${item.documentos_requeridos.filter((doc) => doc.documento).length}/${item.documentos_requeridos.length}`,
      render: (item) => <span className="tabular-nums">{item.documentos_requeridos.filter((doc) => doc.documento).length}/{item.documentos_requeridos.length}</span>,
    },
  ];

  const contractColumns: DataTableColumn<Document>[] = [
    { key: "nombre_archivo", header: "Archivo", mobile: "title", sortValue: (item) => item.nombre_archivo, render: (item) => <span className="font-medium text-foreground">{item.nombre_archivo}</span> },
    { key: "contrato", header: "Contrato", mobile: "badge", sortValue: (item) => item.contrato_id, render: (item) => <Badge tone="review">Contrato #{item.contrato_id}</Badge> },
    { key: "cliente", header: "Cliente", mobile: "subtitle", sortValue: (item) => item.cliente, render: (item) => item.cliente },
    { key: "proceso", header: "Proceso", mobile: "meta", sortValue: (item) => item.proceso, render: (item) => item.proceso },
    { key: "created_at", header: "Cargado", mobile: "meta", sortValue: (item) => toDate(item.created_at), render: (item) => formatDate(item.created_at) },
  ];

  const processFilter = (
    <select
      aria-label="Filtrar por proceso"
      value={selectedProcessId ?? ""}
      onChange={(event) => setSelectedProcessId(event.target.value ? Number(event.target.value) : null)}
      className="h-10 max-w-full rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground sm:max-w-64"
    >
      <option value="">Todos los procesos</option>
      {processes.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}
    </select>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline="Expedientes"
        title="Documentos"
        description="Revisa los archivos que envían tus clientes y haz seguimiento a lo que les has solicitado."
        action={<Button variant="primary" onClick={() => setMostrarModal(true)} icon={<Plus className="size-4" />}>Solicitar documentos</Button>}
      />

      <SummaryStrip
        active={tab === "archivos" ? fileFilter : tab === "solicitudes" && filtroEstado === "PENDIENTES" ? "SOLICITUDES" : null}
        onSelect={(key) => {
          if (key === "SOLICITUDES") { setTab("solicitudes"); setFiltroEstado("PENDIENTES"); return; }
          setTab("archivos");
          setFileFilter(key);
        }}
        items={[
          { key: "POR_REVISAR", label: "Por revisar", value: files.filter(toReview).length, tone: "warning" },
          { key: "REQUIERE_CORRECCION", label: "Requieren corrección", value: files.filter((item) => reviewState(item) === "REQUIERE_CORRECCION").length, tone: "danger" },
          { key: "SOLICITUDES", label: "Solicitudes pendientes", value: requests.filter(pendingRequest).length },
          { key: "APROBADO", label: "Aprobados", value: files.filter((item) => reviewState(item) === "APROBADO").length, tone: "success" },
        ]}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger">
          <span className="flex items-center gap-2"><AlertCircle aria-hidden="true" className="size-4 shrink-0" />{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X className="size-4" /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-success/30 bg-success-light px-4 py-3 text-sm text-success">
          <span className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso"><X className="size-4" /></button>
        </div>
      )}

      <SegmentedControl
        label="Sección de documentos"
        value={tab}
        onChange={setTab}
        options={[
          { value: "archivos", label: "Archivos recibidos", count: files.length },
          { value: "solicitudes", label: "Solicitudes", count: requests.length },
          { value: "contratos", label: "Contratos", count: contracts.length },
        ]}
      />

      {tab === "archivos" && (
        <DataTable
          caption="Archivos recibidos"
          rows={visibleFiles}
          columns={fileColumns}
          rowKey={(item) => item.id}
          onRowClick={(item) => void abrirDocumento(item)}
          rowActions={fileActions}
          rowTone={(item) => (reviewState(item) === "RECIBIDO" ? "warning" : undefined)}
          searchPlaceholder="Buscar documento, cliente o proceso"
          initialSort={{ key: "created_at", direction: "desc" }}
          exportFilename="documentos-recibidos"
          storageKey="abogado-documentos"
          loading={loading}
          onRefresh={() => void load()}
          activeFilterCount={(selectedProcessId !== null ? 1 : 0) + (fileFilter ? 1 : 0)}
          toolbar={
            <>
              {processFilter}
              <select aria-label="Filtrar por revisión" value={fileFilter ?? ""} onChange={(event) => setFileFilter(event.target.value || null)} className="h-10 rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground">
                <option value="">Todos los estados</option>
                <option value="POR_REVISAR">Por revisar</option>
                <option value="APROBADO">Aprobados</option>
                <option value="REQUIERE_CORRECCION">Requieren corrección</option>
                <option value="RECHAZADO">Rechazados</option>
              </select>
            </>
          }
          emptyTitle={data.documentos.length === 0 ? "Aún no hay archivos" : "Ningún archivo coincide con los filtros"}
          emptyDescription={data.documentos.length === 0 ? "Cuando tus clientes carguen documentos aparecerán aquí para revisarlos." : undefined}
        />
      )}

      {tab === "solicitudes" && (
        <DataTable
          caption="Solicitudes de documentos"
          rows={visibleRequests}
          columns={requestColumns}
          rowKey={(item) => item.id}
          onRowClick={(item) => setRequestDetailId(item.id)}
          rowActions={[
            { label: "Ver documentos solicitados", icon: <Eye />, onSelect: (item) => setRequestDetailId(item.id) },
            { label: "Ir al proceso", icon: <FolderOpen />, href: (item) => `/gestion-procesos/abogado/procesos/${item.proceso_id}` },
            { label: "Eliminar solicitud", icon: <Trash2 />, tone: "danger", separated: true, onSelect: (item) => setRequestToDelete(item) },
          ]}
          rowTone={(item) => (pendingRequest(item) ? "warning" : undefined)}
          searchPlaceholder="Buscar solicitud o documento"
          exportFilename="solicitudes-documentos"
          storageKey="abogado-solicitudes"
          loading={loading}
          onRefresh={() => void load()}
          activeFilterCount={(selectedProcessId !== null ? 1 : 0) + (filtroEstado !== "TODAS" ? 1 : 0)}
          toolbar={
            <>
              {processFilter}
              <select aria-label="Filtrar solicitudes" value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)} className="h-10 rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground">
                <option value="TODAS">Todas las solicitudes</option>
                <option value="PENDIENTES">Pendientes del cliente</option>
                <option value="ENTREGADAS">Entregadas</option>
              </select>
            </>
          }
          emptyTitle={data.solicitudes.length === 0 ? "No has solicitado documentos" : "Ninguna solicitud coincide con los filtros"}
          emptyAction={data.solicitudes.length === 0 ? <Button variant="primary" onClick={() => setMostrarModal(true)} icon={<Plus className="size-4" />}>Solicitar documentos</Button> : undefined}
        />
      )}

      {tab === "contratos" && (
        <DataTable
          caption="Contratos cargados"
          rows={contracts}
          columns={contractColumns}
          rowKey={(item) => item.id}
          onRowClick={(item) => void abrirDocumento(item)}
          rowActions={[
            { label: "Ver PDF", icon: <Eye />, onSelect: (item) => abrirDocumento(item), disabled: () => documentAction !== null },
            { label: "Descargar", icon: <Download />, onSelect: (item) => descargarDocumento(item), disabled: () => documentAction !== null },
          ]}
          initialSort={{ key: "created_at", direction: "desc" }}
          loading={loading}
          toolbar={
            <>
              {processFilter}
              {user?.rol === "ABOGADO_ADMIN" && <Link href="/gestion-procesos/abogado/contratos" className="inline-flex h-10 items-center px-2 text-sm font-medium text-primary hover:underline">Gestionar contratos</Link>}
            </>
          }
          activeFilterCount={selectedProcessId !== null ? 1 : 0}
          emptyTitle="Sin contratos cargados"
          emptyDescription="Los PDF firmados de los contratos aparecerán aquí."
        />
      )}

      <Drawer
        open={Boolean(activeRequest)}
        onClose={() => setRequestDetailId(null)}
        overline="Solicitud de documentos"
        title={activeRequest?.titulo ?? ""}
        subtitle={activeRequest ? `${activeRequest.cliente} · ${activeRequest.proceso}` : undefined}
      >
        {activeRequest && (
          <div className="space-y-4">
            <Badge tone={requestTone(activeRequest.estado)}>{requestStatusLabel(activeRequest.estado)}</Badge>
            {activeRequest.instrucciones && <p className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-surface-muted p-3 text-sm text-foreground-secondary">{activeRequest.instrucciones}</p>}
            <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border">
              {activeRequest.documentos_requeridos.map((requested) => (
                <li key={requested.id} className="flex items-start gap-3 p-3">
                  <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{requested.nombre}</p>
                    {requested.documento ? (
                      <p className="mt-0.5 truncate text-xs text-foreground-muted">{requested.documento.nombre_archivo}</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-foreground-muted">El cliente aún no lo ha cargado</p>
                    )}
                    {requested.documento?.comentario_revision && <p className="mt-1 text-xs text-warning">Observación: {requested.documento.comentario_revision}</p>}
                  </div>
                  {requested.documento ? (
                    <button
                      type="button"
                      onClick={() => {
                        const document = data.documentos.find((item) => item.id === requested.documento?.id);
                        if (document) { setRequestDetailId(null); void abrirDocumento(document); }
                      }}
                      className="shrink-0 text-xs font-semibold text-primary hover:underline"
                    >
                      {reviewStatusLabel(requested.documento.estado_revision).label} · Revisar
                    </button>
                  ) : <Badge tone="pending">Pendiente</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Drawer>

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
                {documentoActivo.contrato_id ? <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm">PDF firmado del contrato #{documentoActivo.contrato_id}. Este archivo no requiere revisión documental.</p> : <><label className="block text-sm font-medium">Estado de revisión<select value={estadoRevision} onChange={(event) => setEstadoRevision(event.target.value)} className="mt-1.5 w-full rounded-lg border px-3 py-2" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}><option value="EN_REVISION">En revisión</option><option value="APROBADO">Aprobado</option><option value="REQUIERE_CORRECCION">Requiere corrección</option><option value="RECHAZADO">Rechazado</option></select></label><label className="block text-sm font-medium">Comentario<textarea value={comentarioRevision} onChange={(event) => setComentarioRevision(event.target.value)} rows={5} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label><button type="button" onClick={() => void guardarRevision()} disabled={guardandoRevision} className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{guardandoRevision ? "Guardando…" : "Guardar revisión"}</button></>}
                <a href={archivoPreview} download={documentoActivo.nombre_archivo} className="inline-block rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>Descargar</a>
              </aside>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(requestToDelete)}
        onClose={() => setRequestToDelete(null)}
        onConfirm={eliminarSolicitud}
        title="Eliminar solicitud"
        description={requestToDelete ? `Se eliminará "${requestToDelete.titulo}" y el cliente dejará de verla. Los archivos que ya cargó se conservan en el proceso.` : ""}
        confirmLabel="Eliminar"
        destructive
      />

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
    const documentos = String(form.get("documentos") || "")
      .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);

    const instrucciones = String(
      form.get("instrucciones") || "",
    ).trim();
    const fechaLimiteLocal = String(form.get("fecha_limite") || "");

    if (!documentos.length) {
      onError("Escribe al menos un documento solicitado, uno por línea.");
      return;
    }
    if (documentos.length > 30) {
      onError("Puedes incluir hasta 30 documentos en una solicitud.");
      return;
    }
    if (new Set(documentos.map((value) => value.toLocaleLowerCase())).size !== documentos.length) {
      onError("Cada documento solicitado debe tener un nombre distinto.");
      return;
    }

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
            documentos,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 sm:p-6 text-foreground shadow-2xl"
      >
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
              >
                <FileText size={18} />
              </div>

              <h2 className="text-lg font-semibold">
                Solicitar documento
              </h2>
            </div>

            <p
              className="mt-2 text-xs text-muted"
            >
              Envía una solicitud de documento a un cliente
              asociada a un proceso.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-surface-secondary hover:text-foreground"
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
              Nombre de la solicitud
            </label>

            <input
              name="titulo"
              required
              placeholder="Ej. Documentos para preparar la demanda"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Documentos requeridos <span className="font-normal text-foreground-muted">(uno por línea, hasta 30)</span></label>
            <textarea
              name="documentos"
              required
              autoFocus
              rows={5}
              placeholder={"Copia de la cédula de ciudadanía\nRegistro civil de nacimiento\nCertificado de residencia"}
              className="w-full resize-y rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}
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
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              variant="primary"
              loading={saving}
            >
              Enviar solicitud
            </Button>
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

