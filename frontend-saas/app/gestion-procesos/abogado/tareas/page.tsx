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
  ChevronDown,
  ClipboardList,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";


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
};

type Client = {
  id: number;
  nombre_completo: string;
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

  return date.toLocaleDateString("es-CO", {
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

      const [tasksResponse, processesResponse, clientsResponse] =
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
        ]);

      const [tasksData, processesData, clientsData] =
        await Promise.all([
          tasksResponse.json(),
          processesResponse.json(),
          clientsResponse.json(),
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

      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setProcesses(Array.isArray(processesData) ? processesData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);
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

  const pendientes = tasks.filter(
    (task) =>
      task.estado === "PENDIENTE" ||
      task.estado === "EN_CURSO",
  ).length;

  const enCurso = tasks.filter(
    (task) => task.estado === "EN_CURSO",
  ).length;

  const vencidas = tasks.filter(esVencida).length;

  const completadas = tasks.filter(
    (task) => task.estado === "COMPLETADA",
  ).length;

  function openTask(taskId: number) {
    router.push(`/gestion-procesos/abogado/tareas/${taskId}`);
  }

  if (loading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        style={{ color: "var(--foreground-muted)" }}
      >
        Cargando tareas...
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
            <ClipboardList
              size={24}
              style={{ color: "var(--primary)" }}
            />
            <h1 className="text-2xl font-semibold">Tareas</h1>
          </div>

          <p
            className="mt-1 text-sm"
            style={{ color: "var(--foreground-muted)" }}
          >
            Organiza pendientes, procesos, clientes y fechas
            límite de tu despacho.
          </p>
        </div>
      </div>

      {/* BARRA DE ACCIONES */}
      <div
        className="rounded-xl border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="flex flex-wrap items-center gap-1 p-2">
          <button
            onClick={() => setMostrarModal(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <Plus size={17} />
            Nueva tarea
          </button>

          <button
            onClick={() => void load()}
            disabled={actualizando}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition disabled:opacity-50"
            style={{ color: "var(--foreground-secondary)" }}
          >
            <RefreshCw
              size={16}
              className={actualizando ? "animate-spin" : ""}
            />
            Actualizar
          </button>

          <div
            className="mx-1 hidden h-6 w-px sm:block"
            style={{ background: "var(--border)" }}
          />

          <button
            onClick={() =>
              setFiltroEstado(
                filtroEstado === "PENDIENTE"
                  ? "TODAS"
                  : "PENDIENTE",
              )
            }
            className="rounded-lg px-3 py-2 text-sm transition"
            style={{
              background:
                filtroEstado === "PENDIENTE"
                  ? "var(--primary-light)"
                  : "transparent",
              color:
                filtroEstado === "PENDIENTE"
                  ? "var(--primary)"
                  : "var(--foreground-secondary)",
            }}
          >
            Pendientes
          </button>

          <button
            onClick={() =>
              setFiltroEstado(
                filtroEstado === "COMPLETADA"
                  ? "TODAS"
                  : "COMPLETADA",
              )
            }
            className="rounded-lg px-3 py-2 text-sm transition"
            style={{
              background:
                filtroEstado === "COMPLETADA"
                  ? "var(--success-light)"
                  : "transparent",
              color:
                filtroEstado === "COMPLETADA"
                  ? "var(--success)"
                  : "var(--foreground-secondary)",
            }}
          >
            Completadas
          </button>

          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
            style={{
              background: mostrarFiltros
                ? "var(--surface-hover)"
                : "transparent",
              color: "var(--foreground-secondary)",
            }}
          >
            <Filter size={16} />
            Filtros
            <ChevronDown
              size={15}
              className={`transition ${
                mostrarFiltros ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* FILTROS */}
        {mostrarFiltros && (
          <div
            className="grid grid-cols-1 gap-3 border-t p-3 md:grid-cols-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="relative md:col-span-2">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--foreground-muted)" }}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar tarea, proceso o cliente..."
                className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <select
              value={filtroNivel}
              onChange={(event) =>
                setFiltroNivel(event.target.value)
              }
              className="rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <option value="TODAS">Todos los contextos</option>
              <option value="GENERAL">Generales</option>
              <option value="PROCESO">Procesos</option>
              <option value="CLIENTE">Clientes</option>
              <option value="RADICADO">Radicados</option>
              <option value="ACTUACION">Actuaciones</option>
            </select>

            <select value={filtroProceso} onChange={(event) => setFiltroProceso(event.target.value)} className="rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}>
              <option value="TODOS">Todos los procesos</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}
            </select>
            <select value={filtroCliente} onChange={(event) => setFiltroCliente(event.target.value)} className="rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}>
              <option value="TODOS">Todos los clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}
            </select>

            <select value={filtroResponsable} onChange={(event) => setFiltroResponsable(event.target.value)} className="rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }}>
              <option value="TODAS">Todos los responsables</option><option value="MIA">Asignadas a mí</option><option value="OTRAS">Asignadas a otros</option>
            </select>
            <label className="text-xs text-foreground-muted">Vence desde<input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="text-xs text-foreground-muted">Vence hasta<input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>

            <select
              value={filtroPrioridad}
              onChange={(event) =>
                setFiltroPrioridad(event.target.value)
              }
              className="rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <option value="TODAS">Todas las prioridades</option>
              <option value="URGENTE">Urgentes</option>
              <option value="ALTA">Altas</option>
              <option value="MEDIA">Medias</option>
              <option value="BAJA">Bajas</option>
            </select>
          </div>
        )}
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumenCard label="Pendientes" value={pendientes} />
        <ResumenCard label="En curso" value={enCurso} />
        <ResumenCard label="Vencidas" value={vencidas} danger />
        <ResumenCard
          label="Completadas"
          value={completadas}
          success
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
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Cerrar error">
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
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            aria-label="Cerrar notificación"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vista de tareas">
        {([ ["LISTA", "Lista"], ["KANBAN", "Kanban"], ["CALENDARIO", "Calendario"] ] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={vista === key} onClick={() => setVista(key)} className="rounded-lg border px-3 py-2 text-sm font-medium" style={{ borderColor: vista === key ? "var(--primary)" : "var(--border)", background: vista === key ? "var(--primary-light)" : "var(--surface)", color: vista === key ? "var(--primary)" : "var(--foreground-secondary)" }}>{label}</button>)}
      </div>

      {vista === "CALENDARIO" ? <TaskMonthCalendar tasks={calendarTasks} /> : vista === "KANBAN" ? <div className="grid gap-4 lg:grid-cols-4">{["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"].map((status) => <section key={status} className="min-h-48 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}><h2 className="mb-3 flex items-center justify-between text-sm font-semibold">{estadoLabel(status)}<span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs">{filteredTasks.filter((task) => task.estado === status).length}</span></h2><div className="space-y-2">{filteredTasks.filter((task) => task.estado === status).map((task) => <TaskCard key={task.id} task={task} processes={processes} clients={clients} onOpen={() => openTask(task.id)} onComplete={() => void request(`/api/tareas/${task.id}/completar`, "PATCH")} onDelete={() => { if (confirm("¿Eliminar tarea?")) void request(`/api/tareas/${task.id}`, "DELETE"); }} onStatusChange={(estado) => void request(`/api/tareas/${task.id}`, "PUT", { estado })} />)}</div></section>)}</div> : <>
      {/* ESCRITORIO */}
      <div
        className="hidden overflow-hidden rounded-xl border md:block"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <table className="w-full border-collapse text-left">
          <thead>
            <tr
              className="border-b text-xs font-semibold uppercase tracking-wide"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground-muted)",
                background: "var(--surface-muted)",
              }}
            >
              <th className="w-12 px-4 py-3" />
              <th className="px-4 py-3">Tarea</th>
              <th className="px-4 py-3">Contexto</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Fecha límite</th>
              <th className="px-4 py-3">Estado</th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4">
                  <EmptyState />
                </td>
              </tr>
            ) : (
              filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  processes={processes}
                  clients={clients}
                  onOpen={() => openTask(task.id)}
                  onComplete={() =>
                    void request(
                      `/api/tareas/${task.id}/completar`,
                      "PATCH",
                    )
                  }
                  onDelete={() => {
                    if (confirm("¿Eliminar tarea?")) {
                      void request(`/api/tareas/${task.id}`, "DELETE");
                    }
                  }}
                  onStatusChange={(estado) =>
                    void request(
                      `/api/tareas/${task.id}`,
                      "PUT",
                      { estado },
                    )
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MÓVIL */}
      <div className="space-y-3 md:hidden">
        {filteredTasks.length === 0 ? (
          <EmptyState />
        ) : (
          filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              processes={processes}
              clients={clients}
              onOpen={() => openTask(task.id)}
              onComplete={() =>
                void request(
                  `/api/tareas/${task.id}/completar`,
                  "PATCH",
                )
              }
              onDelete={() => {
                if (confirm("¿Eliminar tarea?")) {
                  void request(`/api/tareas/${task.id}`, "DELETE");
                }
              }}
              onStatusChange={(estado) =>
                void request(
                  `/api/tareas/${task.id}`,
                  "PUT",
                  { estado },
                )
              }
            />
          ))
        )}
      </div>
      </>}

      {/* MODAL */}
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
        style={{ color: "var(--foreground-muted)" }}
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

function TaskRow({
  task,
  processes,
  clients,
  onOpen,
  onComplete,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  processes: Process[];
  clients: Client[];
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

  return (
    <tr
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      tabIndex={0}
      className="group cursor-pointer border-b transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      style={{ borderColor: "var(--border)" }}
      title="Ver detalle de la tarea"
    >
      <td className="px-4 py-4">
        <Checkbox
          checked={task.estado === "COMPLETADA"}
          onChange={onComplete}
        />
      </td>

      <td className="px-4 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground group-hover:text-primary">
            {task.titulo}
          </p>
          {task.descripcion && (
            <p className="mt-1 max-w-md truncate text-xs text-foreground-muted">
              {task.descripcion}
            </p>
          )}
        </div>
      </td>

      <td className="px-4 py-4">
        <div className="space-y-1">
          {process && (
            <p className="text-sm text-foreground">{process.nombre}</p>
          )}
          {client && (
            <p className="text-xs text-foreground-muted">
              {client.nombre_completo}
            </p>
          )}
          {!process && !client && (
            <span className="text-xs text-foreground-muted">
              {nivelLabel(nivelTarea(task))}
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-4">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={prioridadClasses(task.prioridad)}
        >
          {prioridadLabel(task.prioridad)}
        </span>
      </td>

      <td className="px-4 py-4">
        <span
          className="text-sm"
          style={{
            color: esVencida(task)
              ? "var(--danger)"
              : "var(--foreground-secondary)",
          }}
        >
          {formatearFecha(task.fecha_limite)}
        </span>
      </td>

      <td className="px-4 py-4">
        <select
          aria-label="Cambiar estado"
          value={task.estado}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            onStatusChange(event.target.value);
          }}
          className="appearance-none rounded-full border-0 px-3 py-1.5 text-xs font-semibold outline-none"
          style={estadoClasses(task.estado)}
        >
          <option value="PENDIENTE">Pendiente</option>
          <option value="EN_CURSO">En curso</option>
          <option value="COMPLETADA">Completada</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
      </td>

      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onComplete();
            }}
            className="rounded-lg p-2 text-foreground-muted transition hover:bg-success-light hover:text-success"
            title="Completar tarea"
            aria-label="Completar tarea"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="rounded-lg p-2 text-foreground-muted transition hover:bg-danger-light hover:text-danger"
            title="Eliminar tarea"
            aria-label="Eliminar tarea"
          >
            <Trash2 size={16} />
          </button>
          <ChevronRight
            size={16}
            className="text-foreground-muted"
          />
        </div>
      </td>
    </tr>
  );
}

function TaskCard({
  task,
  processes,
  clients,
  onOpen,
  onComplete,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  processes: Process[];
  clients: Client[];
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
              <h3 className="truncate font-semibold text-foreground">
                {task.titulo}
              </h3>
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

            {client && (
              <div>
                <p className="text-xs text-foreground-muted">Cliente</p>
                <p className="text-sm text-foreground">
                  {client.nombre_completo}
                </p>
              </div>
            )}

            {!process && !client && (
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
              className="rounded-full border-0 px-3 py-1.5 text-xs font-semibold outline-none"
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
                className="rounded-lg p-2 text-foreground-muted transition hover:bg-success-light hover:text-success"
                title="Completar tarea"
                aria-label="Completar tarea"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                className="rounded-lg p-2 text-foreground-muted transition hover:bg-danger-light hover:text-danger"
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

function EmptyState() {
  return (
    <div
      className="rounded-xl border border-dashed py-16 text-center"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border-strong)",
      }}
    >
      <ClipboardList
        size={32}
        className="mx-auto"
        style={{ color: "var(--foreground-muted)" }}
      />
      <p className="mt-3 text-sm font-medium">
        No hay tareas para mostrar
      </p>
      <p
        className="mt-1 text-xs"
        style={{ color: "var(--foreground-muted)" }}
      >
        Ajusta los filtros o crea una nueva tarea.
      </p>
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
          fecha_limite:
            String(form.get("fecha_limite") || "") || null,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
