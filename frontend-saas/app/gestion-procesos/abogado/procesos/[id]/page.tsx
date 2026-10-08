"use client";

import { apiRequest } from "@/lib/api";
import { iniciarWorkflowConsultaRadicado } from "@/lib/api";
import ProcessContracts from "@/components/contracts/ProcessContracts";

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
  colaboradores: { id: number; nombre_completo: string; visible_cliente: boolean }[];
  abogados_disponibles: { id: number; nombre_completo: string }[];
  clientes: Client[];
  radicados: Radicado[];
  eventos: { id: number; titulo: string; descripcion?: string | null; tipo: "EVENTO" | "AUDIENCIA" | "REUNION" | "FIRMA_CONTRATO"; estado: "PROGRAMADO" | "COMPLETADO" | "CANCELADO"; fecha_inicio: string; fecha_fin?: string | null; cliente_id?: number | null; cliente?: string | null; contrato_id?: number | null }[];
  contratos: { id: number; cliente_id: number; cliente: string; estado: string; version_actual: number; emitido_en?: string | null; firmado_en?: string | null; terminado_en?: string | null; documento_firmado: { id: number; nombre_archivo: string; mime_type: string; created_at: string } | null }[];
  tareas: {
    id: number;
    titulo: string;
    descripcion?: string | null;
    estado: string;
    prioridad: string;
    cliente_id?: number | null;
    fecha_limite?: string | null;
    radicado_id?: number | null;
    actuacion_id?: number | null;
    responsable?: string | null;
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
    solicitud_id: number;
    nombre_archivo: string;
    cliente: string;
    mime_type: string;
    estado_revision: string;
    comentario_revision?: string | null;
    created_at: string;
  }[];
  timeline: { id: string; tipo: string; titulo: string; descripcion: string; actor?: string | null; recurso: string; recurso_id: number; visibilidad: "CLIENTE" | "INTERNA"; canal?: string; fecha: string }[];
  comunicaciones: { id: number; asunto: string; contenido: string; visibilidad: "CLIENTE" | "INTERNA"; canal: string; cliente_id?: number | null; cliente?: string | null; actor?: string | null; created_at: string }[];
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
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIA");
  const [taskDue, setTaskDue] = useState("");
  const [taskClientId, setTaskClientId] = useState("");
  const [taskRadicadoId, setTaskRadicadoId] = useState("");
  const [taskActuationId, setTaskActuationId] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentInstructions, setDocumentInstructions] = useState("");
  const [documentClientId, setDocumentClientId] = useState("");
  const [notificationActuationId, setNotificationActuationId] = useState("");
  const [notificationClientId, setNotificationClientId] = useState("");
  const [notificationComments, setNotificationComments] = useState("");
  const [communicationSubject, setCommunicationSubject] = useState("");
  const [communicationBody, setCommunicationBody] = useState("");
  const [communicationVisibility, setCommunicationVisibility] = useState<"INTERNA" | "CLIENTE">("INTERNA");
  const [communicationClientId, setCommunicationClientId] = useState("");
  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaDescription, setAgendaDescription] = useState("");
  const [agendaType, setAgendaType] = useState<"EVENTO" | "AUDIENCIA" | "REUNION" | "FIRMA_CONTRATO">("AUDIENCIA");
  const [agendaStatus, setAgendaStatus] = useState<"PROGRAMADO" | "COMPLETADO" | "CANCELADO">("PROGRAMADO");
  const [agendaDate, setAgendaDate] = useState("");
  const [agendaClientId, setAgendaClientId] = useState("");
  const [agendaContractId, setAgendaContractId] = useState("");
  const [editingAgendaId, setEditingAgendaId] = useState<number | null>(null);
  const [selectedColleagueId, setSelectedColleagueId] = useState("");
  const [selectedColleagueVisible, setSelectedColleagueVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("resumen");

  const [clientQuery, setClientQuery] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientWhatsapp, setNewClientWhatsapp] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [newClientChannel, setNewClientChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [radicadoQuery, setRadicadoQuery] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [showClientModal, setShowClientModal] = useState(false);
  const [showRadicadoModal, setShowRadicadoModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDocumentRequestModal, setShowDocumentRequestModal] = useState(false);
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<{ id: number; name: string; mimeType: string; url: string; estado: string; comentario: string } | null>(null);
  const [documentReviewSaving, setDocumentReviewSaving] = useState(false);
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
      { abogado_id: Number(selectedColleagueId), visible_cliente: selectedColleagueVisible },
    );
    if (saved) { setSelectedColleagueId(""); setSelectedColleagueVisible(false); }
  }

  async function updateColleaguePermission(colleagueId: number, visibleCliente: boolean) {
    await action(`/api/expedientes/procesos/${id}/colaboradores/${colleagueId}`, "PATCH", { visible_cliente: visibleCliente });
  }

  async function createAndAssignClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newClientName.trim() || !newClientEmail.trim() || newClientPassword.length < 8) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const createResponse = await apiRequest("/api/expedientes/clientes", {
        method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_completo: newClientName.trim(), email: newClientEmail.trim(), whatsapp_numero: newClientWhatsapp.trim(), password_temporal: newClientPassword, canal_envio: newClientChannel }),
      });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(created.detail || "No fue posible crear el cliente.");
      const assignResponse = await apiRequest(`/api/expedientes/procesos/${id}/clientes/${created.id}`, { method: "POST", headers: headers() });
      const assigned = await assignResponse.json().catch(() => ({}));
      if (!assignResponse.ok) {
        setAllClients((current) => [...current, { id: created.id, nombre_completo: newClientName.trim(), email: newClientEmail.trim() }]);
        setCreatingClient(false);
        throw new Error(`La cuenta fue creada y sus credenciales se enviaron, pero no se pudo asociar al proceso: ${assigned.detail || "intenta agregar el cliente desde la lista"}`);
      }
      setNotice(`${created.mensaje || "Cliente creado"} y asociado a este proceso.`);
      setNewClientName(""); setNewClientEmail(""); setNewClientWhatsapp(""); setNewClientPassword(""); setCreatingClient(false); setShowClientModal(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear y asociar el cliente.");
    } finally { setWorking(false); }
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

  async function openDocumentPreview(document: Process["documentos"][number]) {
    setDownloadingDocumentId(document.id);
    setError("");
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${document.id}/archivo`, { headers: headers() });
      if (!response.ok) {
        const result: { detail?: string } = await response.json().catch(() => ({}));
        throw new Error(result.detail || "No fue posible abrir el documento.");
      }
      const url = URL.createObjectURL(await response.blob());
      setDocumentPreview({ id: document.id, name: document.nombre_archivo, mimeType: document.mime_type, url, estado: document.estado_revision === "RECIBIDO" ? "EN_REVISION" : document.estado_revision || "EN_REVISION", comentario: document.comentario_revision || "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible abrir el documento.");
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  function closeDocumentPreview() {
    if (documentPreview?.url) URL.revokeObjectURL(documentPreview.url);
    setDocumentPreview(null);
  }

  async function saveDocumentReview() {
    if (!documentPreview) return;
    setDocumentReviewSaving(true);
    const ok = await action(`/api/expedientes/documentos/${documentPreview.id}/revision`, "PATCH", {
      estado_revision: documentPreview.estado,
      comentario_revision: documentPreview.comentario,
    });
    if (ok) setDocumentPreview((current) => current ? { ...current } : current);
    setDocumentReviewSaving(false);
  }

  async function saveCommunication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action(`/api/expedientes/procesos/${id}/comunicaciones`, "POST", {
      asunto: communicationSubject.trim(),
      contenido: communicationBody.trim(),
      visibilidad: communicationVisibility,
      canal: "INTERNO",
      cliente_id: communicationVisibility === "CLIENTE" ? Number(communicationClientId) : null,
    });
    if (ok) {
      setCommunicationSubject(""); setCommunicationBody(""); setCommunicationClientId(""); setCommunicationVisibility("INTERNA");
    }
  }

  async function saveAgendaEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action(editingAgendaId ? `/api/expedientes/agenda/eventos/${editingAgendaId}` : "/api/expedientes/agenda/eventos", editingAgendaId ? "PATCH" : "POST", {
      titulo: agendaTitle.trim(), descripcion: agendaDescription.trim() || null, tipo: agendaType, estado: agendaStatus,
      fecha_inicio: new Date(agendaDate).toISOString(), fecha_fin: null, proceso_id: Number(id),
      cliente_id: agendaClientId ? Number(agendaClientId) : null,
      contrato_id: agendaType === "FIRMA_CONTRATO" && agendaContractId ? Number(agendaContractId) : null,
    });
    if (ok) { setShowAgendaModal(false); setEditingAgendaId(null); }
  }

  function openAgendaEvent(event?: Process["eventos"][number]) {
    setEditingAgendaId(event?.id ?? null);
    setAgendaTitle(event?.titulo ?? ""); setAgendaDescription(event?.descripcion ?? ""); setAgendaType(event?.tipo ?? "AUDIENCIA");
    setAgendaStatus(event?.estado ?? "PROGRAMADO");
    setAgendaContractId(event?.contrato_id ? String(event.contrato_id) : "");
    if (event) { const date = new Date(event.fecha_inicio); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); setAgendaDate(date.toISOString().slice(0, 16)); }
    else { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); setAgendaDate(date.toISOString().slice(0, 16)); }
    setAgendaClientId(event?.cliente_id ? String(event.cliente_id) : ""); setShowAgendaModal(true);
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

  function timelineResourceHref(item: Process["timeline"][number]) {
    if (item.recurso === "Tarea") return `/gestion-procesos/abogado/tareas/${item.recurso_id}`;
    if (item.recurso === "Documento") return `/gestion-procesos/abogado/documentos?proceso=${id}#documento-${item.recurso_id}`;
    if (item.recurso === "Solicitud de documento") return `/gestion-procesos/abogado/documentos?proceso=${id}#solicitud-${item.recurso_id}`;
    if (item.recurso === "Actuación") {
      const radicado = process?.radicados.find((entry) => entry.actuaciones.some((actuacion) => actuacion.id === item.recurso_id));
      if (radicado) return `/gestion-procesos/abogado/radicados/${radicado.id}`;
    }
    if (item.recurso === "Agenda") return "#agenda";
    if (item.recurso === "Comunicación" || item.recurso === "Nota interna") return "#comunicaciones";
    return "#resumen";
  }

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
      radicado_id: radicado.id,
      radicado: radicado.numero,
      fecha_actuacion: actuacion.fecha_actuacion,
      label: `${radicado.numero} · ${actuacion.actuacion || "Actuación judicial"}`,
    }))) ?? [],
    [process]
  );

  const processTabs: { id: string; label: string }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "relaciones", label: "Clientes y radicados" },
    { id: "agenda", label: "Agenda" },
    { id: "tareas", label: "Tareas" },
    { id: "documentos", label: "Documentos" },
    { id: "contratos", label: "Contratos" },
    { id: "actividad", label: "Actividad" },
    { id: "comunicaciones", label: "Comunicaciones" },
    ...(process?.admite_colaboradores ? [{ id: "equipo", label: "Equipo" }] : []),
  ];

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

      <nav role="tablist" aria-label="Secciones del expediente" className="sticky top-0 z-20 flex gap-2 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-2 backdrop-blur">
        {processTabs.map((tab) => <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${activeTab === tab.id ? "bg-[var(--primary)] text-white" : "text-[var(--foreground-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"}`}>{tab.label}</button>)}
      </nav>

      {process.admite_colaboradores && (
        <section id="panel-equipo" role="tabpanel" aria-labelledby="tab-equipo" style={{ display: activeTab === "equipo" ? undefined : "none" }} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <header className="flex items-start gap-3">
            <Users className="mt-0.5 size-5 text-[var(--primary)]" />
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">Equipo del proceso</h2>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                Responsable: {process.responsable.nombre_completo}. Los colaboradores acceden a este expediente; los abogados participantes también aparecen al cliente.
              </p>
            </div>
          </header>
          {process.colaboradores.length ? (
            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {process.colaboradores.map((colleague) => (
                <li key={colleague.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="text-[var(--foreground)]">{colleague.nombre_completo}<span className="ml-2 rounded-full bg-[var(--surface-secondary)] px-2 py-1 text-xs text-[var(--foreground-muted)]">{colleague.visible_cliente ? "Abogado participante · visible al cliente" : "Solo colaborador"}</span></span>
                  {process.puede_gestionar_equipo && (
                    <div className="flex items-center gap-3">
                      <select aria-label={`Permiso de ${colleague.nombre_completo}`} value={colleague.visible_cliente ? "participante" : "interno"} disabled={working} onChange={(event) => void updateColleaguePermission(colleague.id, event.target.value === "participante")} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs">
                        <option value="interno">Solo colaborador</option><option value="participante">Abogado participante</option>
                      </select>
                      <button type="button" disabled={working} onClick={() => void removeColleague(colleague.id)} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">Retirar acceso</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">No hay colaboradores asignados.</p>
          )}
          {process.puede_gestionar_equipo && (process.abogados_disponibles.length > 0 ? (
            <form onSubmit={addColleague} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select required value={selectedColleagueId} onChange={(event) => setSelectedColleagueId(event.target.value)} aria-label="Abogado para agregar" className="min-w-56 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                <option value="">Seleccionar abogado de la firma</option>
                {process.abogados_disponibles.map((colleague) => <option key={colleague.id} value={colleague.id}>{colleague.nombre_completo}</option>)}
              </select>
              <select value={selectedColleagueVisible ? "participante" : "interno"} onChange={(event) => setSelectedColleagueVisible(event.target.value === "participante")} aria-label="Permiso del abogado" className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                <option value="interno">Solo colaborador</option><option value="participante">Abogado participante (visible al cliente)</option>
              </select>
              <button type="submit" disabled={working || !selectedColleagueId} className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><UserPlus className="size-4" />Agregar abogado</button>
            </form>
          ) : (
            <p className="rounded-md bg-[var(--surface-secondary)] p-3 text-sm text-[var(--foreground-muted)]">No hay otros abogados administradores activos disponibles para agregar.</p>
          ))}
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
      <section id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen" style={{ display: activeTab === "resumen" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
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
      <div id="panel-relaciones" role="tabpanel" aria-labelledby="tab-relaciones" style={{ display: activeTab === "relaciones" ? undefined : "none" }} className="grid gap-5 xl:grid-cols-2">
        {/* CLIENTES */}
        <section id="clientes" className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
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
                      <Link href={`/gestion-procesos/abogado/clientes/${client.id}`} className="mt-1 inline-block text-xs font-medium text-[var(--primary)] hover:underline">Abrir ficha del cliente</Link>
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
        <section id="radicados" className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
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
                        <Link href={`/gestion-procesos/abogado/radicados/${radicado.id}`} className="mt-1 inline-block text-xs font-medium text-[var(--primary)] hover:underline">Abrir detalle del radicado</Link>

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

      <section id="panel-agenda" role="tabpanel" aria-labelledby="tab-agenda" style={{ display: activeTab === "agenda" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div><h2 className="text-sm font-semibold text-[var(--foreground)]">Agenda del proceso</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Audiencias, reuniones y eventos asociados a este expediente.</p></div><button type="button" onClick={() => openAgendaEvent()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"><Plus className="size-4" />Agendar actividad</button></header>
        {process.eventos.length ? <div className="divide-y divide-[var(--border)]">{process.eventos.map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{event.tipo === "AUDIENCIA" ? "Audiencia" : event.tipo === "REUNION" ? "Reunión" : "Evento"}: {event.titulo}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">{new Date(event.fecha_inicio).toLocaleString("es-CO")} · {event.estado.replaceAll("_", " ")}{event.cliente ? ` · ${event.cliente}` : ""}</p></div><div className="flex gap-3 text-xs"><button type="button" onClick={() => openAgendaEvent(event)} className="text-[var(--primary)] hover:underline">Editar</button><button type="button" onClick={() => { if (window.confirm(`¿Eliminar ${event.titulo} de la agenda?`)) void action(`/api/expedientes/agenda/eventos/${event.id}`, "DELETE"); }} className="text-red-600 hover:underline">Eliminar</button></div></article>)}</div> : <p className="px-5 py-8 text-center text-sm text-[var(--foreground-muted)]">No hay actividades programadas para este proceso.</p>}
      </section>

      <section id="panel-actividad" role="tabpanel" aria-labelledby="tab-actividad" style={{ display: activeTab === "actividad" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-5 py-4"><h2 className="text-sm font-semibold text-[var(--foreground)]">Actividad del expediente</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Timeline de actuaciones judiciales, tareas, documentos y comunicaciones, con la visibilidad asignada en el servidor.</p></header>
        {process.timeline.length ? <ol className="divide-y divide-[var(--border)]">{process.timeline.slice(0, 100).map((item) => <li key={item.id} className="flex gap-3 px-5 py-4"><span className={`mt-1 size-2 shrink-0 rounded-full ${item.visibilidad === "CLIENTE" ? "bg-emerald-500" : "bg-slate-400"}`} title={item.visibilidad === "CLIENTE" ? "Visible al cliente" : "Solo equipo interno"} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-[var(--foreground)]">{item.titulo}</p><span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] uppercase text-[var(--foreground-muted)]">{item.tipo}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${item.visibilidad === "CLIENTE" ? "bg-emerald-500/10 text-emerald-700" : "bg-slate-500/10 text-slate-600"}`}>{item.visibilidad === "CLIENTE" ? "Cliente visible" : "Interno"}</span><Link href={timelineResourceHref(item)} className="text-xs font-medium text-[var(--primary)] hover:underline">Abrir {item.recurso.toLowerCase()}</Link></div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground-secondary)]">{item.descripcion}</p><p className="mt-1 text-[11px] text-[var(--foreground-muted)]">{item.actor || item.recurso}{item.fecha ? ` · ${new Date(item.fecha).toLocaleString("es-CO")}` : ""}</p></div></li>)}</ol> : <p className="p-8 text-center text-sm text-[var(--foreground-muted)]">Aún no hay actividad registrada.</p>}
      </section>

      {/* MÓDULOS SECUNDARIOS */}
      <div className="grid gap-5">
        {/* TAREAS */}
        <section id="panel-tareas" role="tabpanel" aria-labelledby="tab-tareas" style={{ display: activeTab === "tareas" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
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
                setTaskDescription("");
                setTaskPriority("MEDIA");
                setTaskDue("");
                setTaskClientId("");
                setTaskRadicadoId("");
                setTaskActuationId("");
                setShowTaskModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
            >
              <Plus className="size-4" /> Nueva tarea
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
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">{[task.radicado_id ? process.radicados.find((item) => item.id === task.radicado_id)?.numero : null, task.actuacion_id ? `Actuación ${task.actuacion_id}` : null, task.cliente_id ? process.clientes.find((item) => item.id === task.cliente_id)?.nombre_completo : null].filter(Boolean).join(" · ") || "Tarea general del proceso"}</p>

                    <span className="mt-2 inline-flex rounded-full bg-[var(--primary)]/10 px-2 py-1 text-[10px] font-medium text-[var(--primary)]">
                      {task.estado}
                    </span>
                    <Link href={`/gestion-procesos/abogado/tareas/${task.id}`} className="ml-3 text-xs font-medium text-[var(--primary)] hover:underline">Abrir tarea y opciones</Link>
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
        <section id="panel-documentos" role="tabpanel" aria-labelledby="tab-documentos" style={{ display: activeTab === "documentos" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
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
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-[var(--foreground)]">{request.titulo}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">{request.cliente}</p>{request.instrucciones && <p className="mt-2 text-xs text-[var(--foreground-muted)]">{request.instrucciones}</p>}<Link href={`/gestion-procesos/abogado/documentos?proceso=${id}#solicitud-${request.id}`} className="mt-2 inline-block text-xs font-medium text-[var(--primary)] hover:underline">Abrir solicitud documental</Link></div><span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ${request.atendida_en ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{request.atendida_en ? "Entregada" : "Pendiente"}</span></div>
              </div>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">No hay solicitudes para este proceso.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Archivos entregados</h3>
              {process.documentos.length ? <div className="space-y-2">{process.documentos.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--foreground)]">{document.nombre_archivo}</p><p className="truncate text-xs text-[var(--foreground-muted)]">{document.cliente} · {new Date(document.created_at).toLocaleDateString("es-CO")} · {document.estado_revision.replaceAll("_", " ")}</p><Link href={`/gestion-procesos/abogado/documentos?proceso=${id}#documento-${document.id}`} className="mt-1 inline-block text-xs font-medium text-[var(--primary)] hover:underline">Abrir en carpeta documental</Link></div></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void openDocumentPreview(document)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-50">{downloadingDocumentId === document.id ? "Abriendo…" : "Previsualizar y revisar"}</button><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void downloadDocument(document.id, document.nombre_archivo)} aria-label={`Descargar ${document.nombre_archivo}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"><Download className="size-3.5" />Descargar</button></div></div>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Aún no se han entregado archivos.</p>}
            </div>
          </div>
        </section>

        {/* CONTRATOS */}
        <section id="panel-contratos" role="tabpanel" aria-labelledby="tab-contratos" style={{ display: activeTab === "contratos" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <ProcessContracts processId={process.id} clients={process.clientes} onChange={load} />
        </section>

        {/* NOTIFICACIONES */}
        <section id="panel-comunicaciones" role="tabpanel" aria-labelledby="tab-comunicaciones" style={{ display: activeTab === "comunicaciones" ? undefined : "none" }} className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Bell className="size-4" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Comunicaciones y avisos
                </h2>

                <p className="text-xs text-[var(--foreground-muted)]">
                  Historial interno y mensajes visibles al cliente
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <form onSubmit={(event) => void saveCommunication(event)} className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Registrar comunicación</h3>
              <label className="block text-xs font-medium">Visibilidad<select value={communicationVisibility} onChange={(event) => { setCommunicationVisibility(event.target.value as "INTERNA" | "CLIENTE"); setCommunicationClientId(""); }} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option value="INTERNA">Nota solo para el equipo</option><option value="CLIENTE">Mensaje visible en el portal del cliente</option></select></label>
              {communicationVisibility === "CLIENTE" && <label className="block text-xs font-medium">Cliente<select required value={communicationClientId} onChange={(event) => setCommunicationClientId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option value="">Selecciona cliente</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>}
              <label className="block text-xs font-medium">Asunto<input required maxLength={255} value={communicationSubject} onChange={(event) => setCommunicationSubject(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
              <label className="block text-xs font-medium">Contenido<textarea required maxLength={12000} rows={3} value={communicationBody} onChange={(event) => setCommunicationBody(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
              <button type="submit" disabled={working || !communicationSubject.trim() || !communicationBody.trim() || (communicationVisibility === "CLIENTE" && !communicationClientId)} className="rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Guardar en el expediente</button>
              <p className="text-[10px] text-[var(--foreground-muted)]">El registro queda trazable; no envía correos ni WhatsApp automáticamente.</p>
            </form>
            <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Historial</h3>{process.comunicaciones.length ? <div className="space-y-2">{process.comunicaciones.map((item) => <article key={item.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{item.asunto}</p><span className={`rounded-full px-2 py-1 text-[10px] ${item.visibilidad === "CLIENTE" ? "bg-emerald-500/10 text-emerald-700" : "bg-slate-500/10 text-slate-600"}`}>{item.visibilidad === "CLIENTE" ? `Visible para ${item.cliente || "cliente"}` : "Interna"}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground-secondary)]">{item.contenido}</p><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">{item.actor || "Equipo"} · {new Date(item.created_at).toLocaleString("es-CO")}</p></article>)}</div> : <p className="text-xs text-[var(--foreground-muted)]">No hay comunicaciones registradas.</p>}</div>
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

      {showAgendaModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={(event) => void saveAgendaEvent(event)} className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{editingAgendaId ? "Editar actividad" : "Agendar en este proceso"}</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">La actividad queda vinculada a {process.nombre}.</p></div><button type="button" onClick={() => setShowAgendaModal(false)} aria-label="Cerrar" className="rounded-md p-1 hover:bg-[var(--surface-secondary)]"><X className="size-5" /></button></header><label className="block text-sm font-medium">Título<input required maxLength={255} value={agendaTitle} onChange={(event) => setAgendaTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Tipo<select value={agendaType} onChange={(event) => setAgendaType(event.target.value as typeof agendaType)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="AUDIENCIA">Audiencia</option><option value="REUNION">Reunión</option><option value="FIRMA_CONTRATO">Firma de contrato</option><option value="EVENTO">Evento</option></select></label><label className="block text-sm font-medium">Estado<select value={agendaStatus} onChange={(event) => setAgendaStatus(event.target.value as typeof agendaStatus)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="PROGRAMADO">Programado</option><option value="COMPLETADO">Completado</option><option value="CANCELADO">Cancelado</option></select></label></div><label className="block text-sm font-medium">Fecha y hora<input required type="datetime-local" value={agendaDate} onChange={(event) => setAgendaDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><label className="block text-sm font-medium">Cliente (opcional)<select value={agendaClientId} onChange={(event) => setAgendaClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Solo equipo interno</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>{agendaType === "FIRMA_CONTRATO" && <label className="block text-sm font-medium">Contrato<select required value={agendaContractId} onChange={(event) => setAgendaContractId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Selecciona contrato listo para firma</option>{process.contratos.filter((contract) => ["LISTO_PARA_FIRMA", "EN_FIRMA"].includes(contract.estado)).map((contract) => <option key={contract.id} value={contract.id}>Contrato #{contract.id} · {contract.cliente} · {contract.estado}</option>)}</select><span className="mt-1 block text-xs text-[var(--foreground-muted)]">El cliente debe ser el mismo que figura en el contrato.</span></label>}<label className="block text-sm font-medium">Descripción<textarea rows={3} maxLength={4000} value={agendaDescription} onChange={(event) => setAgendaDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4"><button type="button" disabled={working} onClick={() => setShowAgendaModal(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button><button type="submit" disabled={working || !agendaTitle.trim() || !agendaDate || (agendaType === "FIRMA_CONTRATO" && (!agendaContractId || !agendaClientId))} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar actividad</button></div></form></div>}

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

      {documentPreview && (
        <div role="dialog" aria-modal="true" aria-labelledby="document-preview-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
          <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6"><div className="min-w-0"><h2 id="document-preview-title" className="truncate font-semibold">{documentPreview.name}</h2><p className="text-xs text-[var(--foreground-muted)]">Vista del documento · {documentPreview.estado.replaceAll("_", " ")}</p></div><button type="button" onClick={closeDocumentPreview} aria-label="Cerrar vista del documento" className="rounded-md p-2 hover:bg-[var(--surface-secondary)]"><X className="size-5" /></button></header>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-6">
              <div className="grid min-h-[40vh] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] lg:min-h-[65vh]">{documentPreview.mimeType.startsWith("image/") ? <img src={documentPreview.url} alt={documentPreview.name} className="max-h-[72vh] max-w-full object-contain" /> : documentPreview.mimeType === "application/pdf" ? <iframe title={`Vista previa de ${documentPreview.name}`} src={documentPreview.url} className="h-[65vh] w-full" /> : <p className="p-8 text-center text-sm text-[var(--foreground-muted)]">Este tipo de archivo no admite vista previa. Descárgalo para revisarlo.</p>}</div>
              <aside className="space-y-4"><label className="block text-sm font-medium">Estado de revisión<select value={documentPreview.estado} onChange={(event) => setDocumentPreview({ ...documentPreview, estado: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="RECIBIDO">Recibido</option><option value="EN_REVISION">En revisión</option><option value="APROBADO">Aprobado</option><option value="REQUIERE_CORRECCION">Requiere corrección</option><option value="RECHAZADO">Rechazado</option></select></label><label className="block text-sm font-medium">Comentario para el historial<textarea rows={6} maxLength={4000} value={documentPreview.comentario} onChange={(event) => setDocumentPreview({ ...documentPreview, comentario: event.target.value })} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><button type="button" onClick={() => void saveDocumentReview()} disabled={documentReviewSaving} className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{documentReviewSaving ? "Guardando…" : "Guardar revisión"}</button><button type="button" onClick={() => void downloadDocument(documentPreview.id, documentPreview.name)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm"><Download className="size-4" />Descargar archivo</button><p className="text-xs leading-5 text-[var(--foreground-muted)]">Solicitar corrección devuelve la solicitud al estado pendiente para que el cliente vuelva a cargar el archivo.</p></aside>
            </div>
          </section>
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
              {error && <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700">{error}</p>}
              <button type="button" onClick={() => setCreatingClient((current) => !current)} className="w-full rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/5">
                {creatingClient ? "← Elegir un cliente existente" : "+ Crear cliente y asociarlo al proceso"}
              </button>
              {creatingClient ? <form onSubmit={(event) => void createAndAssignClient(event)} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
                <label className="block text-xs font-medium">Nombre completo<input required maxLength={150} value={newClientName} onChange={(event) => setNewClientName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
                <label className="block text-xs font-medium">Correo<input required type="email" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
                <label className="block text-xs font-medium">WhatsApp<input type="tel" value={newClientWhatsapp} onChange={(event) => setNewClientWhatsapp(event.target.value)} placeholder="57..." className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
                <label className="block text-xs font-medium">Contraseña temporal<input required minLength={8} type="password" autoComplete="new-password" value={newClientPassword} onChange={(event) => setNewClientPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /><span className="mt-1 block font-normal text-[var(--foreground-muted)]">El cliente tendrá que cambiarla al ingresar.</span></label>
                <label className="block text-xs font-medium">Enviar credenciales por<select value={newClientChannel} onChange={(event) => setNewClientChannel(event.target.value as "EMAIL" | "WHATSAPP")} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"><option value="EMAIL">Correo</option><option value="WHATSAPP" disabled={!newClientWhatsapp.trim()}>WhatsApp</option></select></label>
                <button type="submit" disabled={working || !newClientName.trim() || !newClientEmail.trim() || newClientPassword.length < 8 || (newClientChannel === "WHATSAPP" && !newClientWhatsapp.trim())} className="w-full rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{working ? "Creando y asociando…" : "Crear, enviar acceso y asociar"}</button>
              </form> : <>
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
              </>}
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
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Nueva tarea
                </h2>

                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Se crea dentro de este proceso. Puedes limitarla a un radicado, una actuación o un cliente.
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
                    titulo: taskTitle.trim(),
                    descripcion: taskDescription.trim() || null,
                    proceso_id: Number(id),
                    prioridad: taskPriority,
                    fecha_limite: taskDue ? new Date(taskDue).toISOString() : null,
                    cliente_id: taskClientId ? Number(taskClientId) : null,
                    radicado_id: taskRadicadoId ? Number(taskRadicadoId) : null,
                    actuacion_id: taskActuationId ? Number(taskActuationId) : null,
                  }
                );

                if (ok) {
                  setTaskTitle("");
                  setTaskDescription(""); setTaskPriority("MEDIA"); setTaskDue(""); setTaskClientId(""); setTaskRadicadoId(""); setTaskActuationId("");
                  setShowTaskModal(false);
                }
              }}
            >
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
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
                <label className="block text-sm font-medium text-[var(--foreground)]">Descripción<textarea rows={3} maxLength={4000} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-[var(--foreground)]">Prioridad<select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></select></label>
                  <label className="block text-sm font-medium text-[var(--foreground)]">Fecha límite<input type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
                </div>
                <label className="block text-sm font-medium text-[var(--foreground)]">Radicado<select value={taskRadicadoId} onChange={(event) => { setTaskRadicadoId(event.target.value); setTaskActuationId(""); }} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Solo proceso</option>{process.radicados.map((item) => <option key={item.id} value={item.id}>{item.numero}</option>)}</select></label>
                <label className="block text-sm font-medium text-[var(--foreground)]">Actuación<select value={taskActuationId} onChange={(event) => { const value = event.target.value; setTaskActuationId(value); const found = availableActuations.find((item) => item.id === Number(value)); if (found) setTaskRadicadoId(String(found.radicado_id)); }} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Sin actuación específica</option>{availableActuations.filter((item) => !taskRadicadoId || item.radicado_id === Number(taskRadicadoId)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label className="block text-sm font-medium text-[var(--foreground)] sm:col-span-2">Asignar al cliente<select value={taskClientId} onChange={(event) => setTaskClientId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Tarea interna del despacho</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select><span className="mt-1 block text-xs font-normal text-[var(--foreground-muted)]">Al asignarle la tarea, será visible en su portal y se notificará según los canales habilitados para su cuenta.</span></label>
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
                  disabled={working || !taskTitle.trim() || (Boolean(taskActuationId) && !taskRadicadoId)}
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
