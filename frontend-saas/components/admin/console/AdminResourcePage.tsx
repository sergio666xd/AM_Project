"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  FileText,
  FolderOpen,
  Copy,
  Download,
  Eye,
  Link2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useNow } from "@/lib/useNow";
import { API_URL, apiRequest, iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge, type StatusTone } from "@/components/ui/Badge";
import { DataTable, type BulkAction, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { Drawer, DetailList } from "@/components/ui/Drawer";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip, type SummaryItem } from "@/components/ui/SummaryStrip";
import {
  consultaLabel,
  formatDate,
  formatDateTime,
  formatRelative,
  healthLabel,
  healthRank,
  isOverdue,
  priorityLabel,
  priorityRank,
  reviewStatusLabel,
  taskStatusLabel,
  toDate,
  toDateTimeLocalInput,
} from "@/lib/labels";

type Sector = "FIRMA" | "SAAS" | "GLOBAL";
type Resource = "procesos" | "radicados" | "tareas" | "documentos";
type Row = Record<string, unknown> & {
  id: number;
  owner_id?: number;
  owner_rol?: string;
  nombre?: string;
  numero?: string;
  titulo?: string;
  nombre_archivo?: string;
  estado?: string;
  estado_revision?: string;
  contrato_id?: number | null;
  comentario_revision?: string | null;
  fecha_limite?: string | null;
  archivado_en?: string | null;
  salud?: string;
  senales_salud?: string[];
};
type User = { id: number; nombre_completo: string; rol: string };
type FormState = {
  owner_id: string;
  nombre: string;
  descripcion: string;
  numero: string;
  titulo: string;
  estado: string;
  prioridad: string;
  fecha_limite: string;
  proceso_id: string;
  radicado_id: string;
  cliente_id: string;
  nombre_archivo: string;
  estado_revision: string;
  comentario_revision: string;
};
type TemporaryLink = {
  url: string;
  expires_at: string;
  expires_in: number;
  nombre_archivo: string;
};
type TaskView = "LISTA" | "KANBAN" | "CALENDARIO";
type DocumentRequest = { id: number; titulo: string; proceso: string; proceso_id: number; cliente: string; cliente_id: number; estado: string; documento: string | null; documento_id: number | null; documentos_requeridos: { id: string; nombre: string; estado: string; archivo: string | null; comentario: string | null; documento_id: number | null }[]; solicitado_en: string; fecha_limite: string | null; atendida_en: string | null };
const labelDocumentRequestStatus = (status: string) => ({ FALTAN_DOCUMENTOS: "Faltan documentos", DOCUMENTOS_SUMINISTRADOS: "Documentos suministrados", EN_REVISION: "En revisión", RECHAZADO: "Rechazado", APROBADO: "Aprobado", VENCIDO: "Vencido" }[status as "FALTAN_DOCUMENTOS" | "DOCUMENTOS_SUMINISTRADOS" | "EN_REVISION" | "RECHAZADO" | "APROBADO" | "VENCIDO"] || status);
const emptyForm: FormState = {
  owner_id: "",
  nombre: "",
  descripcion: "",
  numero: "",
  titulo: "",
  estado: "PENDIENTE",
  prioridad: "MEDIA",
  fecha_limite: "",
  proceso_id: "",
  radicado_id: "",
  cliente_id: "",
  nombre_archivo: "",
  estado_revision: "RECIBIDO",
  comentario_revision: "",
};
const resourceNames: Record<Resource, string> = {
  procesos: "Procesos",
  radicados: "Radicados",
  tareas: "Tareas",
  documentos: "Documentos",
};
const roleNames: Record<string, string> = {
  ABOGADO_ADMIN: "Firma",
  ADMIN: "Firma · Admin",
  ABOGADO: "SaaS",
};

async function adminFetch(url: string, options?: RequestInit) {
  return apiRequest(url, options);
}

