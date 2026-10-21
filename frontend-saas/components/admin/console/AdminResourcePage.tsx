"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArchiveRestore,
  Copy,
  Download,
  Eye,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { API_URL, apiRequest, iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

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
  const [query, setQuery] = useState("");
  const [state, setState] = useState("TODOS");
  const [ownerFilter, setOwnerFilter] = useState("TODOS");
  const [processFilter, setProcessFilter] = useState("TODOS");
  const [clientFilter, setClientFilter] = useState("TODOS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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
  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([]);
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
        const matchesQuery =
          !query ||
          Object.values(row).some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(query.toLowerCase()),
          );
        const matchesOwner = ownerFilter === "TODOS" || String(row.owner_id ?? row.responsable_id ?? "") === ownerFilter;
        const matchesProcess = processFilter === "TODOS" || String(row.proceso_id ?? "") === processFilter;
        const matchesClient = clientFilter === "TODOS" || String(row.cliente_id ?? "") === clientFilter;
        const rowDate = String(row.fecha_limite ?? row.created_at ?? row.consultado_en ?? "").slice(0, 10);
        const matchesFrom = !dateFrom || (rowDate && rowDate >= dateFrom);
        const matchesTo = !dateTo || (rowDate && rowDate <= dateTo);
        return matchesState && matchesQuery && matchesOwner && matchesProcess && matchesClient && matchesFrom && matchesTo;
      }),
    [rows, state, query, ownerFilter, processFilter, clientFilter, dateFrom, dateTo],
  );
  const routeFiltered = resource === "documentos"
    ? filtered.filter((row) => contractsOnly === Boolean(row.contrato_id))
    : filtered;
  const selectedVisibleRows = routeFiltered.filter((row) => selectedIds.includes(row.id));
  const states = [
    ...new Set([
      rows
        .map((row) => String(row.estado ?? row.estado_consulta ?? row.salud ?? ""))
        .filter(Boolean),
      ...(resource === "documentos" ? documentRequests.map((request) => request.estado) : []),
    ].flat()),
  ];
  const tasksByState = ["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"].map((status) => ({
    status,
    rows: routeFiltered.filter((row) => String(row.estado) === status),
  }));
  const [calendarYear, calendarMonthNumber] = calendarMonth.split("-").map(Number);
  const calendarDays = new Date(Date.UTC(calendarYear, calendarMonthNumber, 0)).getUTCDate();
  const calendarOffset = (new Date(Date.UTC(calendarYear, calendarMonthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const tasksByDueDate = new Map<string, Row[]>();
  for (const row of routeFiltered) {
    const due = typeof row.fecha_limite === "string" ? row.fecha_limite.slice(0, 10) : "";
    if (due.startsWith(calendarMonth)) tasksByDueDate.set(due, [...(tasksByDueDate.get(due) ?? []), row]);
  }
  const visibleDocumentRequests = documentRequests.filter((request) =>
    (!query || `${request.titulo} ${request.proceso} ${request.cliente} ${request.documento ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) &&
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
        ? new Date(String(row.fecha_limite)).toISOString().slice(0, 16)
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

  async function runBulkAction(action: "DELETE" | "RESTORE" | "CONSULT") {
    if (!token) return;
    const selectedRows = selectedVisibleRows;
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
      setSelectedIds([]);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible completar la acción masiva.");
    } finally {
      setWorking(false);
    }
  }

  function exportSelectedRequests() {
    const selected = visibleDocumentRequests.filter((request) => selectedRequestIds.includes(request.id));
    if (!selected.length) return;
    const escapeCsv = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [["Solicitud", "Proceso", "Cliente", "Estado", "Documento", "Solicitado", "Fecha límite"], ...selected.map((request) => [request.titulo, request.proceso, request.cliente, request.estado, request.documento, request.solicitado_en, request.fecha_limite])].map((line) => line.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "solicitudes-documentales.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setSelectedRequestIds([]);
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
  const canCreate = true;
  const columns: { key: string; label: string }[] =
    resource === "procesos"
      ? [
          { key: "nombre", label: "Proceso" },
          { key: "abogado", label: "Responsable" },
          { key: "ultima_actividad", label: "Última actividad" },
          { key: "salud", label: "Salud" },
          { key: "senales_salud", label: "Señales" },
        ]
      : resource === "radicados"
        ? [
            { key: "numero", label: "Radicado" },
            { key: "abogado", label: "Responsable" },
            { key: "estado_consulta", label: "Estado" },
            { key: "actuaciones", label: "Actuaciones" },
            { key: "consultado_en", label: "Última consulta" },
          ]
        : resource === "tareas"
          ? [
              { key: "titulo", label: "Tarea" },
              { key: "estado", label: "Estado" },
              { key: "abogado", label: "Responsable" },
              { key: "cliente", label: "Cliente" },
              { key: "proceso", label: "Proceso" },
              { key: "fecha_limite", label: "Vence" },
            ]
          : [
              { key: "nombre_archivo", label: "Documento" },
              ...(contractsOnly ? [{ key: "contrato_id", label: "Contrato" }] : []),
              { key: "estado_revision", label: "Estado de revisión" },
              { key: "proceso", label: "Proceso" },
              { key: "cliente", label: "Cliente" },
              { key: "mime_type", label: "Tipo" },
              { key: "created_at", label: "Cargado" },
            ];

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        overline={`Panel Administrativo · ${sectorLabel}`}
        title={requestsOnly ? "Solicitudes documentales" : contractsOnly ? "Contratos cargados" : resourceNames[resource]}
        description="Registros restringidos a este ámbito administrativo."
        action={
          <div className="flex gap-2">
            {resource === "radicados" && (
              <Button
                variant="outline"
                disabled={working || rows.length === 0}
                onClick={() => void consultAll()}
                icon={<RefreshCw className="size-4" />}
              >
                Consultar todos
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void reload()}
              aria-label="Actualizar inventario"
              icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}
            />
            {canCreate && !requestsOnly && (
              <Button variant="primary" onClick={openCreate} icon={<Plus className="size-4" />}>
                Nuevo
              </Button>
            )}
          </div>
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}
      {resource === "procesos" && (
        <div
          role="group"
          aria-label="Estado de procesos"
          className="inline-flex gap-1 rounded-lg border border-border p-1"
        >
          <button
            type="button"
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
            className={`rounded-md px-3 py-1.5 text-sm ${!archived ? "bg-brand-900 text-white" : "text-foreground-muted"}`}
          >
            Activos
          </button>
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => setArchived(true)}
            className={`rounded-md px-3 py-1.5 text-sm ${archived ? "bg-brand-900 text-white" : "text-foreground-muted"}`}
          >
            Archivados
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="relative min-w-55 flex-1">
          <span className="sr-only">Buscar {resourceNames[resource]}</span>
          <Search className="absolute left-3 top-2.5 size-4 text-foreground-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Buscar ${resourceNames[resource].toLowerCase()}`}
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="Filtrar estado"
          value={state}
          onChange={(event) => setState(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="TODOS">Todos los estados</option>
          {states.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        {resource !== "documentos" && <select aria-label="Filtrar responsable" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="TODOS">Todos los responsables</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.nombre_completo}</option>)}
        </select>}
        {(resource === "tareas" || resource === "documentos") && <select aria-label="Filtrar proceso" value={processFilter} onChange={(event) => setProcessFilter(event.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="TODOS">Todos los procesos</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}</select>}
        {(resource === "tareas" || resource === "documentos") && <select aria-label="Filtrar cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="TODOS">Todos los clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select>}
        <label className="flex items-center gap-2 text-xs text-foreground-muted">Desde<input type="date" aria-label="Desde la fecha" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
        <label className="flex items-center gap-2 text-xs text-foreground-muted">Hasta<input type="date" aria-label="Hasta la fecha" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
      </div>
      {resource === "tareas" && <div role="group" aria-label="Vista de tareas" className="inline-flex gap-1 rounded-md border border-border p-1">
        {(["LISTA", "KANBAN", "CALENDARIO"] as const).map((mode) => <button key={mode} type="button" aria-pressed={taskView === mode} onClick={() => setTaskView(mode)} className={`rounded px-3 py-1.5 text-sm ${taskView === mode ? "bg-brand-900 text-white" : "hover:bg-surface-hover"}`}>{mode === "LISTA" ? "Lista" : mode === "KANBAN" ? "Kanban" : "Calendario"}</button>)}
      </div>}
      {resource === "tareas" && taskView === "KANBAN" && <div className="grid gap-3 xl:grid-cols-4">
        {tasksByState.map(({ status, rows: stateRows }) => <section key={status} aria-label={status} className="min-h-56 rounded-lg border border-border bg-surface-secondary p-3"><h2 className="mb-3 flex items-center justify-between text-sm font-semibold">{status === "EN_CURSO" ? "En curso" : status === "COMPLETADA" ? "Completadas" : status === "CANCELADA" ? "Canceladas" : "Pendientes"}<span className="rounded-full bg-surface px-2 py-0.5 text-xs text-foreground-muted">{stateRows.length}</span></h2><div className="space-y-2">{stateRows.map((row) => <button key={row.id} type="button" onClick={() => openEdit(row)} className="w-full rounded-md border border-border bg-surface p-3 text-left hover:bg-surface-hover"><p className="font-medium">{String(row.titulo ?? row.nombre ?? "Tarea")}</p><p className="mt-1 text-xs text-foreground-muted">{display(row.owner_id ? owners.find((owner) => owner.id === row.owner_id)?.nombre_completo : "")}</p><p className="mt-1 text-xs text-foreground-muted">{display(row.proceso)}{row.fecha_limite ? ` · ${display(row.fecha_limite)}` : ""}</p></button>)}</div></section>)}
      </div>}
      {resource === "tareas" && taskView === "CALENDARIO" && <section className="space-y-3 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Vencimientos</h2><label className="text-xs text-foreground-muted">Mes<input type="month" aria-label="Mes del calendario de tareas" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label></div>
        <div className="grid grid-cols-7 border-l border-t border-border">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day} className="border-b border-r border-border bg-surface-secondary p-2 text-xs font-semibold text-foreground-muted">{day}</div>)}{Array.from({ length: Math.ceil((calendarOffset + calendarDays) / 7) * 7 }, (_, index) => { const day = index - calendarOffset + 1; if (day < 1 || day > calendarDays) return <div key={`empty-${index}`} className="min-h-24 border-b border-r border-border bg-background-secondary/40" />; const key = `${calendarMonth}-${String(day).padStart(2, "0")}`; return <div key={key} className="min-h-24 border-b border-r border-border p-2"><p className="mb-1 text-xs text-foreground-muted">{day}</p><div className="space-y-1">{(tasksByDueDate.get(key) ?? []).map((row) => <button key={row.id} type="button" onClick={() => openEdit(row)} className="block w-full truncate rounded bg-primary/10 px-1.5 py-1 text-left text-xs text-primary">{String(row.titulo ?? row.nombre ?? "Tarea")}</button>)}</div></div>;})}</div>
      </section>}
      {resource === "documentos" && <nav aria-label="Subpáginas documentales" className="flex flex-wrap gap-2"><Link href="/gestion-procesos/admin/documentos" aria-current={!requestsOnly && !contractsOnly ? "page" : undefined} className={`rounded-md border border-border px-3 py-2 text-sm ${!requestsOnly && !contractsOnly ? "bg-brand-900 text-white" : "hover:bg-surface-hover"}`}>Archivos</Link><Link href="/gestion-procesos/admin/documentos/contratos" aria-current={contractsOnly ? "page" : undefined} className={`rounded-md border border-border px-3 py-2 text-sm ${contractsOnly ? "bg-brand-900 text-white" : "hover:bg-surface-hover"}`}>Contratos cargados</Link><Link href="/gestion-procesos/admin/documentos/solicitudes" aria-current={requestsOnly ? "page" : undefined} className={`rounded-md border border-border px-3 py-2 text-sm ${requestsOnly ? "bg-brand-900 text-white" : "hover:bg-surface-hover"}`}>Solicitudes documentales</Link></nav>}
      {resource === "documentos" && requestsOnly && <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div><h2 className="font-semibold">Solicitudes y revisión</h2><p className="text-sm text-foreground-muted">Seguimiento de documentos solicitados y recibidos por los clientes.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-190 text-left text-sm"><thead className="bg-surface-secondary text-xs text-foreground-muted"><tr><th className="px-3 py-2">Solicitud</th><th className="px-3 py-2">Proceso</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Solicitado</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2">Detalle</th></tr></thead><tbody>{visibleDocumentRequests.map((request) => <tr key={request.id} className="border-t border-border"><td className="px-3 py-2 font-medium"><button type="button" onClick={() => setDetailRequest(request)} className="text-left text-primary hover:underline">{request.titulo}</button></td><td className="px-3 py-2">{request.proceso}</td><td className="px-3 py-2">{request.cliente}</td><td className="px-3 py-2">{labelDocumentRequestStatus(request.estado)}</td><td className="px-3 py-2"><ul className="space-y-1">{request.documentos_requeridos.map((requested) => <li key={requested.id}><span>{requested.nombre}</span><span className="ml-1 text-xs text-foreground-muted">· {requested.estado.replaceAll("_", " ")}</span>{requested.archivo && <span className="block text-xs text-foreground-muted">{requested.archivo}</span>}{requested.documento_id && <button type="button" onClick={() => { const row = rows.find((item) => item.id === requested.documento_id); if (row) openEdit(row); }} className="ml-1 text-xs text-primary underline">Revisar</button>}</li>)}</ul></td><td className="px-3 py-2 text-xs text-foreground-muted">{display(request.solicitado_en)}</td><td className="px-3 py-2 text-xs text-foreground-muted">{display(request.fecha_limite)}</td><td className="px-3 py-2"><button type="button" onClick={() => setDetailRequest(request)} className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-hover">Ver detalle</button></td></tr>)}</tbody></table>{visibleDocumentRequests.length === 0 && <p className="py-6 text-center text-sm text-foreground-muted">No hay solicitudes documentales para estos filtros.</p>}</div>
      </section>}
      {resource === "documentos" && requestsOnly && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visibleDocumentRequests.length > 0 && visibleDocumentRequests.every((request) => selectedRequestIds.includes(request.id))} onChange={(event) => setSelectedRequestIds((current) => event.target.checked ? [...new Set([...current, ...visibleDocumentRequests.map((request) => request.id)])] : current.filter((id) => !visibleDocumentRequests.some((request) => request.id === id)))} />Seleccionar solicitudes visibles</label><span className="text-sm text-foreground-muted">{visibleDocumentRequests.filter((request) => selectedRequestIds.includes(request.id)).length} seleccionadas</span><button type="button" disabled={!visibleDocumentRequests.some((request) => selectedRequestIds.includes(request.id))} onClick={exportSelectedRequests} className="ml-auto rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Exportar selección CSV</button></div>}
      {!requestsOnly && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={routeFiltered.length > 0 && routeFiltered.every((row) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...routeFiltered.map((row) => row.id)])] : current.filter((id) => !routeFiltered.some((row) => row.id === id)))} />Seleccionar registros visibles</label><span className="text-sm text-foreground-muted">{selectedVisibleRows.length} seleccionados</span><div className="ml-auto flex flex-wrap gap-2">{resource === "radicados" && <button type="button" disabled={!selectedVisibleRows.length || working} onClick={() => void runBulkAction("CONSULT")} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Consultar selección</button>}{resource === "procesos" && archived && <button type="button" disabled={!selectedVisibleRows.length || working} onClick={() => void runBulkAction("RESTORE")} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Restaurar seleccionados</button>}{selectedVisibleRows.length > 0 && (resource !== "procesos" || !archived) && <button type="button" disabled={working} onClick={() => void runBulkAction("DELETE")} className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50">{resource === "procesos" ? "Archivar seleccionados" : "Eliminar seleccionados"}</button>}</div></div>}
      {!requestsOnly && <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-195 text-left text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted">
            <tr>
              <th className="px-4 py-3"><input type="checkbox" aria-label="Seleccionar registros visibles" checked={routeFiltered.length > 0 && routeFiltered.every((row) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...routeFiltered.map((row) => row.id)])] : current.filter((id) => !routeFiltered.some((row) => row.id === id)))} /></th>
              <th className="px-4 py-3">ID / detalle</th>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + 3}
                  className="px-4 py-10 text-center text-foreground-muted"
                >
                  Cargando registros...
                </td>
              </tr>
            ) : routeFiltered.length ? (
              routeFiltered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Seleccionar registro ${row.id}`} checked={selectedIds.includes(row.id)} onChange={() => setSelectedIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground-muted">
                    <button type="button" onClick={() => setDetailsRow(row)} className="inline-flex items-center gap-1 rounded px-1 py-1 text-primary hover:bg-brand-50 hover:underline"><Eye className="size-3.5" />{row.id}</button>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="max-w-60 truncate px-4 py-3 text-foreground-secondary"
                    >
                      {column.key === "salud" ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            row.salud === "RIESGO"
                              ? "bg-danger-light text-danger"
                              : row.salud === "ATENCION"
                                ? "bg-warning-light text-warning"
                                : row.salud === "ARCHIVADO"
                                  ? "bg-surface-secondary text-foreground-muted"
                                  : "bg-success-light text-success"
                          }`}
                        >
                          {row.salud === "ATENCION" ? "Atención" : row.salud === "RIESGO" ? "Riesgo" : row.salud === "ARCHIVADO" ? "Archivado" : "Normal"}
                        </span>
                      ) : (
                        display(row[column.key])
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {resource === "documentos" ? (
                        <>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void issueTemporaryLink(row)}
                            aria-label={`Generar enlace temporal para ${String(row.nombre_archivo)}`}
                            title="Generar enlace temporal (15 minutos)"
                            className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50"
                          >
                            <Link2 className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`Editar ${String(row.nombre_archivo)}`}
                            className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            disabled={downloadingDocumentId !== null}
                            onClick={() => void download(row)}
                            aria-label={`Descargar ${String(row.nombre_archivo)}`}
                            className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50"
                          >
                            {downloadingDocumentId === row.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void remove(row)}
                            aria-label={`Eliminar ${String(row.nombre_archivo)}`}
                            className="grid size-9 place-items-center rounded-md border border-danger/30 text-danger hover:bg-danger-light"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      ) : resource === "radicados" ? (
                        <>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void consult(row)}
                            aria-label={`Consultar radicado ${row.numero}`}
                            className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50"
                          >
                            <RefreshCw className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`Editar radicado ${row.numero}`}
                            className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void remove(row)}
                            aria-label={`Eliminar radicado ${row.numero}`}
                            className="grid size-9 place-items-center rounded-md border border-danger/30 text-danger hover:bg-danger-light disabled:opacity-50"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      ) : resource === "procesos" && archived ? (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => void restore(row)}
                          aria-label={`Restaurar proceso ${row.id}`}
                          className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                        >
                          <ArchiveRestore className="size-4" />
                        </button>
                      ) : (
                        <>
                          {resource === "procesos" && row.owner_rol === "ABOGADO_ADMIN" && !archived && (
                            <button
                              type="button"
                              onClick={() => void openTeam(row)}
                              aria-label={`Gestionar equipo de ${String(row.nombre ?? `proceso ${row.id}`)}`}
                              title="Gestionar equipo"
                              className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                            >
                              <Users className="size-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`Editar registro ${row.id}`}
                            className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void remove(row)}
                            aria-label={`${resource === "procesos" ? "Archivar" : "Eliminar"} registro ${row.id}`}
                            className="grid size-9 place-items-center rounded-md border border-danger/30 text-danger hover:bg-danger-light"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length + 3}
                  className="px-4 py-12 text-center text-sm text-foreground-muted"
                >
                  No hay registros para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>}

      {detailsRow && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsRow(null); }}><section role="dialog" aria-modal="true" aria-labelledby="inventory-detail-title" className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl"><header className="sticky top-0 flex items-start justify-between gap-4 border-b border-border bg-surface p-5"><div><p className="text-xs font-semibold uppercase text-primary">{resourceNames[resource]} · {sectorLabel}</p><h2 id="inventory-detail-title" className="mt-1 text-xl font-semibold">{String(detailsRow.nombre ?? detailsRow.numero ?? detailsRow.titulo ?? detailsRow.nombre_archivo ?? `Registro ${detailsRow.id}`)}</h2><p className="text-xs text-foreground-muted">ID {detailsRow.id}</p></div><button type="button" onClick={() => setDetailsRow(null)} aria-label="Cerrar detalle" className="rounded-md border border-border p-2 hover:bg-surface-hover"><X className="size-4" /></button></header><dl className="grid gap-3 p-5 sm:grid-cols-2">{Object.entries(detailsRow).filter(([key]) => !["ruta_archivo", "url_temporal"].includes(key)).map(([key, value]) => <div key={key} className="min-w-0 rounded-lg border border-border p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm text-foreground">{display(value)}</dd></div>)}</dl><footer className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={() => { setDetailsRow(null); openEdit(detailsRow); }} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold !text-white">Editar registro</button><button type="button" onClick={() => setDetailsRow(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cerrar</button></footer></section></div>}
      {detailRequest && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRequest(null); }}><section role="dialog" aria-modal="true" aria-labelledby="document-request-detail-title" className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-2xl"><header className="flex items-start justify-between"><div><p className="text-xs uppercase text-primary">Solicitud documental · #{detailRequest.id}</p><h2 id="document-request-detail-title" className="mt-1 text-lg font-semibold">{detailRequest.titulo}</h2></div><button type="button" onClick={() => setDetailRequest(null)} aria-label="Cerrar detalle" className="rounded-md p-2 hover:bg-surface-hover"><X className="size-4" /></button></header><dl className="grid gap-3 sm:grid-cols-2">{([["Proceso", detailRequest.proceso], ["Cliente", detailRequest.cliente], ["Estado", detailRequest.estado], ["Documento", detailRequest.documento ?? "Pendiente de carga"], ["Solicitado", detailRequest.solicitado_en], ["Fecha límite", detailRequest.fecha_limite]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3"><dt className="text-xs text-foreground-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{display(value)}</dd></div>)}</dl><section className="space-y-2"><h3 className="text-sm font-semibold">Documentos solicitados y estado</h3>{detailRequest.documentos_requeridos.map((requested) => <article key={requested.id} className="rounded-lg border border-border p-3"><p className="font-medium">{requested.nombre} · {requested.estado.replaceAll("_", " ")}</p>{requested.archivo && <p className="text-xs text-foreground-muted">Archivo: {requested.archivo}</p>}{requested.comentario && <p className="mt-1 text-sm text-amber-700">Observación: {requested.comentario}</p>}{requested.documento_id && <button type="button" onClick={() => { const row = rows.find((item) => item.id === requested.documento_id); setDetailRequest(null); if (row) openEdit(row); }} className="mt-2 text-sm text-primary underline">Revisar documento</button>}</article>)}</section>{detailRequest.documento_id && <button type="button" onClick={() => { const row = rows.find((item) => item.id === detailRequest.documento_id); setDetailRequest(null); if (row) openEdit(row); }} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold !text-white">Revisar documento</button>}</section></div>}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            editing?.id
              ? `Editar ${resourceNames[resource]}`
              : `Crear ${resourceNames[resource]}`
          }
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
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
