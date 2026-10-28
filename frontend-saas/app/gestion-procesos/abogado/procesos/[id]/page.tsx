"use client";

import { apiRequest, TOKEN_EN_COOKIE } from "@/lib/api";
import { iniciarWorkflowConsultaRadicado } from "@/lib/api";
import ProcessContracts from "@/components/contracts/ProcessContracts";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { formatDate, formatRelative, isOverdue, toDate } from "@/lib/labels";
import { useNow } from "@/lib/useNow";
import { Button } from "@/components/ui/Button";
import { CabeceraExpediente } from "@/components/expediente/CabeceraExpediente";
import { FoliosExpediente } from "@/components/expediente/FoliosExpediente";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ArrowLeft,
  CalendarDays,
  ListChecks,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Bell,
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
  whatsapp_numero?: string;
  genero?: string | null;
  numero_documento?: string | null;
  domicilio?: string | null;
  direccion?: string | null;
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
    estado: string;
    documentos_requeridos: { id: string; nombre: string; estado: string; documento?: { id: number; nombre_archivo: string; estado_revision: string; comentario_revision?: string | null; created_at: string } | null }[];
  }[];
  documentos: {
    id: number;
    solicitud_id?: number | null;
    solicitud_item_id?: string | null;
    contrato_id?: number | null;
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
    apiRequest(`/api/radicados?resumen=true`, { headers: authHeaders }),
  ]);
  const [processData, clientData, radicadoData] = await Promise.all([
    detail.json(), clients.json(), radicados.json(),
  ]);
  if (!detail.ok || !clients.ok || !radicados.ok) {
    throw new Error(processData.detail || clientData.detail || radicadoData.detail || "No fue posible cargar el proceso.");
  }
  return { processData, clientData, radicadoData };
}

