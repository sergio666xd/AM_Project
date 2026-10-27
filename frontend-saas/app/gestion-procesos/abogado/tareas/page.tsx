"use client";

import { apiRequest } from "@/lib/api";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  ChevronRight,
  Users,
  Gavel,
  Clock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { formatDate, formatDateTime, isOverdue, priorityLabel, priorityRank, taskStatusLabel, toDate } from "@/lib/labels";
import { useNow } from "@/lib/useNow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";


type NivelTarea =
  | "GENERAL"
  | "PROCESO"
  | "CLIENTE"
  | "RADICADO"
  | "ACTUACION";

type Task = {
  id: number;
  titulo: string;
  descripcion?: string | null;
  estado: string;
  prioridad: string;
  fecha_limite?: string | null;
  proceso_id?: number | null;
  radicado_id?: number | null;
  actuacion_id?: number | null;
  cliente_id?: number | null;
  usuario_id: number;
};

type Process = {
  id: number;
  nombre: string;
  radicados?: { id: number; numero: string }[];
  clientes?: { id: number; nombre_completo: string }[];
};

type Client = {
  id: number;
  nombre_completo: string;
};

type Radicado = {
  id: number;
  numero?: string;
  numero_radicado?: string;
  titulo?: string;
};

function estadoLabel(estado: string) {
  switch (estado) {
    case "PENDIENTE":
      return "Pendiente";
    case "EN_CURSO":
      return "En curso";
    case "COMPLETADA":
      return "Completada";
    case "CANCELADA":
      return "Cancelada";
    default:
      return estado;
  }
}

function prioridadLabel(prioridad: string) {
  switch (prioridad) {
    case "BAJA":
      return "Baja";
    case "MEDIA":
      return "Media";
    case "ALTA":
      return "Alta";
    case "URGENTE":
      return "Urgente";
    default:
      return prioridad;
  }
}

function nivelTarea(task: Task): NivelTarea {
  if (task.actuacion_id) return "ACTUACION";
  if (task.radicado_id) return "RADICADO";
  if (task.cliente_id) return "CLIENTE";
  if (task.proceso_id) return "PROCESO";
  return "GENERAL";
}

function nivelLabel(nivel: NivelTarea) {
  switch (nivel) {
    case "PROCESO":
      return "Proceso";
    case "CLIENTE":
      return "Cliente";
    case "RADICADO":
      return "Radicado";
    case "ACTUACION":
      return "Actuación";
    default:
      return "General";
  }
}

function estadoClasses(estado: string) {
  switch (estado) {
    case "COMPLETADA":
      return {
        background: "var(--success-light)",
        color: "var(--success)",
      };
    case "EN_CURSO":
      return {
        background: "var(--info-light)",
        color: "var(--info)",
      };
    case "CANCELADA":
      return {
        background: "var(--surface-muted)",
        color: "var(--foreground-muted)",
      };
    default:
      return {
        background: "var(--surface-muted)",
        color: "var(--foreground-secondary)",
      };
  }
}

function prioridadClasses(prioridad: string) {
  switch (prioridad) {
    case "URGENTE":
      return {
        background: "var(--danger-light)",
        color: "var(--danger)",
      };
    case "ALTA":
    case "MEDIA":
      return {
        background: "var(--warning-light)",
        color: "var(--warning)",
      };
    default:
      return {
        background: "var(--surface-muted)",
        color: "var(--foreground-muted)",
      };
  }
}