async function loadRows(
  resource: Resource,
  sector: Sector,
  archived: boolean,
  token: string,
): Promise<Row[]> {
  const query = new URLSearchParams({ sector });
  if (resource === "procesos") query.set("archivados", String(archived));
  const response = await adminFetch(
    `${API_URL}/api/admin/inventario/${resource}?${query}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.detail || "No fue posible cargar este inventario.");
  return data;
}

async function loadOptions(sector: Sector, token: string) {
  const [userResponse, processResponse, radicadoResponse] = await Promise.all([
    adminFetch(`${API_URL}/api/admin/usuarios`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    adminFetch(`${API_URL}/api/admin/inventario/procesos?sector=${sector}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    adminFetch(`${API_URL}/api/admin/inventario/radicados?sector=${sector}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);
  if (!userResponse.ok || !processResponse.ok || !radicadoResponse.ok)
    throw new Error("No fue posible cargar las opciones del sector.");
  const [userData, processData, radicadoData] = await Promise.all([
    userResponse.json(),
    processResponse.json(),
    radicadoResponse.json(),
  ]);
  const validRoles =
    sector === "SAAS"
      ? ["ABOGADO"]
      : sector === "FIRMA"
        ? ["ABOGADO_ADMIN", "ADMIN"]
        : ["ABOGADO", "ABOGADO_ADMIN", "ADMIN"];
  return {
    owners: (userData as User[]).filter((user) =>
      validRoles.includes(user.rol),
    ),
    clients: (userData as User[]).filter((user) => user.rol === "CLIENTE"),
    processes: processData as {
      id: number;
      nombre: string;
      owner_id: number;
    }[],
    radicados: radicadoData as { id: number; numero: string }[],
  };
}

function fileKind(mime: string) {
  if (!mime) return "Archivo";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Imagen";
  if (mime.includes("word")) return "Word";
  if (mime.includes("sheet") || mime.includes("excel")) return "Excel";
  return mime.split("/").pop()?.toUpperCase() || "Archivo";
}

function requestTone(status: string): StatusTone {
  if (status === "APROBADO") return "completed";
  if (status === "RECHAZADO" || status === "VENCIDO") return "risk";
  if (status === "EN_REVISION" || status === "DOCUMENTOS_SUMINISTRADOS") return "review";
  return "pending";
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(" · ") : "Ninguna";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (
    typeof value === "string" &&
    value.includes("T") &&
    !Number.isNaN(Date.parse(value))
  )
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(new Date(value));
  return String(value);
}

export default function AdminResourcePage({ sector }: { sector: Sector }) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/\/+$/, "");
  const requestsOnly = normalizedPath.endsWith("/documentos/solicitudes");
  const contractsOnly = normalizedPath.endsWith("/documentos/contratos");
  const resource = (requestsOnly || contractsOnly ? "documentos" : normalizedPath.split("/").filter(Boolean).pop()) as Resource;
  const validResource =
    typeof resource === "string" && Object.hasOwn(resourceNames, resource);
  const { token } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [processes, setProcesses] = useState<
    { id: number; nombre: string; owner_id: number }[]
  >([]);
  const [clients, setClients] = useState<
    { id: number; nombre_completo: string }[]
  >([]);
  const [radicados, setRadicados] = useState<{ id: number; numero: string }[]>(
    [],
  );
  const [archived, setArchived] = useState(false);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const now = useNow();
  const [state, setState] = useState("TODOS");
  const [ownerFilter, setOwnerFilter] = useState("TODOS");
  const [processFilter, setProcessFilter] = useState("TODOS");
  const [clientFilter, setClientFilter] = useState("TODOS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailsRow, setDetailsRow] = useState<Row | null>(null);
  const [taskView, setTaskView] = useState<TaskView>("LISTA");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [temporaryLink, setTemporaryLink] = useState<TemporaryLink | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [teamProcess, setTeamProcess] = useState<{
    id: number;
    nombre: string;
    responsable: { id: number; nombre_completo: string };
    colaboradores: { id: number; nombre_completo: string }[];
    abogados_disponibles: { id: number; nombre_completo: string }[];
  } | null>(null);
  const [teamSelection, setTeamSelection] = useState("");
  const [documentRequests, setDocumentRequests] = useState<DocumentRequest[]>([]);
  const [detailRequest, setDetailRequest] = useState<DocumentRequest | null>(null);

  async function reload() {
    if (!token || !validResource) return;
    setLoading(true);
    setError("");
    try {
      const data = await loadRows(resource, sector, archived, token);
      setRows(data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar el inventario.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !validResource) return;
    let active = true;
    Promise.all([
      loadRows(resource, sector, archived, token),
      loadOptions(sector, token),
    ])
      .then(([data, options]) => {
        if (!active) return;
        setRows(data);
        setOwners(options.owners);
        setClients(options.clients);
        setProcesses(options.processes);
        setRadicados(options.radicados);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar el sector.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, resource, sector, archived, validResource]);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("detalle");
    if (!requestedId) return;
    const matchingRow = rows.find((row) => String(row.id) === requestedId);
    if (!matchingRow) return;
    const timer = window.setTimeout(() => setDetailsRow(matchingRow), 0);
    return () => window.clearTimeout(timer);
  }, [rows]);

  useEffect(() => {
    if (!token || resource !== "documentos") return;
    let active = true;
    adminFetch(`${API_URL}/api/admin/documentos/solicitudes?sector=${sector}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "No fue posible cargar las solicitudes documentales.");
        if (active) setDocumentRequests(result);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las solicitudes documentales."); });
    return () => { active = false; };
  }, [token, resource, sector]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const matchesState =
          state === "TODOS" ||
          String(row.estado ?? row.estado_consulta ?? row.salud ?? "") === state;
        const matchesOwner = ownerFilter === "TODOS" || String(row.owner_id ?? row.responsable_id ?? "") === ownerFilter;
        const matchesProcess = processFilter === "TODOS" || String(row.proceso_id ?? "") === processFilter;
        const matchesClient = clientFilter === "TODOS" || String(row.cliente_id ?? "") === clientFilter;
        const rowDate = String(row.fecha_limite ?? row.created_at ?? row.consultado_en ?? "").slice(0, 10);
        const matchesFrom = !dateFrom || (rowDate && rowDate >= dateFrom);
        const matchesTo = !dateTo || (rowDate && rowDate <= dateTo);
        return matchesState && matchesOwner && matchesProcess && matchesClient && matchesFrom && matchesTo;
      }),
    [rows, state, ownerFilter, processFilter, clientFilter, dateFrom, dateTo],
  );
  const routeFiltered = resource === "documentos"
    ? filtered.filter((row) => contractsOnly === Boolean(row.contrato_id))
    : filtered;
  const states = [
    ...new Set([
      rows
        .map((row) => String(row.estado ?? row.estado_consulta ?? row.salud ?? ""))
        .filter(Boolean),
      ...(resource === "documentos" ? documentRequests.map((request) => request.estado) : []),
    ].flat()),
  ];
  // Versión del filtro rápido para tablero y calendario (solo tareas).
  function matchesQuickTaskFilter(row: Row) {
    if (resource !== "tareas" || !quickFilter) return true;
    const open = row.estado === "PENDIENTE" || row.estado === "EN_CURSO";
    const due = row.fecha_limite ? Date.parse(String(row.fecha_limite)) : NaN;
    if (quickFilter === "ABIERTAS") return open;
    if (quickFilter === "VENCIDAS") return open && due < now;
    if (quickFilter === "SEMANA") return open && due >= now && due <= now + 7 * 86400000;
    return row.estado === quickFilter;
  }
  const tasksByState = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"].map((status) => ({
    status,
    rows: routeFiltered.filter((row) => String(row.estado) === status && matchesQuickTaskFilter(row)),
  }));
  const [calendarYear, calendarMonthNumber] = calendarMonth.split("-").map(Number);
  const calendarDays = new Date(Date.UTC(calendarYear, calendarMonthNumber, 0)).getUTCDate();
  const calendarOffset = (new Date(Date.UTC(calendarYear, calendarMonthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const tasksByDueDate = new Map<string, Row[]>();
  for (const row of routeFiltered.filter(matchesQuickTaskFilter)) {
    const due = typeof row.fecha_limite === "string" ? row.fecha_limite.slice(0, 10) : "";
    if (due.startsWith(calendarMonth)) tasksByDueDate.set(due, [...(tasksByDueDate.get(due) ?? []), row]);
  }
  const activeFilterCount = [state, ownerFilter, processFilter, clientFilter].filter((value) => value !== "TODOS").length + (dateFrom || dateTo ? 1 : 0);
  function clearFilters() {
    setState("TODOS");
    setOwnerFilter("TODOS");
    setProcessFilter("TODOS");
    setClientFilter("TODOS");
    setDateFrom("");
    setDateTo("");
    setQuickFilter(null);
  }
  const visibleDocumentRequests = documentRequests.filter((request) =>
    (state === "TODOS" || request.estado === state) &&
    (processFilter === "TODOS" || String(request.proceso_id) === processFilter) &&
    (clientFilter === "TODOS" || String(request.cliente_id) === clientFilter) &&
    (!dateFrom || request.solicitado_en.slice(0, 10) >= dateFrom) &&
    (!dateTo || request.solicitado_en.slice(0, 10) <= dateTo)
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, owner_id: owners[0] ? String(owners[0].id) : "" });
    setDocumentFile(null);
    setError("");
    setFormOpen(true);
  }
  function openEdit(row: Row) {
    setEditing(row);
    setFormOpen(true);
    setForm({
      ...emptyForm,
      owner_id: String(row.owner_id ?? ""),
      nombre: row.nombre ?? "",
      descripcion: String(row.descripcion ?? ""),
      numero: row.numero ?? "",
      titulo: row.titulo ?? "",
      estado: String(row.estado ?? "PENDIENTE"),
      prioridad: String(row.prioridad ?? "MEDIA"),
      fecha_limite: row.fecha_limite
        ? toDateTimeLocalInput(String(row.fecha_limite))
        : "",
      proceso_id: String(row.proceso_id ?? ""),
      radicado_id: String(row.radicado_id ?? ""),
      cliente_id: String(row.cliente_id ?? ""),
      nombre_archivo: String(row.nombre_archivo ?? ""),
      estado_revision: String(row.estado_revision ?? "RECIBIDO"),
      comentario_revision: String(row.comentario_revision ?? ""),
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    const owner_id = Number(form.owner_id);
    let payload: Record<string, unknown>;
    if (resource === "procesos")
      payload = {
        owner_id,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
      };
    else if (resource === "radicados")
      payload = { owner_id, numero: form.numero };
    else if (resource === "tareas")
      payload = {
        owner_id,
        titulo: form.titulo,
        descripcion: form.descripcion || null,
        estado: form.estado,
        prioridad: form.prioridad,
        fecha_limite: form.fecha_limite
          ? new Date(form.fecha_limite).toISOString()
          : null,
        proceso_id: form.proceso_id ? Number(form.proceso_id) : null,
        radicado_id: form.radicado_id ? Number(form.radicado_id) : null,
        cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      };
    else if (editing) payload = {
      nombre_archivo: form.nombre_archivo.trim(),
      estado_revision: form.estado_revision,
      comentario_revision: form.comentario_revision || null,
    };
    else {
      if (!documentFile) {
        setError("Selecciona el archivo que deseas cargar.");
        setWorking(false);
        return;
      }
      const upload = new FormData();
      upload.set("sector", sector);
      upload.set("owner_id", form.owner_id);
      upload.set("proceso_id", form.proceso_id);
      upload.set("cliente_id", form.cliente_id);
      upload.set("archivo", documentFile);
      try {
        const response = await adminFetch(
          `${API_URL}/api/admin/inventario/documentos/cargar`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: upload,
          },
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            result.detail || "No fue posible cargar el documento.",
          );
        setNotice(result.mensaje || "Documento cargado.");
        setDocumentFile(null);
        setEditing(null);
        setFormOpen(false);
        await reload();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No fue posible cargar el documento.",
        );
      } finally {
        setWorking(false);
      }
      return;
    }
    if (editing && resource === "procesos")
      payload = {
        owner_id,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
      };
    if (editing && resource === "radicados") payload = { numero: form.numero };
    if (editing && resource === "tareas")
      payload = {
        titulo: form.titulo,
        descripcion: form.descripcion || null,
        estado: form.estado,
        prioridad: form.prioridad,
        fecha_limite: form.fecha_limite
          ? new Date(form.fecha_limite).toISOString()
          : null,
      };
    try {
      const endpoint = `${API_URL}/api/admin/inventario/${resource}${editing ? `/${editing.id}` : ""}?sector=${sector}`;
      const response = await adminFetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.detail || "No fue posible guardar el registro.");
      let noticeMessage = result.mensaje || "Cambios guardados.";
      if (!editing && resource === "radicados" && typeof result.consulta_id === "number") {
        try {
          await iniciarWorkflowConsultaRadicado(token, {
            tipo: "AUTOMATICA_NUEVO",
            radicado_id: Number(result.id),
            consulta_id: result.consulta_id,
          });
          noticeMessage = `${noticeMessage} Workflow de consulta iniciado.`;
        } catch {
          noticeMessage = `${noticeMessage} No fue posible iniciar el Workflow; vuelve a intentarlo desde ADMIN.`;
        }
      }
      setNotice(noticeMessage);
      setEditing(null);
      setFormOpen(false);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar el registro.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function remove(row: Row) {
    const description = resource === "procesos" ? "archivar" : "eliminar";
    const confirmation =
      resource === "radicados"
        ? `El borrado es irreversible: eliminará el radicado, sus actuaciones, consultas y tareas vinculadas. Los documentos del proceso se conservarán. ¿Continuar?`
        : `¿Deseas ${description} este registro del ámbito ${sector}?`;
    if (!window.confirm(confirmation)) return;
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/admin/inventario/${resource}/${row.id}?sector=${sector}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.detail || "No fue posible completar la acción.");
      setNotice(result.mensaje || "Acción completada.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible completar la acción.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function restore(row: Row) {
    if (!token) return;
    setWorking(true);
    setError("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/admin/inventario/procesos/${row.id}/restaurar?sector=${sector}`,
        { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.detail || "No fue posible restaurar el proceso.",
        );
      setNotice(result.mensaje);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible restaurar el proceso.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function download(row: Row) {
    if (!token || downloadingDocumentId !== null) return;
    setDownloadingDocumentId(row.id);
    setError("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/expedientes/documentos/${row.id}/archivo`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.detail || "No fue posible descargar el archivo.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = String(row.nombre_archivo || "documento");
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible descargar el archivo.",
      );
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  async function issueTemporaryLink(row: Row) {
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    setCopyMessage("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/admin/inventario/documentos/${row.id}/url-temporal?sector=${sector}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.detail || "No fue posible generar el enlace temporal.");
      setTemporaryLink(result as TemporaryLink);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible generar el enlace temporal.");
    } finally {
      setWorking(false);
    }
  }

  async function copyTemporaryLink() {
    if (!temporaryLink) return;
    try {
      await navigator.clipboard.writeText(temporaryLink.url);
      setCopyMessage("Enlace copiado.");
    } catch {
      setCopyMessage("No se pudo copiar automáticamente. Selecciona y copia la URL.");
    }
  }

  async function openTeam(row: Row) {
    if (!token) return;
    setError("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/expedientes/procesos/${row.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.detail || "No fue posible cargar el equipo.");
      setTeamProcess({
        id: row.id,
        nombre: String(row.nombre ?? "Proceso"),
        responsable: result.responsable,
        colaboradores: result.colaboradores ?? [],
        abogados_disponibles: result.abogados_disponibles ?? [],
      });
      setTeamSelection("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar el equipo.");
    }
  }

  async function addTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !teamProcess || !teamSelection) return;
    setWorking(true);
    setError("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/expedientes/procesos/${teamProcess.id}/colaboradores`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ abogado_id: Number(teamSelection) }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "No fue posible asignar el colaborador.");
      await openTeam({ id: teamProcess.id, nombre: teamProcess.nombre });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible asignar el colaborador.");
    } finally {
      setWorking(false);
    }
  }

  async function removeTeamMember(colleagueId: number) {
    if (!token || !teamProcess) return;
    setWorking(true);
    setError("");
    try {
      const response = await adminFetch(
        `${API_URL}/api/expedientes/procesos/${teamProcess.id}/colaboradores/${colleagueId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "No fue posible retirar el colaborador.");
      await openTeam({ id: teamProcess.id, nombre: teamProcess.nombre });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible retirar el colaborador.");
    } finally {
      setWorking(false);
    }
  }

  async function consult(row: Row) {
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await iniciarWorkflowConsultaRadicado(token, {
        tipo: "MANUAL",
        radicado_id: row.id,
      });
      setNotice("Consulta enviada al Workflow.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible encolar la consulta.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function consultAll() {
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const radicadoIds = rows.map((row) => row.id);
      if (!radicadoIds.length) {
        setNotice("No hay radicados para consultar.");
        return;
      }
      await iniciarWorkflowConsultaRadicado(token, {
        tipo: "MANUAL",
        radicado_ids: radicadoIds,
      });
      setNotice(`${radicadoIds.length} consultas enviadas al Workflow.`);
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible encolar las consultas.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function runBulkAction(action: "DELETE" | "RESTORE" | "CONSULT", selectedRows: Row[]) {
    if (!token) return;
    if (!selectedRows.length) return;
    if (action === "DELETE" && !window.confirm(`¿Aplicar la acción a ${selectedRows.length} registros seleccionados? Esta operación puede ser irreversible.`)) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      if (action === "CONSULT") {
        await iniciarWorkflowConsultaRadicado(token, { tipo: "MANUAL", radicado_ids: selectedRows.map((row) => row.id) });
        setNotice(`${selectedRows.length} consultas enviadas al Workflow.`);
      } else {
        const outcomes = await Promise.allSettled(selectedRows.map(async (row) => {
          const endpoint = action === "RESTORE"
            ? `${API_URL}/api/admin/inventario/procesos/${row.id}/restaurar?sector=${sector}`
            : `${API_URL}/api/admin/inventario/${resource}/${row.id}?sector=${sector}`;
          const response = await adminFetch(endpoint, { method: action === "RESTORE" ? "PATCH" : "DELETE", headers: { Authorization: `Bearer ${token}` } });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.detail || `No se pudo procesar el registro ${row.id}.`);
          return row.id;
        }));
        const failed = outcomes.filter((item) => item.status === "rejected").length;
        const succeeded = outcomes.length - failed;
        setNotice(`${succeeded} registro(s) procesados${failed ? `; ${failed} con error` : ""}.`);
        if (failed) setError(outcomes.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason instanceof Error ? item.reason.message : "Error al procesar registro.").join(" "));
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible completar la acción masiva.");
    } finally {
      setWorking(false);
    }
  }


  if (!validResource)
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        Tipo de recurso no disponible.
      </p>
    );
  const sectorLabel =
    sector === "FIRMA"
      ? "Firma"
      : sector === "SAAS"
        ? "SaaS individual"
        : "Global";
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  const processHref = (id: unknown) => `/gestion-procesos/admin/procesos/${id}`;
  const taskOverdue = (row: Row) => isOverdue(row.fecha_limite, row.estado, now);
  const taskDueSoon = (row: Row) => {
    const due = toDate(row.fecha_limite)?.getTime();
    return Boolean(due && due >= now && due <= weekAhead && row.estado !== "COMPLETADA" && row.estado !== "CANCELADA");
  };

  const summary: SummaryItem[] =
    resource === "procesos"
      ? [
          { key: "TODOS", label: archived ? "Archivados" : "Procesos activos", value: routeFiltered.length },
          { key: "RIESGO", label: "En riesgo", value: routeFiltered.filter((row) => row.salud === "RIESGO").length, tone: "danger" },
          { key: "ATENCION", label: "Requieren atención", value: routeFiltered.filter((row) => row.salud === "ATENCION").length, tone: "warning" },
          { key: "NORMAL", label: "Al día", value: routeFiltered.filter((row) => row.salud === "NORMAL").length, tone: "success" },
        ]
      : resource === "tareas"
        ? [
            { key: "ABIERTAS", label: "Abiertas", value: routeFiltered.filter((row) => row.estado === "PENDIENTE" || row.estado === "EN_CURSO").length },
            { key: "VENCIDAS", label: "Vencidas", value: routeFiltered.filter(taskOverdue).length, tone: "danger" },
            { key: "SEMANA", label: "Vencen en 7 días", value: routeFiltered.filter(taskDueSoon).length, tone: "warning" },
            { key: "COMPLETADA", label: "Completadas", value: routeFiltered.filter((row) => row.estado === "COMPLETADA").length, tone: "success" },
          ]
        : resource === "radicados"
          ? [
              { key: "TODOS", label: "Radicados", value: routeFiltered.length },
              { key: "ERROR", label: "Con error o no encontrados", value: routeFiltered.filter((row) => ["risk", "attention"].includes(consultaLabel(text(row.estado_consulta)).tone)).length, tone: "danger" },
              { key: "SIN_CONSULTAR", label: "Sin consultar", value: routeFiltered.filter((row) => consultaLabel(text(row.estado_consulta)).label === "Sin consultar").length, tone: "warning" },
              { key: "SIN_PROCESO", label: "Sin proceso asociado", value: routeFiltered.filter((row) => list(row.procesos).length === 0).length },
            ]
          : [
              { key: "TODOS", label: contractsOnly ? "Contratos" : "Documentos", value: routeFiltered.length },
              { key: "RECIBIDO", label: "Por revisar", value: routeFiltered.filter((row) => row.estado_revision === "RECIBIDO").length, tone: "warning" },
              { key: "REQUIERE_CORRECCION", label: "Requieren corrección", value: routeFiltered.filter((row) => row.estado_revision === "REQUIERE_CORRECCION").length, tone: "danger" },
              { key: "APROBADO", label: "Aprobados", value: routeFiltered.filter((row) => row.estado_revision === "APROBADO").length, tone: "success" },
            ];

  const matchesQuickFilter = (row: Row) => {
    if (!quickFilter || quickFilter === "TODOS") return true;
    if (resource === "procesos") return row.salud === quickFilter;
    if (resource === "tareas") {
      if (quickFilter === "ABIERTAS") return row.estado === "PENDIENTE" || row.estado === "EN_CURSO";
      if (quickFilter === "VENCIDAS") return taskOverdue(row);
      if (quickFilter === "SEMANA") return taskDueSoon(row);
      return row.estado === quickFilter;
    }
    if (resource === "radicados") {
      const tone = consultaLabel(text(row.estado_consulta));
      if (quickFilter === "ERROR") return tone.tone === "risk" || tone.tone === "attention";
      if (quickFilter === "SIN_CONSULTAR") return tone.label === "Sin consultar";
      if (quickFilter === "SIN_PROCESO") return list(row.procesos).length === 0;
    }
    return row.estado_revision === quickFilter;
  };
  const viewRows = routeFiltered.filter(matchesQuickFilter);

  const stateLabel = (value: string) =>
    resource === "tareas"
      ? taskStatusLabel(value).label
      : resource === "procesos"
        ? healthLabel(value).label
        : resource === "radicados"
          ? consultaLabel(value).label
          : resource === "documentos" && requestsOnly
            ? labelDocumentRequestStatus(value)
            : reviewStatusLabel(value).label;

  const columns: DataTableColumn<Row>[] =
    resource === "procesos"
      ? [
          {
            key: "nombre",
            header: "Proceso",
            mobile: "title",
            sortValue: (row) => text(row.nombre),
            searchValue: (row) => [row.nombre, row.descripcion, ...list(row.radicados_numeros), ...list(row.clientes_nombres), ...list(row.colaboradores)].map(text).join(" "),
            exportValue: (row) => text(row.nombre),
            render: (row) => (
              <span className="block min-w-0">
                <span className="block truncate font-medium text-foreground">{text(row.nombre)}</span>
                {list(row.radicados_numeros).length > 0 && (
                  <span className="mt-0.5 block truncate font-mono text-xs font-normal text-foreground-muted">{list(row.radicados_numeros).join(" · ")}</span>
                )}
              </span>
            ),
            className: "max-w-xs",
          },
          { key: "abogado", header: "Responsable", mobile: "meta", sortValue: (row) => text(row.abogado), render: (row) => text(row.abogado) || "—" },
          { key: "clientes", header: "Clientes", mobile: "meta", sortValue: (row) => list(row.clientes_nombres).join(", "), render: (row) => <span className="line-clamp-2">{list(row.clientes_nombres).join(", ") || "Sin cliente"}</span> },
          { key: "salud", header: "Estado", mobile: "badge", sortValue: (row) => healthRank(text(row.salud)), exportValue: (row) => healthLabel(text(row.salud)).label, render: (row) => <Badge tone={healthLabel(text(row.salud)).tone}>{healthLabel(text(row.salud)).label}</Badge> },
          { key: "senales", header: "Señales", mobile: "subtitle", wideOnly: true, searchValue: (row) => list(row.senales_salud).join(" "), render: (row) => <span className="text-xs text-foreground-muted">{list(row.senales_salud).join(" · ") || "Sin alertas"}</span> },
          { key: "tareas", header: "Tareas", mobile: "meta", align: "right", hideOnMobile: true, sortValue: (row) => Number(row.tareas_vencidas ?? 0) * 1000 + Number(row.tareas_activas ?? 0), render: (row) => <span className="whitespace-nowrap tabular-nums">{Number(row.tareas_activas ?? 0)}{Number(row.tareas_vencidas ?? 0) > 0 && <span className="ml-1 font-semibold text-danger">({Number(row.tareas_vencidas)} venc.)</span>}</span> },
          { key: "ultima_actividad", header: "Actividad", mobile: "meta", className: "whitespace-nowrap", sortValue: (row) => toDate(text(row.ultima_actividad)), exportValue: (row) => formatDateTime(text(row.ultima_actividad)), render: (row) => <span title={formatDateTime(text(row.ultima_actividad))}>{row.ultima_actividad ? formatRelative(text(row.ultima_actividad), now) : "Sin actividad"}</span> },
        ]
      : resource === "radicados"
        ? [
            {
              key: "numero",
              header: "Radicado",
              mobile: "title",
              sortValue: (row) => text(row.numero),
              searchValue: (row) => [row.numero, row.demandante, row.demandado, row.despacho, row.abogado, ...list(row.procesos)].map(text).join(" "),
              render: (row) => <span className="font-mono text-[13px] font-medium text-foreground">{text(row.numero)}</span>,
            },
            { key: "partes", header: "Partes", mobile: "subtitle", sortValue: (row) => text(row.demandante), render: (row) => <span className="line-clamp-2 text-sm">{[row.demandante, row.demandado].map(text).filter(Boolean).join(" vs. ") || "Sin datos de partes"}</span>, className: "max-w-xs" },
            { key: "procesos", header: "Proceso", mobile: "meta", sortValue: (row) => list(row.procesos).join(", "), render: (row) => list(row.procesos).join(", ") || <span className="text-foreground-muted">Sin proceso</span> },
            { key: "estado_consulta", header: "Consulta", mobile: "badge", sortValue: (row) => consultaLabel(text(row.estado_consulta)).label, render: (row) => <Badge tone={consultaLabel(text(row.estado_consulta)).tone}>{consultaLabel(text(row.estado_consulta)).label}</Badge> },
            { key: "ultima_actuacion", header: "Última actuación", hideOnMobile: true, mobile: "meta", sortValue: (row) => text(row.ultima_actuacion_fecha), searchValue: (row) => text(row.ultima_actuacion), render: (row) => row.ultima_actuacion ? <span className="block max-w-56"><span className="block truncate">{text(row.ultima_actuacion)}</span><span className="text-xs text-foreground-muted">{text(row.ultima_actuacion_fecha)}</span></span> : <span className="text-foreground-muted">—</span> },
            { key: "actuaciones", header: "Actuaciones", align: "right", hideOnMobile: true, mobile: "hidden", sortValue: (row) => Number(row.actuaciones ?? 0), render: (row) => <span className="tabular-nums">{Number(row.actuaciones ?? 0)}</span> },
            { key: "abogado", header: "Responsable", mobile: "meta", hideOnMobile: true, sortValue: (row) => text(row.abogado), render: (row) => text(row.abogado) || "—" },
          ]
        : resource === "tareas"
          ? [
              {
                key: "titulo",
                header: "Tarea",
                mobile: "title",
                sortValue: (row) => text(row.titulo),
                searchValue: (row) => [row.titulo, row.descripcion, row.proceso, row.cliente, row.abogado, row.radicado].map(text).join(" "),
                render: (row) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-medium text-foreground">{text(row.titulo)}</span>
                    <span className="block truncate text-xs font-normal text-foreground-muted">{text(row.proceso) || "Tarea general"}</span>
                  </span>
                ),
                className: "max-w-xs",
              },
              { key: "estado", header: "Estado", mobile: "badge", sortValue: (row) => taskStatusLabel(text(row.estado)).label, render: (row) => <Badge tone={taskStatusLabel(text(row.estado)).tone}>{taskStatusLabel(text(row.estado)).label}</Badge> },
              { key: "prioridad", header: "Prioridad", mobile: "badge", sortValue: (row) => priorityRank(text(row.prioridad)), exportValue: (row) => priorityLabel(text(row.prioridad)).label, render: (row) => <Badge tone={priorityLabel(text(row.prioridad)).tone}>{priorityLabel(text(row.prioridad)).label}</Badge> },
              { key: "fecha_limite", header: "Vence", mobile: "meta", sortValue: (row) => toDate(text(row.fecha_limite)), exportValue: (row) => formatDateTime(text(row.fecha_limite)), className: "whitespace-nowrap", render: (row) => row.fecha_limite ? <span className={taskOverdue(row) ? "font-semibold text-danger" : ""}>{taskOverdue(row) ? "Venció " : ""}{formatDate(text(row.fecha_limite))}</span> : <span className="text-foreground-muted">Sin fecha</span> },
              { key: "abogado", header: "Responsable", mobile: "meta", sortValue: (row) => text(row.abogado), render: (row) => text(row.abogado) || "—" },
              { key: "cliente", header: "Cliente", mobile: "hidden", wideOnly: true, sortValue: (row) => text(row.cliente), render: (row) => text(row.cliente) || <span className="text-foreground-muted">—</span> },
              { key: "subtareas", header: "Avance", align: "right", hideOnMobile: true, mobile: "hidden", sortValue: (row) => Number(row.subtareas ?? 0) ? Number(row.subtareas_completadas ?? 0) / Number(row.subtareas) : -1, render: (row) => Number(row.subtareas ?? 0) ? <span className="tabular-nums">{Number(row.subtareas_completadas ?? 0)}/{Number(row.subtareas)}</span> : <span className="text-foreground-muted">—</span> },
            ]
          : [
              {
                key: "nombre_archivo",
                header: contractsOnly ? "Contrato" : "Documento",
                mobile: "title",
                sortValue: (row) => text(row.nombre_archivo),
                searchValue: (row) => [row.nombre_archivo, row.proceso, row.cliente, row.comentario_revision].map(text).join(" "),
                render: (row) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <span className="truncate font-medium text-foreground">{text(row.nombre_archivo)}</span>
                  </span>
                ),
                className: "max-w-xs",
              },
              { key: "estado_revision", header: "Revisión", mobile: "badge", sortValue: (row) => reviewStatusLabel(text(row.estado_revision)).label, render: (row) => <Badge tone={reviewStatusLabel(text(row.estado_revision)).tone}>{reviewStatusLabel(text(row.estado_revision)).label}</Badge> },
              { key: "proceso", header: "Proceso", mobile: "subtitle", sortValue: (row) => text(row.proceso), render: (row) => text(row.proceso) || "—" },
              { key: "cliente", header: "Cliente", mobile: "meta", sortValue: (row) => text(row.cliente), render: (row) => text(row.cliente) || "—" },
              { key: "tipo", header: "Tipo", mobile: "meta", hideOnMobile: true, sortValue: (row) => fileKind(text(row.mime_type)), render: (row) => fileKind(text(row.mime_type)) },
              { key: "created_at", header: "Cargado", mobile: "meta", sortValue: (row) => toDate(text(row.created_at)), exportValue: (row) => formatDateTime(text(row.created_at)), render: (row) => formatDate(text(row.created_at)) },
            ];

  const rowActions: RowAction<Row>[] =
    resource === "procesos"
      ? archived
        ? [
            { label: "Ver resumen", icon: <Eye />, onSelect: (row) => setDetailsRow(row) },
            { label: "Restaurar proceso", icon: <ArchiveRestore />, onSelect: (row) => restore(row) },
          ]
        : [
            { label: "Abrir ficha completa", icon: <FolderOpen />, href: (row) => processHref(row.id) },
            { label: "Ver resumen", icon: <Eye />, onSelect: (row) => setDetailsRow(row) },
            { label: "Editar datos", icon: <Pencil />, onSelect: (row) => openEdit(row) },
            { label: "Gestionar equipo", icon: <Users />, onSelect: (row) => openTeam(row), hidden: (row) => row.owner_rol !== "ABOGADO_ADMIN" },
            { label: "Archivar proceso", icon: <Archive />, tone: "danger", separated: true, onSelect: (row) => remove(row) },
          ]
      : resource === "radicados"
        ? [
            { label: "Ver detalle", icon: <Eye />, onSelect: (row) => setDetailsRow(row) },
            { label: "Abrir proceso", icon: <FolderOpen />, href: (row) => processHref(list(row.proceso_ids)[0]), hidden: (row) => list(row.proceso_ids).length === 0 },
            { label: "Consultar ahora", icon: <RefreshCw />, onSelect: (row) => consult(row), disabled: () => working },
            { label: "Editar número", icon: <Pencil />, onSelect: (row) => openEdit(row) },
            { label: "Eliminar radicado", icon: <Trash2 />, tone: "danger", separated: true, onSelect: (row) => remove(row) },
          ]
        : resource === "tareas"
          ? [
              { label: "Ver detalle", icon: <Eye />, onSelect: (row) => setDetailsRow(row) },
              { label: "Editar tarea", icon: <Pencil />, onSelect: (row) => openEdit(row) },
              { label: "Abrir proceso", icon: <FolderOpen />, href: (row) => processHref(row.proceso_id), hidden: (row) => !row.proceso_id },
              { label: "Eliminar tarea", icon: <Trash2 />, tone: "danger", separated: true, onSelect: (row) => remove(row) },
            ]
          : [
              { label: "Ver detalle", icon: <Eye />, onSelect: (row) => setDetailsRow(row) },
              { label: "Descargar", icon: <Download />, onSelect: (row) => download(row), disabled: () => downloadingDocumentId !== null },
              { label: "Enlace temporal (15 min)", icon: <Link2 />, onSelect: (row) => issueTemporaryLink(row), disabled: () => working },
              { label: "Revisar o renombrar", icon: <Pencil />, onSelect: (row) => openEdit(row) },
              { label: "Abrir proceso", icon: <FolderOpen />, href: (row) => processHref(row.proceso_id), hidden: (row) => !row.proceso_id },
              { label: "Eliminar documento", icon: <Trash2 />, tone: "danger", separated: true, onSelect: (row) => remove(row) },
            ];

  const bulkActions: BulkAction<Row>[] =
    resource === "radicados"
      ? [
          { label: "Consultar", icon: <RefreshCw />, onRun: (selected) => runBulkAction("CONSULT", selected) },
          { label: "Eliminar", icon: <Trash2 />, tone: "danger", onRun: (selected) => runBulkAction("DELETE", selected) },
        ]
      : resource === "procesos" && archived
        ? [{ label: "Restaurar", icon: <ArchiveRestore />, onRun: (selected) => runBulkAction("RESTORE", selected) }]
        : [{ label: resource === "procesos" ? "Archivar" : "Eliminar", icon: resource === "procesos" ? <Archive /> : <Trash2 />, tone: "danger", onRun: (selected) => runBulkAction("DELETE", selected) }];

  const requestColumns: DataTableColumn<DocumentRequest>[] = [
    { key: "titulo", header: "Solicitud", mobile: "title", sortValue: (request) => request.titulo, searchValue: (request) => `${request.titulo} ${request.proceso} ${request.cliente} ${request.documentos_requeridos.map((item) => item.nombre).join(" ")}`, render: (request) => <span className="font-medium text-foreground">{request.titulo}</span> },
    { key: "estado", header: "Estado", mobile: "badge", sortValue: (request) => labelDocumentRequestStatus(request.estado), render: (request) => <Badge tone={requestTone(request.estado)}>{labelDocumentRequestStatus(request.estado)}</Badge> },
    { key: "proceso", header: "Proceso", mobile: "subtitle", sortValue: (request) => request.proceso, render: (request) => request.proceso },
    { key: "cliente", header: "Cliente", mobile: "meta", sortValue: (request) => request.cliente, render: (request) => request.cliente },
    { key: "documentos", header: "Recibidos", mobile: "meta", align: "right", sortValue: (request) => request.documentos_requeridos.filter((item) => item.archivo).length, exportValue: (request) => request.documentos_requeridos.map((item) => `${item.nombre} (${item.estado})`).join(" | "), render: (request) => <span className="tabular-nums">{request.documentos_requeridos.filter((item) => item.archivo).length}/{request.documentos_requeridos.length}</span> },
    { key: "solicitado_en", header: "Solicitado", mobile: "meta", sortValue: (request) => toDate(request.solicitado_en), exportValue: (request) => formatDateTime(request.solicitado_en), render: (request) => formatDate(request.solicitado_en) },
    { key: "fecha_limite", header: "Vence", mobile: "meta", sortValue: (request) => toDate(request.fecha_limite), exportValue: (request) => formatDateTime(request.fecha_limite), render: (request) => request.fecha_limite ? <span className={isOverdue(request.fecha_limite, request.atendida_en ? "COMPLETADA" : "PENDIENTE", now) ? "font-semibold text-danger" : ""}>{formatDate(request.fecha_limite)}</span> : "—" },
  ];

  const pageTitle = requestsOnly ? "Solicitudes documentales" : contractsOnly ? "Contratos cargados" : resourceNames[resource];
  const pageDescription =
    requestsOnly
      ? "Documentos pedidos a los clientes y su estado de entrega y revisión."
      : resource === "procesos"
        ? "Todos los expedientes de la firma con su estado de salud, responsables y actividad."
        : resource === "radicados"
          ? "Radicados judiciales, estado de su última consulta y actuaciones registradas."
          : resource === "tareas"
            ? "Trabajo pendiente del equipo: vencimientos, prioridades y responsables."
            : "Archivos recibidos de los clientes, pendientes de revisión o ya aprobados.";

  const filterSelectClass = "h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground sm:flex-none";
  const toolbar = (
    <>
      <select aria-label="Filtrar por estado" value={state} onChange={(event) => setState(event.target.value)} className={filterSelectClass}>
        <option value="TODOS">Todos los estados</option>
        {states.map((value) => <option key={value} value={value}>{stateLabel(value)}</option>)}
      </select>
      {resource !== "documentos" && (
        <select aria-label="Filtrar por responsable" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className={filterSelectClass}>
          <option value="TODOS">Todos los responsables</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.nombre_completo}</option>)}
        </select>
      )}
      {(resource === "tareas" || resource === "documentos") && (
        <select aria-label="Filtrar por proceso" value={processFilter} onChange={(event) => setProcessFilter(event.target.value)} className={filterSelectClass}>
          <option value="TODOS">Todos los procesos</option>
          {processes.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}
        </select>
      )}
      {(resource === "tareas" || resource === "documentos") && (
        <select aria-label="Filtrar por cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className={filterSelectClass}>
          <option value="TODOS">Todos los clientes</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}
        </select>
      )}
      <details className="group relative">
        <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 text-sm text-foreground hover:bg-surface-hover">
          <CalendarDays aria-hidden="true" className="size-4" />
          {dateFrom || dateTo ? `${dateFrom || "…"} → ${dateTo || "…"}` : "Fechas"}
        </summary>
        <div className="absolute left-0 z-20 mt-2 grid w-64 gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-lg">
          <label className="text-xs text-foreground-muted">Desde<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-border bg-background px-2 text-sm text-foreground" /></label>
          <label className="text-xs text-foreground-muted">Hasta<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-border bg-background px-2 text-sm text-foreground" /></label>
          {(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-left text-xs font-medium text-primary hover:underline">Quitar fechas</button>}
        </div>
      </details>
      {activeFilterCount > 0 && (
        <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 rounded-[var(--radius-md)] px-2 text-sm font-medium text-primary hover:underline">
          <X aria-hidden="true" className="size-4" />
          Limpiar ({activeFilterCount})
        </button>
      )}
    </>
  );

  const detail = detailsRow;
  const detailItems: { label: string; value: ReactNode; wide?: boolean }[] = !detail
    ? []
    : resource === "procesos"
      ? [
          { label: "Estado", value: <Badge tone={healthLabel(text(detail.salud)).tone}>{healthLabel(text(detail.salud)).label}</Badge> },
          { label: "Responsable", value: text(detail.abogado) || "—" },
          { label: "Colaboradores", value: list(detail.colaboradores).join(", ") || "Ninguno" },
          { label: "Clientes", value: list(detail.clientes_nombres).join(", ") || "Sin cliente" },
          { label: "Radicados", value: list(detail.radicados_numeros).join(" · ") || "Sin radicados", wide: true },
          { label: "Tareas activas", value: `${Number(detail.tareas_activas ?? 0)} (${Number(detail.tareas_vencidas ?? 0)} vencidas)` },
          { label: "Documentos pendientes", value: Number(detail.documentos_pendientes ?? 0) },
          { label: "Última actividad", value: detail.ultima_actividad ? formatDateTime(text(detail.ultima_actividad)) : "Sin actividad" },
          { label: "Creado", value: formatDateTime(text(detail.created_at)) },
          { label: "Señales", value: list(detail.senales_salud).join(" · ") || "Sin alertas", wide: true },
          { label: "Descripción", value: text(detail.descripcion) || "Sin descripción", wide: true },
        ]
      : resource === "radicados"
        ? [
            { label: "Consulta", value: <Badge tone={consultaLabel(text(detail.estado_consulta)).tone}>{consultaLabel(text(detail.estado_consulta)).label}</Badge> },
            { label: "Última consulta", value: text(detail.consultado_en) || "Nunca" },
            { label: "Demandante", value: text(detail.demandante) || "—" },
            { label: "Demandado", value: text(detail.demandado) || "—" },
            { label: "Despacho", value: text(detail.despacho) || "—", wide: true },
            { label: "Procesos", value: list(detail.procesos).join(", ") || "Sin proceso asociado", wide: true },
            { label: "Actuaciones registradas", value: Number(detail.actuaciones ?? 0) },
            { label: "Responsable", value: text(detail.abogado) || "—" },
            { label: "Última actuación", value: detail.ultima_actuacion ? `${text(detail.ultima_actuacion_fecha)} · ${text(detail.ultima_actuacion)}` : "—", wide: true },
          ]
        : resource === "tareas"
          ? [
              { label: "Estado", value: <Badge tone={taskStatusLabel(text(detail.estado)).tone}>{taskStatusLabel(text(detail.estado)).label}</Badge> },
              { label: "Prioridad", value: <Badge tone={priorityLabel(text(detail.prioridad)).tone}>{priorityLabel(text(detail.prioridad)).label}</Badge> },
              { label: "Vence", value: detail.fecha_limite ? formatDateTime(text(detail.fecha_limite)) : "Sin fecha" },
              { label: "Responsable", value: text(detail.abogado) || "—" },
              { label: "Proceso", value: text(detail.proceso) || "Tarea general" },
              { label: "Cliente", value: text(detail.cliente) || "—" },
              { label: "Radicado", value: text(detail.radicado) || "—" },
              { label: "Subtareas", value: Number(detail.subtareas ?? 0) ? `${Number(detail.subtareas_completadas ?? 0)} de ${Number(detail.subtareas)} completadas` : "Sin subtareas" },
              { label: "Creada", value: formatDateTime(text(detail.created_at)) },
              { label: "Completada", value: detail.completada_en ? formatDateTime(text(detail.completada_en)) : "—" },
              { label: "Descripción", value: text(detail.descripcion) || "Sin descripción", wide: true },
            ]
          : [
              { label: "Revisión", value: <Badge tone={reviewStatusLabel(text(detail.estado_revision)).tone}>{reviewStatusLabel(text(detail.estado_revision)).label}</Badge> },
              { label: "Tipo", value: fileKind(text(detail.mime_type)) },
              { label: "Proceso", value: text(detail.proceso) || "—" },
              { label: "Cliente", value: text(detail.cliente) || "—" },
              { label: "Cargado", value: formatDateTime(text(detail.created_at)) },
              { label: "Revisado", value: detail.revisado_en ? formatDateTime(text(detail.revisado_en)) : "Pendiente" },
              { label: "Comentario de revisión", value: text(detail.comentario_revision) || "—", wide: true },
            ];

  return (
    <section className="motion-swap mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline={`Administración · ${sectorLabel}`}
        title={pageTitle}
        description={pageDescription}
        action={
          <div className="flex flex-wrap gap-2">
            {resource === "radicados" && (
              <Button variant="outline" disabled={working || rows.length === 0} onClick={() => void consultAll()} icon={<RefreshCw className="size-4" />}>
                <span className="hidden sm:inline">Consultar todos</span>
                <span className="sm:hidden">Consultar</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => void reload()} aria-label="Actualizar" icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />} />
            {!requestsOnly && (
              <Button variant="primary" onClick={openCreate} icon={<Plus className="size-4" />}>
                {resource === "procesos" ? "Nuevo proceso" : resource === "radicados" ? "Nuevo radicado" : resource === "tareas" ? "Nueva tarea" : "Cargar documento"}
              </Button>
            )}
          </div>
        }
      />

      {error && <p role="alert" className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-[var(--radius-lg)] border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}

      {resource === "documentos" && (
        <SegmentedControl
          label="Tipo de documentos"
          value={requestsOnly ? "solicitudes" : contractsOnly ? "contratos" : "archivos"}
          options={[
            { value: "archivos", label: "Archivos recibidos", href: "/gestion-procesos/admin/documentos" },
            { value: "contratos", label: "Contratos cargados", href: "/gestion-procesos/admin/documentos/contratos" },
            { value: "solicitudes", label: "Solicitudes", href: "/gestion-procesos/admin/documentos/solicitudes", count: documentRequests.filter((request) => !request.atendida_en).length },
          ]}
        />
      )}
      {resource === "procesos" && (
        <SegmentedControl
          label="Estado de procesos"
          value={archived ? "archivados" : "activos"}
          onChange={(value) => { setArchived(value === "archivados"); setQuickFilter(null); }}
          options={[{ value: "activos", label: "Activos" }, { value: "archivados", label: "Archivados" }]}
        />
      )}

      {!requestsOnly && <SummaryStrip items={summary} active={quickFilter ?? "TODOS"} onSelect={(key) => setQuickFilter(key === "TODOS" ? null : key)} />}

      {resource === "tareas" && (
        <SegmentedControl
          label="Vista de tareas"
          value={taskView}
          onChange={setTaskView}
          options={[{ value: "LISTA", label: "Lista" }, { value: "KANBAN", label: "Tablero" }, { value: "CALENDARIO", label: "Calendario" }]}
        />
      )}

      {resource === "tareas" && taskView === "KANBAN" && (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0">
          {tasksByState.map(({ status, rows: stateRows }) => (
            <section key={status} aria-label={taskStatusLabel(status).label} className="min-h-56 w-[80vw] max-w-xs shrink-0 snap-start rounded-[var(--radius-lg)] border border-border bg-surface-muted p-3 xl:w-auto xl:max-w-none">
              <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
                {taskStatusLabel(status).label}
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-foreground-muted">{stateRows.length}</span>
              </h2>
              <div className="space-y-2">
                {stateRows.map((row) => (
                  <button key={row.id} type="button" onClick={() => setDetailsRow(row)} className={`w-full rounded-[var(--radius-md)] border bg-surface p-3 text-left shadow-[var(--shadow-xs)] hover:bg-surface-hover ${taskOverdue(row) ? "border-danger/40" : "border-border"}`}>
                    <p className="font-medium text-foreground">{text(row.titulo)}</p>
                    <p className="mt-1 text-xs text-foreground-muted">{text(row.proceso) || "Tarea general"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={priorityLabel(text(row.prioridad)).tone}>{priorityLabel(text(row.prioridad)).label}</Badge>
                      {row.fecha_limite && <span className={`text-xs ${taskOverdue(row) ? "font-semibold text-danger" : "text-foreground-muted"}`}>{formatDate(text(row.fecha_limite))}</span>}
                    </div>
                    <p className="mt-1.5 text-xs text-foreground-muted">{text(row.abogado)}</p>
                  </button>
                ))}
                {stateRows.length === 0 && <p className="py-6 text-center text-xs text-foreground-muted">Sin tareas</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      {resource === "tareas" && taskView === "CALENDARIO" && (
        <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Vencimientos del mes</h2>
            <input type="month" aria-label="Mes del calendario de tareas" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} className="h-10 rounded-[var(--radius-md)] border border-border bg-background px-2 text-sm text-foreground" />
          </div>
          <div className="hidden grid-cols-7 border-l border-t border-border md:grid">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day} className="border-b border-r border-border bg-surface-muted p-2 text-xs font-semibold text-foreground-muted">{day}</div>)}
            {Array.from({ length: Math.ceil((calendarOffset + calendarDays) / 7) * 7 }, (_, index) => {
              const day = index - calendarOffset + 1;
              if (day < 1 || day > calendarDays) return <div key={`empty-${index}`} className="min-h-24 border-b border-r border-border bg-surface-muted/60" />;
              const key = `${calendarMonth}-${String(day).padStart(2, "0")}`;
              return (
                <div key={key} className="min-h-24 border-b border-r border-border p-2">
                  <p className="mb-1 text-xs text-foreground-muted">{day}</p>
                  <div className="space-y-1">
                    {(tasksByDueDate.get(key) ?? []).map((row) => (
                      <button key={row.id} type="button" onClick={() => setDetailsRow(row)} className={`block w-full truncate rounded px-1.5 py-1 text-left text-xs ${taskOverdue(row) ? "bg-danger-light text-danger" : "bg-primary-light text-primary"}`}>
                        {text(row.titulo)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* En móvil, la cuadrícula de 7 columnas es ilegible: se muestra como agenda. */}
          <ol className="space-y-3 md:hidden">
            {[...tasksByDueDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([day, dayRows]) => (
              <li key={day}>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{formatDate(`${day}T12:00:00`)}</p>
                <div className="mt-1 space-y-1.5">
                  {dayRows.map((row) => (
                    <button key={row.id} type="button" onClick={() => setDetailsRow(row)} className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border p-3 text-left">
                      <span className="min-w-0 truncate text-sm font-medium">{text(row.titulo)}</span>
                      <Badge tone={taskStatusLabel(text(row.estado)).tone}>{taskStatusLabel(text(row.estado)).label}</Badge>
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {tasksByDueDate.size === 0 && <p className="py-6 text-center text-sm text-foreground-muted">No hay vencimientos este mes.</p>}
          </ol>
        </section>
      )}

      {requestsOnly ? (
        <DataTable
          caption="Solicitudes documentales"
          rows={visibleDocumentRequests}
          columns={requestColumns}
          rowKey={(request) => request.id}
          onRowClick={(request) => setDetailRequest(request)}
          rowActions={[{ label: "Ver detalle", icon: <Eye />, onSelect: (request) => setDetailRequest(request) }]}
          searchPlaceholder="Buscar solicitud, proceso o cliente"
          toolbar={toolbar}
          activeFilterCount={activeFilterCount}
          initialSort={{ key: "solicitado_en", direction: "desc" }}
          exportFilename="solicitudes-documentales"
          storageKey="admin-solicitudes"
          loading={loading}
          emptyTitle="No hay solicitudes documentales"
          emptyDescription="Cuando un abogado pida documentos a un cliente, aparecerán aquí."
        />
      ) : (resource !== "tareas" || taskView === "LISTA") && (
        <DataTable
          caption={pageTitle}
          rows={viewRows}
          columns={columns}
          rowKey={(row) => row.id}
          onRowClick={(row) => setDetailsRow(row)}
          rowHref={resource === "procesos" && !archived ? (row) => processHref(row.id) : undefined}
          rowActions={rowActions}
          bulkActions={bulkActions}
          rowTone={resource === "tareas" ? (row) => (taskOverdue(row) ? "danger" : undefined) : resource === "procesos" ? (row) => (row.salud === "RIESGO" ? "danger" : undefined) : undefined}
          searchPlaceholder={`Buscar en ${pageTitle.toLowerCase()}`}
          toolbar={toolbar}
          activeFilterCount={activeFilterCount}
          initialSort={
            resource === "procesos"
              ? { key: "salud", direction: "desc" }
              : resource === "tareas"
                ? { key: "fecha_limite", direction: "asc" }
                : resource === "radicados"
                  ? { key: "numero", direction: "asc" }
                  : { key: "created_at", direction: "desc" }
          }
          exportFilename={`${resource}-${sector.toLowerCase()}`}
          storageKey={`admin-${resource}-${sector}`}
          loading={loading}
          emptyTitle={archived ? "No hay procesos archivados" : `No hay ${pageTitle.toLowerCase()} para mostrar`}
          emptyDescription={activeFilterCount || quickFilter ? "Prueba a quitar filtros." : undefined}
        />
      )}

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetailsRow(null)}
        overline={`${resourceNames[resource]} · ${sectorLabel}`}
        title={text(detail?.nombre ?? detail?.numero ?? detail?.titulo ?? detail?.nombre_archivo) || `Registro ${detail?.id ?? ""}`}
        subtitle={detail ? `Referencia #${detail.id}` : undefined}
        footer={
          detail && (
            <>
              {resource === "procesos" && !archived && (
                <Link href={processHref(detail.id)} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border px-4 text-sm font-semibold text-foreground hover:bg-surface-hover">
                  <FolderOpen aria-hidden="true" className="size-4" />
                  Ficha completa
                </Link>
              )}
              {resource === "documentos" && (
                <Button variant="outline" onClick={() => void download(detail)} icon={<Download className="size-4" />}>Descargar</Button>
              )}
              {!(resource === "procesos" && archived) && (
                <Button variant="primary" onClick={() => { const row = detail; setDetailsRow(null); openEdit(row); }} icon={<Pencil className="size-4" />}>
                  {resource === "documentos" ? "Revisar" : "Editar"}
                </Button>
              )}
            </>
          )
        }
      >
        <DetailList items={detailItems} />
      </Drawer>

      {detailRequest && <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRequest(null); }}><section role="dialog" aria-modal="true" aria-labelledby="document-request-detail-title" className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-2xl"><header className="flex items-start justify-between"><div><p className="text-xs uppercase text-primary">Solicitud documental · #{detailRequest.id}</p><h2 id="document-request-detail-title" className="mt-1 text-lg font-semibold">{detailRequest.titulo}</h2></div><button type="button" onClick={() => setDetailRequest(null)} aria-label="Cerrar detalle" className="rounded-md p-2 hover:bg-surface-hover"><X className="size-4" /></button></header><dl className="grid gap-3 sm:grid-cols-2">{([["Proceso", detailRequest.proceso], ["Cliente", detailRequest.cliente], ["Estado", detailRequest.estado], ["Documento", detailRequest.documento ?? "Pendiente de carga"], ["Solicitado", detailRequest.solicitado_en], ["Fecha límite", detailRequest.fecha_limite]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3"><dt className="text-xs text-foreground-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{display(value)}</dd></div>)}</dl><section className="space-y-2"><h3 className="text-sm font-semibold">Documentos solicitados y estado</h3>{detailRequest.documentos_requeridos.map((requested) => <article key={requested.id} className="rounded-lg border border-border p-3"><p className="font-medium">{requested.nombre} · {requested.estado.replaceAll("_", " ")}</p>{requested.archivo && <p className="text-xs text-foreground-muted">Archivo: {requested.archivo}</p>}{requested.comentario && <p className="mt-1 text-sm text-amber-700">Observación: {requested.comentario}</p>}{requested.documento_id && <button type="button" onClick={() => { const row = rows.find((item) => item.id === requested.documento_id); setDetailRequest(null); if (row) openEdit(row); }} className="mt-2 text-sm text-primary underline">Revisar documento</button>}</article>)}</section>{detailRequest.documento_id && <button type="button" onClick={() => { const row = rows.find((item) => item.id === detailRequest.documento_id); setDetailRequest(null); if (row) openEdit(row); }} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold !text-white">Revisar documento</button>}</section></div>}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            editing?.id
              ? `Editar ${resourceNames[resource]}`
              : `Crear ${resourceNames[resource]}`
          }
          className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">
                  Ámbito: {sectorLabel}
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {editing?.id
                    ? `Editar ${resourceNames[resource]}`
                    : `Nuevo ${resourceNames[resource]}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
                aria-label="Cerrar"
                className="grid size-9 place-items-center rounded-md hover:bg-surface-hover"
              >
                <X className="size-4" />
              </button>
            </header>
            {(!editing?.id || resource === "procesos") && (
              <label className="block text-sm font-medium">
                Responsable
                <select
                  required
                  value={form.owner_id}
                  onChange={(event) =>
                    setForm({ ...form, owner_id: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                >
                  <option value="">Seleccionar responsable</option>
                  {owners
                    .filter((owner) => !editing || resource !== "procesos" || owner.rol === editing.owner_rol)
                    .map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.nombre_completo} ·{" "}
                      {roleNames[owner.rol] || owner.rol}
                    </option>
                    ))}
                </select>
              </label>
            )}
            {resource === "procesos" && (
              <>
                <label className="block text-sm font-medium">
                  Nombre
                  <input
                    required
                    maxLength={255}
                    value={form.nombre}
                    onChange={(event) =>
                      setForm({ ...form, nombre: event.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Descripción
                  <textarea
                    rows={3}
                    value={form.descripcion}
                    onChange={(event) =>
                      setForm({ ...form, descripcion: event.target.value })
                    }
                    className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5"
                  />
                </label>
              </>
            )}
            {resource === "radicados" && (
              <label className="block text-sm font-medium">
                Número de radicado
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{23}"
                  maxLength={23}
                  value={form.numero}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      numero: event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 23),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono"
                />
              </label>
            )}
            {resource === "tareas" && (
              <>
                <label className="block text-sm font-medium">
                  Título
                  <input
                    required
                    value={form.titulo}
                    onChange={(event) =>
                      setForm({ ...form, titulo: event.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Descripción
                  <textarea
                    rows={3}
                    value={form.descripcion}
                    onChange={(event) =>
                      setForm({ ...form, descripcion: event.target.value })
                    }
                    className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Estado
                    <select
                      value={form.estado}
                      onChange={(event) =>
                        setForm({ ...form, estado: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      {["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"].map(
                        (value) => (
                          <option key={value}>{value}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Prioridad
                    <select
                      value={form.prioridad}
                      onChange={(event) =>
                        setForm({ ...form, prioridad: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      {["BAJA", "MEDIA", "ALTA", "URGENTE"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm font-medium">
                    Proceso
                    <select
                      value={form.proceso_id}
                      onChange={(event) =>
                        setForm({ ...form, proceso_id: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      <option value="">Sin proceso</option>
                      {processes.map((process) => (
                        <option key={process.id} value={process.id}>
                          {process.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Radicado
                    <select
                      value={form.radicado_id}
                      onChange={(event) =>
                        setForm({ ...form, radicado_id: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      <option value="">Sin radicado</option>
                      {radicados.map((radicado) => (
                        <option key={radicado.id} value={radicado.id}>
                          {radicado.numero}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Cliente
                    <select
                      value={form.cliente_id}
                      onChange={(event) =>
                        setForm({ ...form, cliente_id: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      <option value="">Sin cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.nombre_completo}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Fecha límite
                  <input
                    type="datetime-local"
                    value={form.fecha_limite}
                    onChange={(event) =>
                      setForm({ ...form, fecha_limite: event.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                  />
                </label>
              </>
            )}
            {resource === "documentos" &&
              (editing ? (
                <>
                  <label className="block text-sm font-medium">
                    Nombre del archivo
                    <input required maxLength={255} value={form.nombre_archivo} onChange={(event) => setForm({ ...form, nombre_archivo: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5" />
                  </label>
                  <label className="block text-sm font-medium">Estado de revisión
                    <select value={form.estado_revision} onChange={(event) => setForm({ ...form, estado_revision: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5">
                      <option value="RECIBIDO">Recibido</option><option value="EN_REVISION">En revisión</option><option value="APROBADO">Aprobado</option><option value="REQUIERE_CORRECCION">Requiere corrección</option><option value="RECHAZADO">Rechazado</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">Observación de revisión
                    <textarea rows={3} maxLength={4000} value={form.comentario_revision} onChange={(event) => setForm({ ...form, comentario_revision: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5" />
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium">
                    Proceso
                    <select
                      required
                      value={form.proceso_id}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          proceso_id: event.target.value,
                          cliente_id: "",
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      <option value="">Seleccionar proceso</option>
                      {processes
                        .filter(
                          (process) =>
                            !form.owner_id ||
                            process.owner_id === Number(form.owner_id),
                        )
                        .map((process) => (
                          <option key={process.id} value={process.id}>
                            {process.nombre}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Cliente relacionado
                    <select
                      required
                      value={form.cliente_id}
                      onChange={(event) =>
                        setForm({ ...form, cliente_id: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      <option value="">Seleccionar cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.nombre_completo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Archivo (PDF, JPEG, PNG o DOCX; máximo 15 MB)
                    <input
                      required
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) =>
                        setDocumentFile(event.target.files?.[0] || null)
                      }
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                    />
                  </label>
                </>
              ))}
            <footer className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={working}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {working ? "Guardando…" : "Guardar"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {temporaryLink && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlace temporal del documento"
          className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
        >
          <section className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Acceso público temporal · {sectorLabel}</p>
                <h2 className="mt-1 text-lg font-semibold">{temporaryLink.nombre_archivo}</h2>
              </div>
              <button type="button" onClick={() => setTemporaryLink(null)} aria-label="Cerrar enlace temporal" className="grid size-9 place-items-center rounded-md hover:bg-surface-hover">
                <X className="size-4" />
              </button>
            </header>
            <p className="text-sm text-foreground-muted">Cualquier persona con este enlace podrá descargar el archivo hasta su vencimiento. No lo compartas en canales públicos.</p>
            <label className="block text-sm font-medium">URL temporal<input readOnly value={temporaryLink.url} onFocus={(event) => event.currentTarget.select()} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-xs" /></label>
            <p className="text-xs text-foreground-muted">Vence: {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(temporaryLink.expires_at))} · 15 minutos</p>
            {copyMessage && <p role="status" className="text-sm text-success">{copyMessage}</p>}
            <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <a href={`mailto:?subject=${encodeURIComponent(`Documento: ${temporaryLink.nombre_archivo}`)}&body=${encodeURIComponent(temporaryLink.url)}`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover"><Mail className="size-4" />Correo</a>
              <a href={`https://wa.me/?text=${encodeURIComponent(temporaryLink.url)}`} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover">WhatsApp</a>
              <button type="button" onClick={() => void copyTemporaryLink()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Copy className="size-4" />Copiar enlace</button>
            </footer>
          </section>
        </div>
      )}
      {teamProcess && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Equipo del proceso ${teamProcess.nombre}`}
          className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
        >
          <section className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Firma · {sectorLabel}</p>
                <h2 className="mt-1 text-lg font-semibold">Equipo · {teamProcess.nombre}</h2>
                <p className="mt-1 text-sm text-foreground-muted">Responsable: {teamProcess.responsable.nombre_completo}</p>
              </div>
              <button type="button" onClick={() => setTeamProcess(null)} aria-label="Cerrar equipo" className="grid size-9 place-items-center rounded-md hover:bg-surface-hover"><X className="size-4" /></button>
            </header>
            {teamProcess.colaboradores.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {teamProcess.colaboradores.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>{member.nombre_completo}</span>
                    <button type="button" disabled={working} onClick={() => void removeTeamMember(member.id)} className="text-xs font-medium text-danger hover:underline disabled:opacity-50">Retirar acceso</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">No hay colaboradores internos asignados.</p>
            )}
            {teamProcess.abogados_disponibles.length > 0 ? (
              <form onSubmit={addTeamMember} className="flex flex-wrap gap-2">
                <select required value={teamSelection} onChange={(event) => setTeamSelection(event.target.value)} aria-label="Abogado interno a asignar" className="min-w-56 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Seleccionar abogado interno</option>
                  {teamProcess.abogados_disponibles.map((member) => <option key={member.id} value={member.id}>{member.nombre_completo}</option>)}
                </select>
                <button type="submit" disabled={working || !teamSelection} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Users className="size-4" />Asignar</button>
              </form>
            ) : (
              <p className="text-xs text-foreground-muted">No hay otros abogados internos activos para asignar.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