export default function ProcesoDetallePage({ section }: { section?: string }) {
  const { id } = useParams<{ id: string }>();

  const [process, setProcess] = useState<Process | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allRadicados, setAllRadicados] = useState<SimpleRadicado[]>([]);

  const [editingInfo, setEditingInfo] = useState(false);
  const now = useNow();
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
  const [documentItems, setDocumentItems] = useState("");
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
  const [activeTab, setActiveTab] = useState(section || "resumen");
  const [contractFocusId, setContractFocusId] = useState<number | null>(null);
  const [folioInicial, setFolioInicial] = useState<number | null>(null);
  const [versionFolios, setVersionFolios] = useState(0);

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
      Authorization: `Bearer ${TOKEN_EN_COOKIE}`,
    }),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await requestProcessDetail(id, TOKEN_EN_COOKIE);
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
    requestProcessDetail(id, TOKEN_EN_COOKIE)
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
    const syncLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedContractId = Number(params.get("contrato"));
      const requestedFolio = Number(params.get("folio"));
      setFolioInicial(Number.isInteger(requestedFolio) && requestedFolio > 0 ? requestedFolio : null);
      const rawHash = window.location.hash.slice(1);
      let hashTab = "";
      try {
        hashTab = decodeURIComponent(rawHash);
      } catch {
        hashTab = rawHash;
      }
      if (hashTab.startsWith("panel-")) hashTab = hashTab.slice("panel-".length);
      const requestedTab = hashTab || params.get("tab") || (requestedContractId > 0 ? "contratos" : section || "resumen");
      const validTabs = ["resumen", "folios", "relaciones", "agenda", "tareas", "documentos", "contratos", "comunicaciones", "equipo"];
      // "actividad" era la línea de tiempo que hoy son los folios; los enlaces viejos siguen sirviendo.
      const pedida = requestedTab === "actividad" ? "folios" : requestedTab;
      const nextTab = validTabs.includes(pedida) ? pedida : "resumen";
      setActiveTab(nextTab);
      setContractFocusId(Number.isInteger(requestedContractId) && requestedContractId > 0 ? requestedContractId : null);
      if (hashTab) {
        window.setTimeout(() => document.getElementById(`panel-${nextTab}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    };
    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, [id, section]);

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
            TOKEN_EN_COOKIE,
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
    if (item.recurso === "Agenda") return `/gestion-procesos/abogado/procesos/${id}/agenda`;
    if (item.recurso === "Comunicación" || item.recurso === "Nota interna") return `/gestion-procesos/abogado/procesos/${id}/comunicaciones`;
    return `/gestion-procesos/abogado/procesos/${id}/resumen`;
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

  const overview = useMemo(() => {
    const tasks = process?.tareas ?? [];
    const openTasks = tasks.filter((task) => task.estado === "PENDIENTE" || task.estado === "EN_CURSO");
    const agenda = [
      ...openTasks
        .filter((task) => task.fecha_limite)
        .map((task) => ({
          key: `tarea-${task.id}`,
          kind: "tarea" as const,
          title: task.titulo,
          detail: [task.responsable, task.prioridad === "URGENTE" || task.prioridad === "ALTA" ? `Prioridad ${task.prioridad.toLowerCase()}` : null].filter(Boolean).join(" · ") || "Tarea",
          date: task.fecha_limite as string,
          overdue: isOverdue(task.fecha_limite, task.estado, now),
          href: `/gestion-procesos/abogado/tareas/${task.id}`,
        })),
      ...(process?.eventos ?? [])
        .filter((event) => event.estado === "PROGRAMADO" && (toDate(event.fecha_inicio)?.getTime() ?? 0) >= now)
        .map((event) => ({
          key: `evento-${event.id}`,
          kind: "evento" as const,
          title: event.titulo,
          detail: [event.tipo === "AUDIENCIA" ? "Audiencia" : event.tipo === "REUNION" ? "Reunión" : "Evento", event.cliente].filter(Boolean).join(" · "),
          date: event.fecha_inicio,
          overdue: false,
          href: `/gestion-procesos/abogado/procesos/${id}/agenda`,
        })),
    ]
      .sort((left, right) => (toDate(left.date)?.getTime() ?? 0) - (toDate(right.date)?.getTime() ?? 0))
      .slice(0, 6);
    const actuations = (process?.radicados ?? [])
      .flatMap((radicado) => radicado.actuaciones.map((actuacion, position) => ({ ...actuacion, position, radicadoId: radicado.id, radicado: radicado.numero, fecha: actuacion.fecha_actuacion })))
      // La API las entrega de la más reciente a la más antigua; la posición desempata fechas iguales.
      .sort((left, right) => String(right.fecha ?? "").localeCompare(String(left.fecha ?? "")) || left.position - right.position)
      .slice(0, 5);
    return {
      openTasks,
      overdueTasks: openTasks.filter((task) => isOverdue(task.fecha_limite, task.estado, now)).length,
      toReview: (process?.documentos ?? []).filter((document) => !document.contrato_id && ["RECIBIDO", "EN_REVISION"].includes(document.estado_revision)).length,
      pendingRequests: (process?.solicitudes_documento ?? []).filter((request) => !request.atendida_en),
      agenda,
      actuations,
    };
  }, [id, now, process]);

  const processSections: { id: string; label: string }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "folios", label: "Folios" },
    { id: "relaciones", label: "Clientes y radicados" },
    { id: "agenda", label: "Agenda" },
    { id: "tareas", label: "Tareas" },
    { id: "documentos", label: "Documentos" },
    { id: "contratos", label: "Contratos" },
    { id: "comunicaciones", label: "Chat" },
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
    <div className="motion-swap space-y-5 pb-24">
      {/* TOAST */}
      {notice && (
        <div className="motion-toast-in fixed right-4 top-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-emerald-500/20 bg-[var(--surface)] px-4 py-3 text-sm shadow-xl">
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

      <CabeceraExpediente procesoId={Number(id)} nombre={process.nombre} onCambio={() => setVersionFolios((v) => v + 1)} />

      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
            <p className="hidden border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted lg:block">
              Secciones del expediente
            </p>
            <nav aria-label="Subpáginas del proceso" className="flex snap-x gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
              {processSections.map((item) => (
                <Link
                  key={item.id}
                  href={`/gestion-procesos/abogado/procesos/${id}/${item.id}`}
                  aria-current={activeTab === item.id ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors lg:w-full ${
                    activeTab === item.id
                      ? "bg-brand-900 text-white shadow-xs font-semibold"
                      : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${
                      activeTab === item.id ? "bg-white" : "bg-border-strong"
                    }`}
                  />
                  <span className="whitespace-nowrap lg:whitespace-normal">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">

      {process.admite_colaboradores && (
        <section id="panel-equipo" role="region" aria-label="Equipo del proceso" style={{ display: activeTab === "equipo" ? undefined : "none" }} className="motion-tab-panel space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
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
              <button type="submit" disabled={working || !selectedColleagueId} className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold !text-white disabled:opacity-50"><UserPlus className="size-4" />Agregar abogado</button>
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

      {/* RESUMEN */}
      <div id="panel-resumen" role="region" aria-label="Resumen del proceso" style={{ display: activeTab === "resumen" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 space-y-4">
        <SummaryStrip
          items={[
            { key: "abiertas", label: "Tareas abiertas", value: overview.openTasks.length },
            { key: "vencidas", label: "Tareas vencidas", value: overview.overdueTasks, tone: overview.overdueTasks ? "danger" : "default" },
            { key: "documentos", label: "Documentos por revisar", value: overview.toReview, tone: overview.toReview ? "warning" : "default" },
            { key: "cliente", label: "Pendiente del cliente", value: overview.pendingRequests.length, tone: overview.pendingRequests.length ? "warning" : "default" },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <OverviewCard
              title="Próximos vencimientos"
              action={<Link href={`/gestion-procesos/abogado/procesos/${id}/tareas`} className="text-xs font-semibold text-primary hover:underline">Ver tareas</Link>}
            >
              {overview.agenda.length ? (
                <ul className="divide-y divide-border">
                  {overview.agenda.map((item) => (
                    <li key={item.key}>
                      <Link href={item.href} className="flex items-center gap-3 py-2.5 hover:text-primary">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] ${item.overdue ? "bg-danger-light text-danger" : "bg-primary-light text-primary"}`}>
                          {item.kind === "evento" ? <CalendarDays aria-hidden="true" className="size-4" /> : <ListChecks aria-hidden="true" className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                          <span className="block truncate text-xs text-foreground-muted">{item.detail}</span>
                        </span>
                        <span className={`shrink-0 text-right text-xs ${item.overdue ? "font-semibold text-danger" : "text-foreground-secondary"}`}>
                          {item.overdue ? "Venció " : ""}{formatDate(item.date)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-foreground-muted">No hay tareas abiertas con fecha ni audiencias programadas.</p>}
            </OverviewCard>

            <OverviewCard
              title="Últimas actuaciones judiciales"
              action={process.radicados.length > 0 ? <Link href={`/gestion-procesos/abogado/procesos/${id}/relaciones`} className="text-xs font-semibold text-primary hover:underline">Ver radicados</Link> : undefined}
            >
              {overview.actuations.length ? (
                <ul className="divide-y divide-border">
                  {overview.actuations.map((item) => (
                    <li key={item.id}>
                      <Link href={`/gestion-procesos/abogado/radicados/${item.radicadoId}`} className="block py-2.5 hover:text-primary">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-foreground">{item.actuacion || "Actuación judicial"}</span>
                          <span className="shrink-0 text-xs text-foreground-muted">{item.fecha || "Sin fecha"}</span>
                        </span>
                        <span className="block truncate font-mono text-xs text-foreground-muted">{item.radicado}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground-muted">
                  {process.radicados.length ? "Aún no hay actuaciones registradas." : "Este proceso no tiene radicados. Asócialos en Clientes y radicados."}
                </p>
              )}
            </OverviewCard>

            <OverviewCard
              title="Actividad reciente"
              action={<Link href={`/gestion-procesos/abogado/procesos/${id}/folios`} className="text-xs font-semibold text-primary hover:underline">Ver todo</Link>}
            >
              {process.timeline.length ? (
                <ol className="space-y-3">
                  {process.timeline.slice(0, 5).map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.visibilidad === "CLIENTE" ? "bg-success" : "bg-border-strong"}`} />
                      <Link href={timelineResourceHref(item)} className="min-w-0 flex-1 hover:text-primary">
                        <span className="block truncate text-sm font-medium text-foreground">{item.titulo}</span>
                        <span className="block truncate text-xs text-foreground-muted">{[item.actor, item.fecha ? formatRelative(item.fecha, now) : null].filter(Boolean).join(" · ")}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-foreground-muted">Aún no hay actividad registrada.</p>}
            </OverviewCard>
          </div>

          <div className="min-w-0 space-y-4">
            <OverviewCard
              title="Datos del proceso"
              action={!editingInfo && (
                <button type="button" onClick={() => setEditingInfo(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  <Pencil aria-hidden="true" className="size-3.5" />Editar
                </button>
              )}
            >
              {editingInfo ? (
                <form
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void action(`/api/expedientes/procesos/${id}`, "PUT", { nombre, descripcion }).then((saved) => { if (saved) setEditingInfo(false); });
                  }}
                  className="space-y-3"
                >
                  <label className="block text-xs font-medium text-foreground-muted">
                    Nombre del proceso
                    <input value={nombre} onChange={(event) => setNombre(event.target.value)} required className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </label>
                  <label className="block text-xs font-medium text-foreground-muted">
                    Descripción
                    <textarea rows={4} maxLength={4000} value={descripcion} onChange={(event) => setDescripcion(event.target.value)} className="mt-1 w-full resize-y rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setNombre(process.nombre); setDescripcion(process.descripcion || ""); setEditingInfo(false); }}>Cancelar</Button>
                    <Button type="submit" size="sm" loading={working} icon={<Save className="size-4" />}>Guardar</Button>
                  </div>
                </form>
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-foreground-muted">Descripción</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-foreground-secondary">{process.descripcion || "Sin descripción."}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Responsable</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{process.responsable.nombre_completo}</dd>
                  </div>
                  {process.colaboradores.length > 0 && (
                    <div>
                      <dt className="text-xs text-foreground-muted">Equipo</dt>
                      <dd className="mt-0.5 text-foreground-secondary">{process.colaboradores.map((member) => member.nombre_completo).join(", ")}</dd>
                    </div>
                  )}
                </dl>
              )}
            </OverviewCard>

            <OverviewCard
              title="Clientes"
              action={<Link href={`/gestion-procesos/abogado/procesos/${id}/relaciones`} className="text-xs font-semibold text-primary hover:underline">Gestionar</Link>}
            >
              {process.clientes.length ? (
                <ul className="space-y-3">
                  {process.clientes.map((client) => (
                    <li key={client.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/gestion-procesos/abogado/clientes/${client.id}`} className="block truncate text-sm font-semibold text-foreground hover:text-primary">{client.nombre_completo}</Link>
                        <p className="truncate text-xs text-foreground-muted">{client.email}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Link href={`/gestion-procesos/abogado/chat/${process.id}/${client.id}`} aria-label={`Chat con ${client.nombre_completo}`} title="Chat" className="grid size-8 place-items-center rounded-[var(--radius-md)] border border-border text-foreground-secondary hover:bg-surface-hover"><MessageCircle aria-hidden="true" className="size-4" /></Link>
                        <a href={`mailto:${client.email}`} aria-label={`Escribir a ${client.nombre_completo}`} title="Correo" className="grid size-8 place-items-center rounded-[var(--radius-md)] border border-border text-foreground-secondary hover:bg-surface-hover"><Mail aria-hidden="true" className="size-4" /></a>
                        {client.whatsapp_numero && <a href={`tel:${client.whatsapp_numero}`} aria-label={`Llamar a ${client.nombre_completo}`} title="Llamar" className="grid size-8 place-items-center rounded-[var(--radius-md)] border border-border text-foreground-secondary hover:bg-surface-hover"><Phone aria-hidden="true" className="size-4" /></a>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-foreground-muted">Sin clientes vinculados.</p>}
            </OverviewCard>

            <OverviewCard
              title="Pendiente del cliente"
              action={<Link href={`/gestion-procesos/abogado/documentos?proceso=${id}`} className="text-xs font-semibold text-primary hover:underline">Documentos</Link>}
            >
              {overview.pendingRequests.length ? (
                <ul className="space-y-2.5">
                  {overview.pendingRequests.map((request) => {
                    const delivered = request.documentos_requeridos.filter((item) => item.documento).length;
                    return (
                      <li key={request.id}>
                        <Link href={`/gestion-procesos/abogado/documentos?proceso=${id}#solicitud-${request.id}`} className="block hover:text-primary">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{request.titulo}</span>
                            <span className="shrink-0 text-xs tabular-nums text-foreground-muted">{delivered}/{request.documentos_requeridos.length}</span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-hover">
                            <span className="block h-full rounded-full bg-warning" style={{ width: `${(delivered / Math.max(1, request.documentos_requeridos.length)) * 100}%` }} />
                          </span>
                          <span className="mt-1 block text-xs text-foreground-muted">{request.cliente}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-foreground-muted">El cliente no tiene documentos pendientes.</p>}
            </OverviewCard>
          </div>
        </div>
      </div>

      {/* CLIENTES + RADICADOS */}
      <div id="panel-relaciones" role="region" aria-label="Clientes y radicados" style={{ display: activeTab === "relaciones" ? undefined : "none" }} className="motion-tab-panel grid gap-5 xl:grid-cols-2">
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

      <section id="panel-agenda" role="region" aria-label="Agenda del proceso" style={{ display: activeTab === "agenda" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div><h2 className="text-sm font-semibold text-[var(--foreground)]">Agenda del proceso</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Audiencias, reuniones y eventos asociados a este expediente.</p></div><button type="button" onClick={() => openAgendaEvent()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold !text-white"><Plus className="size-4" />Agendar actividad</button></header>
        {process.eventos.length ? <div className="divide-y divide-[var(--border)]">{process.eventos.map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{event.tipo === "AUDIENCIA" ? "Audiencia" : event.tipo === "REUNION" ? "Reunión" : "Evento"}: {event.titulo}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">{new Date(event.fecha_inicio).toLocaleString("es-CO", { timeZone: "America/Bogota" })} · {event.estado.replaceAll("_", " ")}{event.cliente ? ` · ${event.cliente}` : ""}</p></div><div className="flex gap-3 text-xs"><button type="button" onClick={() => openAgendaEvent(event)} className="text-[var(--primary)] hover:underline">Editar</button><button type="button" onClick={() => { if (window.confirm(`¿Eliminar ${event.titulo} de la agenda?`)) void action(`/api/expedientes/agenda/eventos/${event.id}`, "DELETE"); }} className="text-red-600 hover:underline">Eliminar</button></div></article>)}</div> : <p className="px-5 py-8 text-center text-sm text-[var(--foreground-muted)]">No hay actividades programadas para este proceso.</p>}
      </section>

      <section id="panel-folios" role="region" aria-label="Folios del expediente" style={{ display: activeTab === "folios" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 overflow-hidden rounded-xl bg-sheet shadow-sheet">
        {activeTab === "folios" && <FoliosExpediente key={`${folioInicial ?? 0}-${versionFolios}`} procesoId={Number(id)} folioInicial={folioInicial ?? undefined} />}
      </section>

      {/* MÓDULOS SECUNDARIOS */}
      <div className="grid gap-5">
        {/* TAREAS */}
        <section id="panel-tareas" role="region" aria-label="Tareas del proceso" style={{ display: activeTab === "tareas" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
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
        <section id="panel-documentos" role="region" aria-label="Documentos del proceso" style={{ display: activeTab === "documentos" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]"><FileText className="size-4" /></div>
              <div><h2 className="text-sm font-semibold text-[var(--foreground)]">Documentos</h2><p className="text-xs text-[var(--foreground-muted)]">{process.solicitudes_documento.length} solicitudes · {process.documentos.filter((document) => !document.contrato_id).length} archivos recibidos</p></div>
            </div>
            <button type="button" disabled={!process.clientes.length || working} onClick={() => { setDocumentTitle(""); setDocumentItems(""); setDocumentInstructions(""); setDocumentClientId(String(process.clientes[0]?.id ?? "")); setShowDocumentRequestModal(true); }} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"><Plus className="size-4" />Solicitar</button>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Solicitudes y carpetas</h3>
              {process.solicitudes_documento.length ? <div className="space-y-3">{process.solicitudes_documento.map((request) => {
                const requestedDocuments = process.documentos.filter((document) => !document.contrato_id && document.solicitud_id === request.id);
                return <div key={request.id} id={`solicitud-${request.id}`} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3">
                    <div className="min-w-0"><p className="text-sm font-semibold text-[var(--foreground)]">{request.titulo}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Cliente: {request.cliente} · {requestedDocuments.length} archivo{requestedDocuments.length === 1 ? "" : "s"} recibido{requestedDocuments.length === 1 ? "" : "s"}</p>{request.instrucciones && <p className="mt-2 text-sm text-[var(--foreground-muted)]">{request.instrucciones}</p>}</div>
                    <div className="flex items-center gap-2"><span className="rounded-md bg-[var(--primary-light)] px-2 py-1 text-[10px] font-medium text-[var(--primary)]">{request.estado.replaceAll("_", " ")}</span><Link href={`/gestion-procesos/abogado/documentos?proceso=${id}#solicitud-${request.id}`} className="text-xs font-medium text-[var(--primary)] hover:underline">Abrir carpeta</Link><button type="button" disabled={working} onClick={() => { if (window.confirm(`¿Eliminar la solicitud ${request.titulo}? El cliente dejará de verla; los archivos ya cargados se conservan en el proceso.`)) void action(`/api/expedientes/solicitudes-documento/${request.id}`, "DELETE"); }} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">Eliminar</button></div>
                  </div>
                  <div className="divide-y divide-[var(--border)] px-4">
                    {request.documentos_requeridos.map((item) => {
                      const submitted = process.documentos.filter((document) => !document.contrato_id && document.solicitud_id === request.id && document.solicitud_item_id === item.id);
                      return <div key={item.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium text-[var(--foreground)]">{item.nombre}</p><p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{item.estado.replaceAll("_", " ")}</p></div><span className="text-xs text-[var(--foreground-muted)]">{submitted.length} archivo{submitted.length === 1 ? "" : "s"}</span></div>
                        {submitted.length ? <div className="mt-2 space-y-2">{submitted.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--foreground)]">{item.nombre}</p><p className="truncate text-xs text-[var(--foreground-muted)]">Archivo: {document.nombre_archivo} · {document.cliente} · {new Date(document.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} · {document.estado_revision.replaceAll("_", " ")}</p>{document.comentario_revision && <p className="mt-1 text-xs text-amber-700">Observación: {document.comentario_revision}</p>}</div></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void openDocumentPreview(document)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-50">{downloadingDocumentId === document.id ? "Abriendo…" : "Previsualizar y revisar"}</button><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void downloadDocument(document.id, document.nombre_archivo)} aria-label={`Descargar ${item.nombre}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50">{downloadingDocumentId === document.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{downloadingDocumentId === document.id ? "Descargando…" : "Descargar"}</button></div></div>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground-muted)]">Pendiente de entrega.</p>}
                      </div>;
                    })}
                    {requestedDocuments.filter((document) => !document.solicitud_item_id || !request.documentos_requeridos.some((item) => item.id === document.solicitud_item_id)).map((document) => <div key={`legacy-${document.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--foreground)]">Documento de esta solicitud</p><p className="truncate text-xs text-[var(--foreground-muted)]">Archivo: {document.nombre_archivo} · {document.cliente} · {new Date(document.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} · {document.estado_revision.replaceAll("_", " ")}</p></div></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void openDocumentPreview(document)} className="rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-2 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-50">Previsualizar y revisar</button><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void downloadDocument(document.id, document.nombre_archivo)} aria-label={`Descargar ${request.titulo}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"><Download className="size-3.5" />Descargar</button></div></div>)}
                  </div>
                </div>;
              })}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">No hay solicitudes para este proceso.</p>}
            </div>
            <div>
              {(() => {
                const ungroupedDocuments = process.documentos.filter((document) => !document.contrato_id && (!document.solicitud_id || !process.solicitudes_documento.some((request) => request.id === document.solicitud_id)));
                return <>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Otros documentos</h3>
                  {ungroupedDocuments.length ? <div className="space-y-2">{ungroupedDocuments.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-[var(--primary)]" /><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--foreground)]">{document.nombre_archivo}</p><p className="truncate text-xs text-[var(--foreground-muted)]">{document.cliente} · {new Date(document.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} · {document.estado_revision.replaceAll("_", " ")}</p><Link href={`/gestion-procesos/abogado/documentos?proceso=${id}#documento-${document.id}`} className="mt-1 inline-block text-xs font-medium text-[var(--primary)] hover:underline">Abrir documento</Link></div></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void openDocumentPreview(document)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs hover:bg-[var(--surface-hover)] disabled:opacity-50">{downloadingDocumentId === document.id ? "Abriendo…" : "Previsualizar y revisar"}</button><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void downloadDocument(document.id, document.nombre_archivo)} aria-label={`Descargar ${document.nombre_archivo}`} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50">{downloadingDocumentId === document.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{downloadingDocumentId === document.id ? "Descargando…" : "Descargar"}</button></div></div>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Los contratos se consultan en la sección Contratos. No hay otros documentos sin solicitud.</p>}
                </>;
              })()}
            </div>
          </div>
        </section>

        {/* CONTRATOS */}
        <section id="panel-contratos" role="region" aria-label="Contratos del proceso" style={{ display: activeTab === "contratos" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <ProcessContracts processId={process.id} clients={process.clientes} onChange={load} initialContractId={contractFocusId} />
        </section>

        {/* NOTIFICACIONES */}
        <section id="panel-comunicaciones" role="region" aria-label="Chat del proceso" style={{ display: activeTab === "comunicaciones" ? undefined : "none" }} className="motion-tab-panel scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Bell className="size-4" />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Chat y comunicaciones anteriores
                </h2>

                <p className="text-xs text-[var(--foreground-muted)]">
                  Conversaciones rápidas con clientes y equipo de trabajo
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-5 py-3">
            {process.clientes.map((client) => <Link key={client.id} href={`/gestion-procesos/abogado/chat/${process.id}/${client.id}`} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold !text-white">Chat con {client.nombre_completo}</Link>)}
            <Link href={`/gestion-procesos/abogado/chat/${process.id}/colaboradores`} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold">Chat de colaboradores</Link>
          </div>

          <div className="space-y-4 p-4">
            <form onSubmit={(event) => void saveCommunication(event)} className="hidden space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Registrar comunicación</h3>
              <label className="block text-xs font-medium">Visibilidad<select value={communicationVisibility} onChange={(event) => { setCommunicationVisibility(event.target.value as "INTERNA" | "CLIENTE"); setCommunicationClientId(""); }} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option value="INTERNA">Nota solo para el equipo</option><option value="CLIENTE">Mensaje visible en el portal del cliente</option></select></label>
              {communicationVisibility === "CLIENTE" && <label className="block text-xs font-medium">Cliente<select required value={communicationClientId} onChange={(event) => setCommunicationClientId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option value="">Selecciona cliente</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>}
              <label className="block text-xs font-medium">Asunto<input required maxLength={255} value={communicationSubject} onChange={(event) => setCommunicationSubject(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
              <label className="block text-xs font-medium">Contenido<textarea required maxLength={12000} rows={3} value={communicationBody} onChange={(event) => setCommunicationBody(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
              <button type="submit" disabled={working || !communicationSubject.trim() || !communicationBody.trim() || (communicationVisibility === "CLIENTE" && !communicationClientId)} className="rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold !text-white disabled:opacity-50">Guardar en el expediente</button>
              <p className="text-[10px] text-[var(--foreground-muted)]">El registro queda trazable; no envía correos ni WhatsApp automáticamente.</p>
            </form>
            <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Historial</h3>{process.comunicaciones.length ? <div className="space-y-2">{process.comunicaciones.map((item) => <article key={item.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{item.asunto}</p><span className={`rounded-full px-2 py-1 text-[10px] ${item.visibilidad === "CLIENTE" ? "bg-emerald-500/10 text-emerald-700" : "bg-slate-500/10 text-slate-600"}`}>{item.visibilidad === "CLIENTE" ? `Visible para ${item.cliente || "cliente"}` : "Interna"}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground-secondary)]">{item.contenido}</p><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">{item.actor || "Equipo"} · {new Date(item.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p></article>)}</div> : <p className="text-xs text-[var(--foreground-muted)]">No hay comunicaciones registradas.</p>}</div>
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
                <button type="submit" disabled={working || !notificationActuationId || !notificationClientId} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium !text-white disabled:opacity-50"><Bell className="size-3.5" />Enviar aviso</button>
              </form>
            ) : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Asigna un cliente y registra una actuación para habilitar los avisos.</p>}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">Enviadas recientemente</h3>
              {process.notificaciones.length ? <div className="space-y-2">{process.notificaciones.map((notification) => <article key={notification.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-[var(--foreground)]">{notification.asunto}</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Para {notification.cliente} · {new Date(notification.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p></div><CheckCircle2 className="size-4 shrink-0 text-emerald-600" /></div>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[var(--foreground-secondary)]">{notification.cuerpo}</p>
              </article>)}</div> : <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--foreground-muted)]">Aún no se han enviado notificaciones.</p>}
            </div>
          </div>
        </section>
      </div>
        </div>
      </div>

      {showAgendaModal && <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={(event) => void saveAgendaEvent(event)} className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{editingAgendaId ? "Editar actividad" : "Agendar en este proceso"}</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">La actividad queda vinculada a {process.nombre}.</p></div><button type="button" onClick={() => setShowAgendaModal(false)} aria-label="Cerrar" className="rounded-md p-1 hover:bg-[var(--surface-secondary)]"><X className="size-5" /></button></header><label className="block text-sm font-medium">Título<input required maxLength={255} value={agendaTitle} onChange={(event) => setAgendaTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Tipo<select value={agendaType} onChange={(event) => setAgendaType(event.target.value as typeof agendaType)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="AUDIENCIA">Audiencia</option><option value="REUNION">Reunión</option><option value="FIRMA_CONTRATO">Firma de contrato</option><option value="EVENTO">Evento</option></select></label><label className="block text-sm font-medium">Estado<select value={agendaStatus} onChange={(event) => setAgendaStatus(event.target.value as typeof agendaStatus)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="PROGRAMADO">Programado</option><option value="COMPLETADO">Completado</option><option value="CANCELADO">Cancelado</option></select></label></div><label className="block text-sm font-medium">Fecha y hora<input required type="datetime-local" value={agendaDate} onChange={(event) => setAgendaDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><label className="block text-sm font-medium">Cliente (opcional)<select value={agendaClientId} onChange={(event) => setAgendaClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Solo equipo interno</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>{agendaType === "FIRMA_CONTRATO" && <label className="block text-sm font-medium">Contrato<select required value={agendaContractId} onChange={(event) => setAgendaContractId(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Selecciona contrato para la firma</option>{process.contratos.filter((contract) => ["LISTO_PARA_FIRMA", "EN_FIRMA"].includes(contract.estado) || (editingAgendaId !== null && process.eventos.some((item) => item.id === editingAgendaId && item.contrato_id === contract.id))).map((contract) => <option key={contract.id} value={contract.id}>Contrato #{contract.id} · {contract.cliente} · {contract.estado}</option>)}</select><span className="mt-1 block text-xs text-[var(--foreground-muted)]">El cliente debe ser el mismo que figura en el contrato.</span></label>}<label className="block text-sm font-medium">Descripción<textarea rows={3} maxLength={4000} value={agendaDescription} onChange={(event) => setAgendaDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4"><button type="button" disabled={working} onClick={() => setShowAgendaModal(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button><button type="submit" disabled={working || !agendaTitle.trim() || !agendaDate || (agendaType === "FIRMA_CONTRATO" && (!agendaContractId || !agendaClientId))} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold !text-white disabled:opacity-50">Guardar actividad</button></div></form></div>}

      {showDocumentRequestModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="document-request-title" className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form onSubmit={async (event) => { event.preventDefault(); const ok = await action(`/api/expedientes/procesos/${id}/solicitudes-documento`, "POST", { cliente_id: Number(documentClientId), titulo: documentTitle.trim(), documentos: documentItems.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), instrucciones: documentInstructions.trim() || null }); if (ok) setShowDocumentRequestModal(false); }} className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="document-request-title" className="text-base font-semibold text-[var(--foreground)]">Solicitar documento</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">La solicitud se mostrará al cliente asignado a este proceso.</p></div><button type="button" aria-label="Cerrar" onClick={() => setShowDocumentRequestModal(false)} className="rounded-md p-1 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"><X className="size-5" /></button></div>
            <label className="block text-sm font-medium text-[var(--foreground)]">Cliente<select required value={documentClientId} onChange={(event) => setDocumentClientId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="">Selecciona un cliente</option>{process.clientes.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>
            <label className="block text-sm font-medium text-[var(--foreground)]">Nombre de la solicitud<input required maxLength={255} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Documentos para la demanda" className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
            <label className="block text-sm font-medium text-[var(--foreground)]">Documentos requeridos <span className="font-normal text-[var(--foreground-muted)]">(uno por línea)</span><textarea required rows={5} value={documentItems} onChange={(event) => setDocumentItems(event.target.value)} placeholder={"Copia de la cédula\nRegistro civil\nCertificado de residencia"} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
            <label className="block text-sm font-medium text-[var(--foreground)]">Instrucciones<textarea rows={3} value={documentInstructions} onChange={(event) => setDocumentInstructions(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label>
            <footer className="flex justify-end gap-2 border-t border-[var(--border)] pt-4"><button type="button" disabled={working} onClick={() => setShowDocumentRequestModal(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)]">Cancelar</button><button type="submit" disabled={working || !documentClientId || !documentTitle.trim() || !documentItems.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium !text-white disabled:opacity-50">{working && <Loader2 className="size-4 animate-spin" />}Enviar solicitud</button></footer>
          </form>
        </div>
      )}

      {documentPreview && (
        <div role="dialog" aria-modal="true" aria-labelledby="document-preview-title" className="motion-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
          <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6"><div className="min-w-0"><h2 id="document-preview-title" className="truncate font-semibold">{documentPreview.name}</h2><p className="text-xs text-[var(--foreground-muted)]">Vista del documento · {documentPreview.estado.replaceAll("_", " ")}</p></div><button type="button" onClick={closeDocumentPreview} aria-label="Cerrar vista del documento" className="rounded-md p-2 hover:bg-[var(--surface-secondary)]"><X className="size-5" /></button></header>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-6">
              <div className="grid min-h-[40vh] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] lg:min-h-[65vh]">{documentPreview.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo con URL temporal (blob o R2) que next/image no puede optimizar.
                <img src={documentPreview.url} alt={documentPreview.name} className="max-h-[72vh] max-w-full object-contain" />
              ) : documentPreview.mimeType === "application/pdf" ? <iframe title={`Vista previa de ${documentPreview.name}`} src={documentPreview.url} className="h-[65vh] w-full" /> : <p className="p-8 text-center text-sm text-[var(--foreground-muted)]">Este tipo de archivo no admite vista previa. Descárgalo para revisarlo.</p>}</div>
              <aside className="space-y-4"><label className="block text-sm font-medium">Estado de revisión<select value={documentPreview.estado} onChange={(event) => setDocumentPreview({ ...documentPreview, estado: event.target.value })} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5"><option value="RECIBIDO">Recibido</option><option value="EN_REVISION">En revisión</option><option value="APROBADO">Aprobado</option><option value="REQUIERE_CORRECCION">Requiere corrección</option><option value="RECHAZADO">Rechazado</option></select></label><label className="block text-sm font-medium">Comentario para el historial<textarea rows={6} maxLength={4000} value={documentPreview.comentario} onChange={(event) => setDocumentPreview({ ...documentPreview, comentario: event.target.value })} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5" /></label><button type="button" onClick={() => void saveDocumentReview()} disabled={documentReviewSaving} className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold !text-white disabled:opacity-50">{documentReviewSaving ? "Guardando…" : "Guardar revisión"}</button><button type="button" disabled={downloadingDocumentId !== null} onClick={() => void downloadDocument(documentPreview.id, documentPreview.name)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm disabled:opacity-50">{downloadingDocumentId === documentPreview.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{downloadingDocumentId === documentPreview.id ? "Descargando…" : "Descargar archivo"}</button><p className="text-xs leading-5 text-[var(--foreground-muted)]">Solicitar corrección devuelve la solicitud al estado pendiente para que el cliente vuelva a cargar el archivo.</p></aside>
            </div>
          </section>
        </div>
      )}

      {/* MODAL CLIENTE */}
      {showClientModal && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
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
                <button type="submit" disabled={working || !newClientName.trim() || !newClientEmail.trim() || newClientPassword.length < 8 || (newClientChannel === "WHATSAPP" && !newClientWhatsapp.trim())} className="w-full rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold !text-white disabled:opacity-50">{working ? "Creando y asociando…" : "Crear, enviar acceso y asociar"}</button>
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
        <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
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
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white disabled:opacity-50"
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
        <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
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
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white disabled:opacity-50"
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

function OverviewCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-xs)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