function formatearFecha(fecha?: string | null) {
  if (!fecha) return "Sin fecha";

  const date = new Date(fecha);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleDateString("es-CO", { timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function esVencida(task: Task) {
  if (!task.fecha_limite) return false;

  if (
    task.estado === "COMPLETADA" ||
    task.estado === "CANCELADA"
  ) {
    return false;
  }

  return new Date(task.fecha_limite).getTime() < Date.now();
}

export default function TareasPage() {
  const router = useRouter();
  const { user } = useSession();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [radicados, setRadicados] = useState<Radicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);

  const [query, setQuery] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODAS");
  const [filtroPrioridad, setFiltroPrioridad] = useState("TODAS");
  const [filtroNivel, setFiltroNivel] = useState("TODAS");
  const [filtroResponsable, setFiltroResponsable] = useState("TODAS");
  const [filtroProceso, setFiltroProceso] = useState("TODOS");
  const [filtroCliente, setFiltroCliente] = useState("TODOS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState<"LISTA" | "KANBAN" | "CALENDARIO">("LISTA");

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [quickFilter, setQuickFilter] = useState<string | null>("ABIERTAS");
  const now = useNow();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

      const [tasksResponse, processesResponse, clientsResponse, radicadosResponse] =
        await Promise.all([
          apiRequest(`/api/tareas`, {
            headers: headers(),
          }),
          apiRequest(`/api/expedientes/procesos`, {
            headers: headers(),
          }),
          apiRequest(`/api/expedientes/clientes`, {
            headers: headers(),
          }),
          apiRequest(`/api/radicados`, { headers: headers() }),
        ]);

      const [tasksData, processesData, clientsData, radicadosData] =
        await Promise.all([
          tasksResponse.json(),
          processesResponse.json(),
          clientsResponse.json(),
          radicadosResponse.json(),
        ]);

      if (!tasksResponse.ok) {
        throw new Error(
          tasksData.detail || "No fue posible cargar las tareas.",
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
      if (!radicadosResponse.ok) {
        throw new Error(radicadosData.detail || "No fue posible cargar los radicados.");
      }

      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setProcesses(Array.isArray(processesData) ? processesData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setRadicados(Array.isArray(radicadosData) ? radicadosData : (radicadosData.items ?? []));
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

  const request = useCallback(
    async (
      path: string,
      method: string,
      body?: unknown,
    ) => {
      try {
        setError("");
        setNotice("");

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
            data.detail || "No fue posible actualizar la tarea.",
          );
        }

        setNotice(data.mensaje || "Cambios guardados.");
        await load();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Error al guardar.",
        );
      }
    },
    [headers, load],
  );

  const filteredTasks = useMemo(() => {
    const text = query.toLowerCase().trim();

    return tasks.filter((task) => {
      const process = processes.find(
        (item) => item.id === task.proceso_id,
      );
      const client = clients.find(
        (item) => item.id === task.cliente_id,
      );

      const searchableText = [
        task.titulo,
        task.descripcion || "",
        task.estado,
        task.prioridad,
        process?.nombre || "",
        client?.nombre_completo || "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !text || searchableText.includes(text);

      const matchesState =
        filtroEstado === "TODAS" ||
        task.estado === filtroEstado;

      const matchesPriority =
        filtroPrioridad === "TODAS" ||
        task.prioridad === filtroPrioridad;

      const matchesLevel =
        filtroNivel === "TODAS" ||
        nivelTarea(task) === filtroNivel;
      const matchesProcess = filtroProceso === "TODOS" || String(task.proceso_id || "") === filtroProceso;
      const matchesClient = filtroCliente === "TODOS" || String(task.cliente_id || "") === filtroCliente;
      const matchesResponsible = filtroResponsable === "TODAS" ||
        (filtroResponsable === "MIA" && task.usuario_id === user?.id) ||
        (filtroResponsable === "OTRAS" && task.usuario_id !== user?.id);
      const due = task.fecha_limite ? new Date(task.fecha_limite) : null;
      const dueDate = due && !Number.isNaN(due.getTime()) ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}` : "";
      const matchesDueDate = (!desde || (dueDate && dueDate >= desde)) && (!hasta || (dueDate && dueDate <= hasta));

      return (
        matchesSearch &&
        matchesState &&
        matchesPriority &&
        matchesLevel
        && matchesResponsible
        && matchesProcess
        && matchesClient
        && matchesDueDate
      );
    });
  }, [
    tasks,
    processes,
    clients,
    query,
    filtroEstado,
    filtroPrioridad,
    filtroNivel,
    filtroResponsable,
    filtroProceso,
    filtroCliente,
    desde,
    hasta,
    user?.id,
  ]);

  const calendarTasks: CalendarTask[] = filteredTasks.filter((task) => task.fecha_limite).map((task) => ({
    id: task.id, titulo: task.titulo, estado: task.estado, prioridad: task.prioridad,
    fecha_limite: task.fecha_limite || null, href: `/gestion-procesos/abogado/tareas/${task.id}`,
  }));

  function openTask(taskId: number) {
    router.push(`/gestion-procesos/abogado/tareas/${taskId}`);
  }

  const processName = (task: Task) => processes.find((item) => item.id === task.proceso_id)?.nombre;
  const clientName = (task: Task) => clients.find((item) => item.id === task.cliente_id)?.nombre_completo;
  const radicadoNumber = (task: Task) => {
    const radicado = radicados.find((item) => item.id === task.radicado_id);
    return radicado ? radicado.numero || radicado.numero_radicado || radicado.titulo : undefined;
  };
  const isOpen = (task: Task) => task.estado === "PENDIENTE" || task.estado === "EN_CURSO";
  const isOverdueTask = (task: Task) => isOverdue(task.fecha_limite, task.estado, now);
  const dueThisWeek = (task: Task) => {
    const due = toDate(task.fecha_limite)?.getTime();
    return Boolean(due && isOpen(task) && due >= now && due <= now + 7 * 86400000);
  };
  const quickFiltered = filteredTasks.filter((task) =>
    !quickFilter ||
    (quickFilter === "ABIERTAS" && isOpen(task)) ||
    (quickFilter === "VENCIDAS" && isOverdueTask(task)) ||
    (quickFilter === "SEMANA" && dueThisWeek(task)) ||
    (quickFilter === "COMPLETADAS" && task.estado === "COMPLETADA"),
  );
  const activeFilters = [filtroEstado !== "TODAS", filtroPrioridad !== "TODAS", filtroNivel !== "TODAS", filtroResponsable !== "TODAS", filtroProceso !== "TODOS", filtroCliente !== "TODOS", Boolean(desde || hasta)].filter(Boolean).length;
  const clearFilters = () => {
    setFiltroEstado("TODAS");
    setFiltroPrioridad("TODAS");
    setFiltroNivel("TODAS");
    setFiltroResponsable("TODAS");
    setFiltroProceso("TODOS");
    setFiltroCliente("TODOS");
    setDesde("");
    setHasta("");
    setQuickFilter(null);
  };
  const completeTask = (task: Task) => request(`/api/tareas/${task.id}/completar`, "PATCH");
  const deleteTask = (task: Task) => {
    if (window.confirm(`¿Eliminar la tarea “${task.titulo}”?`)) void request(`/api/tareas/${task.id}`, "DELETE");
  };

  const taskColumns: DataTableColumn<Task>[] = [
    {
      key: "titulo",
      header: "Tarea",
      mobile: "title",
      sortValue: (task) => task.titulo,
      render: (task) => (
        <span className="flex min-w-0 items-start gap-2.5">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isOpen(task)) void completeTask(task);
            }}
            disabled={!isOpen(task)}
            aria-label={isOpen(task) ? `Marcar “${task.titulo}” como completada` : "Tarea cerrada"}
            title={isOpen(task) ? "Marcar como completada" : undefined}
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
              task.estado === "COMPLETADA" ? "border-success bg-success text-white" : "border-border-strong hover:border-success hover:bg-success-light"
            }`}
          >
            {task.estado === "COMPLETADA" && <Check aria-hidden="true" className="size-3" />}
          </button>
          <span className={`min-w-0 ${task.estado === "COMPLETADA" || task.estado === "CANCELADA" ? "text-foreground-muted line-through" : ""}`}>{task.titulo}</span>
        </span>
      ),
      className: "max-w-sm",
    },
    {
      key: "contexto",
      header: "Contexto",
      mobile: "subtitle",
      sortValue: (task) => processName(task) || clientName(task) || nivelLabel(nivelTarea(task)),
      searchValue: (task) => [processName(task), clientName(task), radicadoNumber(task), task.descripcion].filter(Boolean).join(" "),
      render: (task) => (
        <span className="block min-w-0 max-w-64">
          <span className="block truncate">{processName(task) || clientName(task) || "Tarea general"}</span>
          {(radicadoNumber(task) || (processName(task) && clientName(task))) && (
            <span className="block truncate text-xs text-foreground-muted">{[clientName(task) && processName(task) ? clientName(task) : null, radicadoNumber(task)].filter(Boolean).join(" · ")}</span>
          )}
        </span>
      ),
    },
    { key: "prioridad", header: "Prioridad", mobile: "badge", sortValue: (task) => priorityRank(task.prioridad), exportValue: (task) => prioridadLabel(task.prioridad), render: (task) => <Badge tone={priorityLabel(task.prioridad).tone}>{priorityLabel(task.prioridad).label}</Badge> },
    { key: "estado", header: "Estado", mobile: "badge", sortValue: (task) => estadoLabel(task.estado), render: (task) => <Badge tone={taskStatusLabel(task.estado).tone}>{taskStatusLabel(task.estado).label}</Badge> },
    {
      key: "fecha_limite",
      header: "Vence",
      mobile: "meta",
      className: "whitespace-nowrap",
      sortValue: (task) => toDate(task.fecha_limite),
      exportValue: (task) => formatDateTime(task.fecha_limite),
      render: (task) => task.fecha_limite ? (
        <span className={isOverdueTask(task) ? "font-semibold text-danger" : dueThisWeek(task) ? "font-medium text-warning" : ""} title={formatDateTime(task.fecha_limite)}>
          {isOverdueTask(task) ? "Venció " : ""}{formatDate(task.fecha_limite)}
        </span>
      ) : <span className="text-foreground-muted">Sin fecha</span>,
    },
    {
      key: "responsable",
      header: "Responsable",
      mobile: "hidden",
      wideOnly: true,
      sortValue: (task) => (task.usuario_id === user?.id ? "Yo" : "Otro"),
      render: (task) => (task.usuario_id === user?.id ? "Yo" : <span className="text-foreground-muted">Otro abogado</span>),
    },
  ];

  const taskActions: RowAction<Task>[] = [
    { label: "Abrir tarea", icon: <ChevronRight />, href: (task) => `/gestion-procesos/abogado/tareas/${task.id}` },
    { label: "Marcar como completada", icon: <Check />, onSelect: (task) => completeTask(task), hidden: (task) => !isOpen(task) },
    { label: "Empezar (en curso)", icon: <Clock />, onSelect: (task) => request(`/api/tareas/${task.id}`, "PUT", { estado: "EN_CURSO" }), hidden: (task) => task.estado !== "PENDIENTE" },
    { label: "Reabrir", icon: <RefreshCw />, onSelect: (task) => request(`/api/tareas/${task.id}`, "PUT", { estado: "PENDIENTE" }), hidden: (task) => isOpen(task) },
    { label: "Ir al proceso", icon: <Gavel />, href: (task) => `/gestion-procesos/abogado/procesos/${task.proceso_id}`, hidden: (task) => !task.proceso_id },
    { label: "Eliminar tarea", icon: <Trash2 />, tone: "danger", separated: true, onSelect: (task) => deleteTask(task) },
  ];

  const selectClass = "h-10 w-full rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground";

  return (
    <div className="motion-swap mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline="Mi día"
        title="Tareas"
        description="Pendientes del despacho por proceso, cliente y fecha límite."
        action={<Button variant="primary" onClick={() => setMostrarModal(true)} icon={<Plus className="size-4" />}>Nueva tarea</Button>}
      />

      <SummaryStrip
        active={quickFilter}
        onSelect={setQuickFilter}
        items={[
          { key: "ABIERTAS", label: "Abiertas", value: filteredTasks.filter(isOpen).length },
          { key: "VENCIDAS", label: "Vencidas", value: filteredTasks.filter(isOverdueTask).length, tone: "danger" },
          { key: "SEMANA", label: "Vencen en 7 días", value: filteredTasks.filter(dueThisWeek).length, tone: "warning" },
          { key: "COMPLETADAS", label: "Completadas", value: filteredTasks.filter((task) => task.estado === "COMPLETADA").length, tone: "success" },
        ]}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X className="size-4" /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-success/30 bg-success-light px-4 py-3 text-sm text-success">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso"><X className="size-4" /></button>
        </div>
      )}

      {/* Filtros compartidos por las tres vistas. */}
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar tarea, proceso o cliente"
              aria-label="Buscar tareas"
              className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            aria-expanded={mostrarFiltros}
            className={`inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-medium ${activeFilters ? "border-primary bg-primary-light text-primary" : "border-border text-foreground hover:bg-surface-hover"}`}
          >
            <Filter aria-hidden="true" className="size-4" />
            Filtros{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          {activeFilters > 0 && <button type="button" onClick={clearFilters} className="h-10 px-2 text-sm font-medium text-primary hover:underline">Limpiar</button>}
          <button type="button" onClick={() => void load()} disabled={actualizando} aria-label="Actualizar" className="grid size-10 place-items-center rounded-[var(--radius-md)] border border-border text-foreground hover:bg-surface-hover disabled:opacity-50 sm:ml-auto">
            <RefreshCw aria-hidden="true" className={`size-4 ${actualizando ? "animate-spin" : ""}`} />
          </button>
        </div>
        {mostrarFiltros && (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <select aria-label="Estado" value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)} className={selectClass}>
              <option value="TODAS">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EN_CURSO">En curso</option>
              <option value="COMPLETADA">Completadas</option>
              <option value="CANCELADA">Canceladas</option>
            </select>
            <select aria-label="Prioridad" value={filtroPrioridad} onChange={(event) => setFiltroPrioridad(event.target.value)} className={selectClass}>
              <option value="TODAS">Todas las prioridades</option>
              <option value="URGENTE">Urgentes</option>
              <option value="ALTA">Altas</option>
              <option value="MEDIA">Medias</option>
              <option value="BAJA">Bajas</option>
            </select>
            <select aria-label="Responsable" value={filtroResponsable} onChange={(event) => setFiltroResponsable(event.target.value)} className={selectClass}>
              <option value="TODAS">Todos los responsables</option>
              <option value="MIA">Asignadas a mí</option>
              <option value="OTRAS">Asignadas a otros</option>
            </select>
            <select aria-label="Contexto" value={filtroNivel} onChange={(event) => setFiltroNivel(event.target.value)} className={selectClass}>
              <option value="TODAS">Todos los contextos</option>
              <option value="GENERAL">Generales</option>
              <option value="PROCESO">De proceso</option>
              <option value="CLIENTE">De cliente</option>
              <option value="RADICADO">De radicado</option>
              <option value="ACTUACION">De actuación</option>
            </select>
            <select aria-label="Proceso" value={filtroProceso} onChange={(event) => setFiltroProceso(event.target.value)} className={selectClass}>
              <option value="TODOS">Todos los procesos</option>
              {processes.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}
            </select>
            <select aria-label="Cliente" value={filtroCliente} onChange={(event) => setFiltroCliente(event.target.value)} className={selectClass}>
              <option value="TODOS">Todos los clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}
            </select>
            <label className="text-xs text-foreground-muted">Vence desde<input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} className={`mt-1 ${selectClass}`} /></label>
            <label className="text-xs text-foreground-muted">Vence hasta<input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} className={`mt-1 ${selectClass}`} /></label>
          </div>
        )}
      </section>

      <SegmentedControl
        label="Vista de tareas"
        value={vista}
        onChange={setVista}
        options={[{ value: "LISTA", label: "Lista" }, { value: "KANBAN", label: "Tablero" }, { value: "CALENDARIO", label: "Calendario" }]}
      />

      {vista === "CALENDARIO" ? (
        <TaskMonthCalendar tasks={calendarTasks} />
      ) : vista === "KANBAN" ? (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
          {["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"].map((status) => {
            const columnTasks = quickFiltered.filter((task) => task.estado === status);
            return (
              <section key={status} className="min-h-48 w-[82vw] max-w-sm shrink-0 snap-start rounded-[var(--radius-lg)] border border-border bg-surface-muted p-3 lg:w-auto lg:max-w-none">
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
                  {estadoLabel(status)}
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-foreground-muted">{columnTasks.length}</span>
                </h2>
                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      processes={processes}
                      clients={clients}
                      radicados={radicados}
                      onOpen={() => openTask(task.id)}
                      onComplete={() => void completeTask(task)}
                      onDelete={() => deleteTask(task)}
                      onStatusChange={(estado) => void request(`/api/tareas/${task.id}`, "PUT", { estado })}
                    />
                  ))}
                  {columnTasks.length === 0 && <p className="py-6 text-center text-xs text-foreground-muted">Sin tareas</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <DataTable
          caption="Tareas"
          rows={quickFiltered}
          columns={taskColumns}
          rowKey={(task) => task.id}
          rowHref={(task) => `/gestion-procesos/abogado/tareas/${task.id}`}
          rowActions={taskActions}
          bulkActions={[
            { label: "Completar", icon: <Check />, onRun: async (rows) => { for (const task of rows.filter(isOpen)) await completeTask(task); } },
            {
              label: "Eliminar",
              icon: <Trash2 />,
              tone: "danger",
              onRun: async (rows) => {
                if (!window.confirm(`¿Eliminar ${rows.length} tarea(s)?`)) return;
                for (const task of rows) await request(`/api/tareas/${task.id}`, "DELETE");
              },
            },
          ]}
          rowTone={(task) => (isOverdueTask(task) ? "danger" : undefined)}
          searchable={false}
          initialSort={{ key: "fecha_limite", direction: "asc" }}
          exportFilename="tareas"
          storageKey="abogado-tareas"
          loading={loading}
          emptyTitle={tasks.length === 0 ? "No tienes tareas" : "Ninguna tarea coincide con los filtros"}
          emptyDescription={tasks.length === 0 ? "Crea una tarea para organizar el trabajo del despacho." : "Ajusta la búsqueda o los filtros."}
          emptyAction={tasks.length === 0 ? <Button variant="primary" onClick={() => setMostrarModal(true)} icon={<Plus className="size-4" />}>Nueva tarea</Button> : <Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>}
        />
      )}

      {mostrarModal && (
        <NuevaTareaModal
          processes={processes}
          clients={clients}
          onClose={() => setMostrarModal(false)}
          onCreated={() => {
            setMostrarModal(false);
            void load();
          }}
          onError={(message) => setError(message)}
        />
      )}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={
        checked
          ? "Marcar como pendiente"
          : "Marcar como completada"
      }
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
      style={{
        background: checked ? "var(--primary)" : "var(--surface)",
        borderColor: checked
          ? "var(--primary)"
          : "var(--border-strong)",
        color: "var(--primary-foreground)",
      }}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </button>
  );
}

function TaskCard({
  task,
  processes,
  clients,
  radicados,
  onOpen,
  onComplete,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  processes: Process[];
  clients: Client[];
  radicados: Radicado[];
  onOpen: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  const process = processes.find(
    (item) => item.id === task.proceso_id,
  );
  const client = clients.find(
    (item) => item.id === task.cliente_id,
  );
  const hasClientAssociation = Boolean(task.cliente_id || process?.clientes?.length);
  const radicado = radicados.find((item) => item.id === task.radicado_id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-xl border p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
      title="Ver detalle de la tarea"
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Checkbox
            checked={task.estado === "COMPLETADA"}
            onChange={onComplete}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h3 className="truncate font-semibold text-foreground">{task.titulo}</h3>{hasClientAssociation && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"><Users size={12} />{task.cliente_id ? "Tarea asignada" : "Proceso con clientes"}</span>}</div>
              {task.descripcion && (
                <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">
                  {task.descripcion}
                </p>
              )}
            </div>

            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={prioridadClasses(task.prioridad)}
            >
              {prioridadLabel(task.prioridad)}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {process && (
              <div>
                <p className="text-xs text-foreground-muted">Proceso</p>
                <p className="text-sm text-foreground">
                  {process.nombre}
                </p>
              </div>
            )}
            {radicado && <div><p className="text-xs text-foreground-muted">Radicado</p><p className="text-sm text-foreground">{radicado.numero || radicado.numero_radicado || `#${radicado.id}`}</p></div>}

            {client && (
              <div>
                <p className="text-xs text-foreground-muted">Cliente</p>
                <p className="text-sm text-foreground">
                  {client.nombre_completo}
                </p>
              </div>
            )}
            {!client && process?.clientes && process.clientes.length > 0 && <div><p className="text-xs text-foreground-muted">Clientes del proceso</p><p className="text-sm text-foreground">{process.clientes.map((item) => item.nombre_completo).join(", ")}</p></div>}

            {!process && !client && !radicado && (
              <p className="text-xs text-foreground-muted">
                {nivelLabel(nivelTarea(task))}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={estadoClasses(task.estado)}
              >
                {estadoLabel(task.estado)}
              </span>

              {task.fecha_limite && (
                <span
                  className="text-xs"
                  style={{
                    color: esVencida(task)
                      ? "var(--danger)"
                      : "var(--foreground-muted)",
                    fontWeight: esVencida(task) ? 600 : 400,
                  }}
                >
                  {formatearFecha(task.fecha_limite)}
                  {esVencida(task) ? " · Vencida" : ""}
                </span>
              )}
            </div>
          </div>

          <div
            className="mt-4 flex items-center justify-between gap-2 border-t pt-3"
            style={{ borderColor: "var(--border)" }}
          >
            <select
              aria-label="Cambiar estado"
              value={task.estado}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                onStatusChange(event.target.value);
              }}
              className="min-h-11 rounded-full border-0 px-3 py-1.5 text-xs font-semibold outline-none"
              style={estadoClasses(task.estado)}
            >
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_CURSO">En curso</option>
              <option value="COMPLETADA">Completada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onComplete();
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-success transition hover:bg-success-light"
                title="Completar tarea"
                aria-label="Completar tarea"
              >
                <Check size={16} />
                <span>Completar</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground-muted transition hover:bg-danger-light hover:text-danger"
                title="Eliminar tarea"
                aria-label="Eliminar tarea"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NuevaTareaModal({
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const titulo = String(form.get("titulo") || "").trim();

    if (!titulo) {
      onError("El título es obligatorio.");
      return;
    }

    try {
      setSaving(true);

      const response = await apiRequest(`/api/tareas`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          titulo,
          descripcion:
            String(form.get("descripcion") || "").trim() || null,
          prioridad: String(form.get("prioridad") || "MEDIA"),
          proceso_id: form.get("proceso_id")
            ? Number(form.get("proceso_id"))
            : null,
          cliente_id: form.get("cliente_id")
            ? Number(form.get("cliente_id"))
            : null,
          // El campo datetime-local está en hora local; se envía en UTC como
          // el resto de formularios para que los recordatorios se calculen bien.
          fecha_limite: form.get("fecha_limite")
            ? new Date(String(form.get("fecha_limite"))).toISOString()
            : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No se pudo crear la tarea.",
        );
      }

      onCreated();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la tarea.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="motion-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={create}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 sm:p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Nueva tarea</h2>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--foreground-muted)" }}
            >
              Crea una tarea y asígnala opcionalmente a un proceso o
              cliente.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2"
            style={{ color: "var(--foreground-muted)" }}
            aria-label="Cerrar modal"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Título
            </label>
            <input
              name="titulo"
              required
              autoFocus
              placeholder="Ej. Revisar contestación de demanda"
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
              Descripción
            </label>
            <textarea
              name="descripcion"
              rows={3}
              placeholder="Detalles de la tarea..."
              className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Proceso
              </label>
              <select
                name="proceso_id"
                defaultValue=""
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="">Sin proceso</option>
                {processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Cliente
              </label>
              <select
                name="cliente_id"
                defaultValue=""
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="">Sin cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nombre_completo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Prioridad
              </label>
              <select
                name="prioridad"
                defaultValue="MEDIA"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="BAJA">Baja</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Fecha límite
              </label>
              <input
                name="fecha_limite"
                type="datetime-local"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>
          </div>

          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{ borderColor: "var(--border)" }}
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
              className="rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {saving ? "Creando..." : "Crear tarea"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
