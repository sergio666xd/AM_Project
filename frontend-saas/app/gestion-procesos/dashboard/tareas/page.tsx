"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ClipboardList,
  Filter,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";

type EstadoTarea =
  | "PENDIENTE"
  | "EN_CURSO"
  | "COMPLETADA"
  | "CANCELADA";

type PrioridadTarea =
  | "BAJA"
  | "MEDIA"
  | "ALTA"
  | "URGENTE";

type NivelTarea = "GENERAL" | "RADICADO" | "ACTUACION";

type Actuacion = {
  id: number;
  orden: number;
  fecha_actuacion: string;
  actuacion: string;
  anotacion: string;
  fecha_inicia_termino: string;
  fecha_finaliza_termino: string;
  fecha_registro: string;
  es_fijacion: boolean;
};

type Radicado = {
  id: number;
  numero: string;
  estado_consulta: string;
  despacho_departamento: string;
  demandante: string;
  demandado: string;
  consultado_en: string;
  alerta_enviada: boolean;
  detalle_pendiente: string;
  actuaciones: Actuacion[];
};

type Tarea = {
  id: number;
  usuario_id: number;
  radicado_id: number | null;
  actuacion_id: number | null;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  fecha_limite: string | null;
  completada_en: string | null;
  created_at: string;
  updated_at: string;
  subtareas: {
    id: number;
    tarea_id: number;
    titulo: string;
    completada: boolean;
    orden: number;
    completada_en: string | null;
  }[];
  recordatorios: {
    id: number;
    tarea_id: number;
    canal: string;
    activo: boolean;
    fecha_hora: string | null;
    anticipacion_minutos: number | null;
    enviado_en: string | null;
  }[];
};

function estadoLabel(estado: EstadoTarea) {
  switch (estado) {
    case "PENDIENTE":
      return "Pendiente";
    case "EN_CURSO":
      return "En curso";
    case "COMPLETADA":
      return "Completada";
    case "CANCELADA":
      return "Cancelada";
  }
}

function prioridadLabel(prioridad: PrioridadTarea) {
  switch (prioridad) {
    case "BAJA":
      return "Baja";
    case "MEDIA":
      return "Media";
    case "ALTA":
      return "Alta";
    case "URGENTE":
      return "Urgente";
  }
}

function formatearFecha(fecha: string | null) {
  if (!fecha) return "Sin fecha";

  return new Date(fecha).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function esVencida(tarea: Tarea) {
  if (!tarea.fecha_limite) return false;

  if (
    tarea.estado === "COMPLETADA" ||
    tarea.estado === "CANCELADA"
  ) {
    return false;
  }

  return new Date(tarea.fecha_limite).getTime() < Date.now();
}

function nivelTarea(tarea: Tarea): NivelTarea {
  if (tarea.actuacion_id) return "ACTUACION";
  if (tarea.radicado_id) return "RADICADO";
  return "GENERAL";
}

function estadoClasses(estado: EstadoTarea) {
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

function prioridadClasses(prioridad: PrioridadTarea) {
  switch (prioridad) {
    case "URGENTE":
      return {
        background: "var(--danger-light)",
        color: "var(--danger)",
      };

    case "ALTA":
      return {
        background: "var(--warning-light)",
        color: "var(--warning)",
      };

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

export default function TareasPage() {
  const router = useRouter();
  const { token, loading: sessionLoading } = useSession();

  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [radicados, setRadicados] = useState<Radicado[]>([]);

  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODAS");
  const [filtroPrioridad, setFiltroPrioridad] =
    useState("TODAS");
  const [filtroNivel, setFiltroNivel] = useState("TODAS");

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);

  const cargarDatos = async () => {
    if (!token) return;

    try {
      setActualizando(true);
      setError("");

      const [tareasResponse, radicadosResponse] =
        await Promise.all([
          apiRequest(
            "/api/tareas",
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          apiRequest(
            "/api/radicados",
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
        ]);

      if (!tareasResponse.ok) {
        throw new Error("No se pudieron cargar las tareas.");
      }

      if (!radicadosResponse.ok) {
        throw new Error("No se pudieron cargar los radicados.");
      }

      const tareasData = await tareasResponse.json();
      const radicadosData = await radicadosResponse.json();

      setTareas(tareasData);
      setRadicados(radicadosData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cargar la información."
      );
    } finally {
      setLoading(false);
      setActualizando(false);
    }
  };

  useEffect(() => {
    if (sessionLoading) return;

    if (!token) {
      router.replace("/auth/login");
      return;
    }

    cargarDatos();
  }, [token, sessionLoading]);

  const tareasFiltradas = useMemo(() => {
    const textoBusqueda = busqueda.toLowerCase().trim();

    return tareas.filter((tarea) => {
      const coincideBusqueda =
        !textoBusqueda ||
        tarea.titulo.toLowerCase().includes(textoBusqueda) ||
        (tarea.descripcion ?? "")
          .toLowerCase()
          .includes(textoBusqueda);

      const coincideEstado =
        filtroEstado === "TODAS" ||
        tarea.estado === filtroEstado;

      const coincidePrioridad =
        filtroPrioridad === "TODAS" ||
        tarea.prioridad === filtroPrioridad;

      const coincideNivel =
        filtroNivel === "TODAS" ||
        nivelTarea(tarea) === filtroNivel;

      return (
        coincideBusqueda &&
        coincideEstado &&
        coincidePrioridad &&
        coincideNivel
      );
    });
  }, [
    tareas,
    busqueda,
    filtroEstado,
    filtroPrioridad,
    filtroNivel,
  ]);

  const pendientes = tareas.filter(
    (t) =>
      t.estado === "PENDIENTE" ||
      t.estado === "EN_CURSO"
  ).length;

  const enCurso = tareas.filter(
    (t) => t.estado === "EN_CURSO"
  ).length;

  const vencidas = tareas.filter(esVencida).length;

  const completadas = tareas.filter(
    (t) => t.estado === "COMPLETADA"
  ).length;

  const completarTarea = async (
    tarea: Tarea,
    completada: boolean
  ) => {
    if (!token) return;

    const estadoAnterior = tarea.estado;

    setTareas((actuales) =>
      actuales.map((item) =>
        item.id === tarea.id
          ? {
              ...item,
              estado: completada
                ? "COMPLETADA"
                : "PENDIENTE",
              completada_en: completada
                ? new Date().toISOString()
                : null,
            }
          : item
      )
    );

    try {
      const response = await apiRequest(
        `/api/tareas/${tarea.id}/completar`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error();
      }
    } catch {
      setTareas((actuales) =>
        actuales.map((item) =>
          item.id === tarea.id
            ? {
                ...item,
                estado: estadoAnterior,
                completada_en: tarea.completada_en,
              }
            : item
        )
      );

      setError("No se pudo actualizar la tarea.");
    }
  };

  if (sessionLoading || loading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        style={{
          color: "var(--foreground-muted)",
        }}
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

            <h1 className="text-2xl font-semibold">
              Tareas
            </h1>
          </div>

          <p
            className="mt-1 text-sm"
            style={{ color: "var(--foreground-muted)" }}
          >
            Organiza tus pendientes, procesos y fechas límite.
          </p>
        </div>
      </div>

      {/* CINTA DE OPCIONES */}
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
            onClick={() => cargarDatos()}
            disabled={actualizando}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
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

          <div
            className="mx-1 hidden h-6 w-px sm:block"
            style={{ background: "var(--border)" }}
          />

          <button
            onClick={() =>
              setFiltroEstado(
                filtroEstado === "PENDIENTE"
                  ? "TODAS"
                  : "PENDIENTE"
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
                  : "COMPLETADA"
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
            onClick={() =>
              setMostrarFiltros(!mostrarFiltros)
            }
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
                style={{
                  color: "var(--foreground-muted)",
                }}
              />

              <input
                value={busqueda}
                onChange={(e) =>
                  setBusqueda(e.target.value)
                }
                placeholder="Buscar tarea..."
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
              onChange={(e) =>
                setFiltroNivel(e.target.value)
              }
              className="rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <option value="TODAS">Todos los niveles</option>
              <option value="GENERAL">Generales</option>
              <option value="RADICADO">Radicados</option>
              <option value="ACTUACION">Actuaciones</option>
            </select>

            <select
              value={filtroPrioridad}
              onChange={(e) =>
                setFiltroPrioridad(e.target.value)
              }
              className="rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <option value="TODAS">
                Todas las prioridades
              </option>
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
        <ResumenCard
          label="Pendientes"
          value={pendientes}
        />

        <ResumenCard
          label="En curso"
          value={enCurso}
        />

        <ResumenCard
          label="Vencidas"
          value={vencidas}
          danger
        />

        <ResumenCard
          label="Completadas"
          value={completadas}
          success
        />
      </div>

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

          <button onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {/* ESCRITORIO */}
      <div
        className="hidden overflow-hidden rounded-xl border md:block"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="grid grid-cols-[40px_minmax(280px,1fr)_130px_130px_150px_120px] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{
            borderColor: "var(--border)",
            color: "var(--foreground-muted)",
            background: "var(--surface-muted)",
          }}
        >
          <div />
          <div>Tarea</div>
          <div>Nivel</div>
          <div>Prioridad</div>
          <div>Fecha límite</div>
          <div>Estado</div>
        </div>

        {tareasFiltradas.length === 0 ? (
          <EmptyState />
        ) : (
          tareasFiltradas.map((tarea) => (
            <TareaRow
              key={tarea.id}
              tarea={tarea}
              radicados={radicados}
              onComplete={completarTarea}
              onOpen={() =>
                router.push(
                  `/gestion-procesos/dashboard/tareas/${tarea.id}`
                )
              }
            />
          ))
        )}
      </div>

      {/* MÓVIL */}
      <div className="space-y-3 md:hidden">
        {tareasFiltradas.length === 0 ? (
          <EmptyState />
        ) : (
          tareasFiltradas.map((tarea) => (
            <TareaCard
              key={tarea.id}
              tarea={tarea}
              radicados={radicados}
              onComplete={completarTarea}
              onOpen={() =>
                router.push(
                  `/gestion-procesos/dashboard/tareas/${tarea.id}`
                )
              }
            />
          ))
        )}
      </div>

      {mostrarModal && (
        <NuevaTareaModal
          token={token!}
          radicados={radicados}
          onClose={() => setMostrarModal(false)}
          onCreated={() => {
            setMostrarModal(false);
            cargarDatos();
          }}
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
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
      style={{
        background: checked
          ? "var(--primary)"
          : "var(--surface)",
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

function TareaRow({
  tarea,
  radicados,
  onComplete,
  onOpen,
}: {
  tarea: Tarea;
  radicados: Radicado[];
  onComplete: (
    tarea: Tarea,
    completada: boolean
  ) => void;
  onOpen: () => void;
}) {
  const vencida = esVencida(tarea);
  const estadoStyle = estadoClasses(tarea.estado);
  const prioridadStyle = prioridadClasses(tarea.prioridad);

  const radicado = tarea.radicado_id
    ? radicados.find(
        (item) => item.id === tarea.radicado_id
      )
    : null;

  return (
    <div
      onClick={onOpen}
      className="grid cursor-pointer grid-cols-[40px_minmax(280px,1fr)_130px_130px_150px_120px] items-center gap-3 border-b px-4 py-4 transition last:border-b-0"
      style={{
        borderColor: "var(--border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          "transparent";
      }}
    >
      <Checkbox
        checked={tarea.estado === "COMPLETADA"}
        onChange={() =>
          onComplete(
            tarea,
            tarea.estado !== "COMPLETADA"
          )
        }
      />

      <div className="min-w-0">
        <p
          className={`truncate text-sm font-medium ${
            tarea.estado === "COMPLETADA"
              ? "line-through opacity-50"
              : ""
          }`}
        >
          {tarea.titulo}
        </p>

        {tarea.descripcion && (
          <p
            className="mt-1 truncate text-xs"
            style={{
              color: "var(--foreground-muted)",
            }}
          >
            {tarea.descripcion}
          </p>
        )}

        {radicado && (
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--foreground-muted)" }}
          >
            Radicado: {radicado.numero}
          </p>
        )}
      </div>

      <NivelBadge nivel={nivelTarea(tarea)} />

      <span
        className="w-fit rounded-full px-2.5 py-1 text-xs font-medium"
        style={{
          background: prioridadStyle.background,
          color: prioridadStyle.color,
        }}
      >
        {prioridadLabel(tarea.prioridad)}
      </span>

      <div
        className={`text-xs ${
          vencida ? "font-medium" : ""
        }`}
        style={{
          color: vencida
            ? "var(--danger)"
            : "var(--foreground-muted)",
        }}
      >
        {vencida ? "Vencida · " : ""}
        {formatearFecha(tarea.fecha_limite)}
      </div>

      <span
        className="w-fit rounded-full px-2.5 py-1 text-xs font-medium"
        style={{
          background: estadoStyle.background,
          color: estadoStyle.color,
        }}
      >
        {estadoLabel(tarea.estado)}
      </span>
    </div>
  );
}

function TareaCard({
  tarea,
  radicados,
  onComplete,
  onOpen,
}: {
  tarea: Tarea;
  radicados: Radicado[];
  onComplete: (
    tarea: Tarea,
    completada: boolean
  ) => void;
  onOpen: () => void;
}) {
  const vencida = esVencida(tarea);
  const estadoStyle = estadoClasses(tarea.estado);
  const prioridadStyle = prioridadClasses(tarea.prioridad);

  const radicado = tarea.radicado_id
    ? radicados.find(
        (item) => item.id === tarea.radicado_id
      )
    : null;

  const subtareasCompletadas =
    tarea.subtareas.filter(
      (item) => item.completada
    ).length;

  return (
    <div
      onClick={onOpen}
      className="rounded-xl border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={tarea.estado === "COMPLETADA"}
          onChange={() =>
            onComplete(
              tarea,
              tarea.estado !== "COMPLETADA"
            )
          }
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={`text-sm font-semibold ${
                tarea.estado === "COMPLETADA"
                  ? "line-through opacity-50"
                  : ""
              }`}
            >
              {tarea.titulo}
            </h3>

            <span
              className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium"
              style={{
                background: estadoStyle.background,
                color: estadoStyle.color,
              }}
            >
              {estadoLabel(tarea.estado)}
            </span>
          </div>

          {tarea.descripcion && (
            <p
              className="mt-1 text-xs leading-5"
              style={{
                color: "var(--foreground-muted)",
              }}
            >
              {tarea.descripcion}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <NivelBadge nivel={nivelTarea(tarea)} />

            <span
              className="rounded-full px-2 py-1 text-[11px] font-medium"
              style={{
                background: prioridadStyle.background,
                color: prioridadStyle.color,
              }}
            >
              {prioridadLabel(tarea.prioridad)}
            </span>
          </div>

          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"
            style={{
              color: vencida
                ? "var(--danger)"
                : "var(--foreground-muted)",
            }}
          >
            <span>
              {vencida ? "Vencida · " : "Límite: "}
              {formatearFecha(tarea.fecha_limite)}
            </span>

            {radicado && (
              <span>
                Radicado: {radicado.numero}
              </span>
            )}

            {tarea.subtareas.length > 0 && (
              <span>
                Subtareas: {subtareasCompletadas}/
                {tarea.subtareas.length}
              </span>
            )}

            {tarea.recordatorios.some(
              (r) =>
                r.activo &&
                r.canal === "WHATSAPP"
            ) && (
              <span>
                WhatsApp
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NivelBadge({
  nivel,
}: {
  nivel: NivelTarea;
}) {
  const labels = {
    GENERAL: "General",
    RADICADO: "Radicado",
    ACTUACION: "Actuación",
  };

  return (
    <span
      className="w-fit rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: "var(--primary-light)",
        color: "var(--primary)",
      }}
    >
      {labels[nivel]}
    </span>
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
        style={{
          color: "var(--foreground-muted)",
        }}
      />

      <p className="mt-3 text-sm font-medium">
        No hay tareas para mostrar
      </p>

      <p
        className="mt-1 text-xs"
        style={{
          color: "var(--foreground-muted)",
        }}
      >
        Ajusta los filtros o crea una nueva tarea.
      </p>
    </div>
  );
}

function NuevaTareaModal({
  token,
  radicados,
  onClose,
  onCreated,
}: {
  token: string;
  radicados: Radicado[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] =
    useState<PrioridadTarea>("MEDIA");

  const [nivel, setNivel] =
    useState<NivelTarea>("GENERAL");

  const [radicadoId, setRadicadoId] =
    useState("");

  const [actuacionId, setActuacionId] =
    useState("");

  const [fechaLimite, setFechaLimite] =
    useState("");

  const [guardando, setGuardando] =
    useState(false);

  const [error, setError] = useState("");

  const radicadoSeleccionado = radicadoId
    ? radicados.find(
        (item) => item.id === Number(radicadoId)
      )
    : null;

  const actuaciones =
    radicadoSeleccionado?.actuaciones ?? [];

  const crearTarea = async () => {
    if (!titulo.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    if (
      (nivel === "RADICADO" ||
        nivel === "ACTUACION") &&
      !radicadoId
    ) {
      setError("Selecciona un radicado.");
      return;
    }

    if (nivel === "ACTUACION" && !actuacionId) {
      setError("Selecciona una actuación.");
      return;
    }

    try {
      setGuardando(true);
      setError("");

      const body: {
        titulo: string;
        descripcion: string | null;
        prioridad: PrioridadTarea;
        fecha_limite: string | null;
        radicado_id?: number;
        actuacion_id?: number;
      } = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        prioridad,
        fecha_limite: fechaLimite
          ? new Date(fechaLimite).toISOString()
          : null,
      };

      if (
        nivel === "RADICADO" ||
        nivel === "ACTUACION"
      ) {
        body.radicado_id = Number(radicadoId);
      }

      if (nivel === "ACTUACION") {
        body.actuacion_id = Number(actuacionId);
      }

      const response = await apiRequest(
        "/api/tareas",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => null);

        throw new Error(
          data?.detail ||
            "No se pudo crear la tarea."
        );
      }

      onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la tarea."
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-5 sm:p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Nueva tarea
            </h2>

            <p
              className="mt-1 text-xs"
              style={{
                color: "var(--foreground-muted)",
              }}
            >
              Define el alcance, responsable y fecha límite.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 transition"
            style={{
              color: "var(--foreground-muted)",
            }}
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          {/* TÍTULO */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Título
            </label>

            <input
              autoFocus
              value={titulo}
              onChange={(e) =>
                setTitulo(e.target.value)
              }
              placeholder="Ej. Revisar contestación de demanda"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* DESCRIPCIÓN */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Descripción
            </label>

            <textarea
              value={descripcion}
              onChange={(e) =>
                setDescripcion(e.target.value)
              }
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

          {/* NIVEL */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Asociar tarea a
            </label>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["GENERAL", "General"],
                  ["RADICADO", "Radicado"],
                  ["ACTUACION", "Actuación"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setNivel(value);
                    if (value === "GENERAL") {
                      setRadicadoId("");
                      setActuacionId("");
                    }

                    if (value === "RADICADO") {
                      setActuacionId("");
                    }
                  }}
                  className="rounded-lg border px-3 py-2.5 text-sm font-medium transition"
                  style={{
                    background:
                      nivel === value
                        ? "var(--primary-light)"
                        : "var(--surface)",
                    borderColor:
                      nivel === value
                        ? "var(--primary)"
                        : "var(--border)",
                    color:
                      nivel === value
                        ? "var(--primary)"
                        : "var(--foreground-secondary)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* RADICADO */}
          {nivel !== "GENERAL" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Radicado
              </label>

              <select
                value={radicadoId}
                onChange={(e) => {
                  setRadicadoId(e.target.value);
                  setActuacionId("");
                }}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="">
                  Seleccionar radicado...
                </option>

                {radicados.map((radicado) => (
                  <option
                    key={radicado.id}
                    value={radicado.id}
                  >
                    {radicado.numero}
                    {radicado.demandante
                      ? ` · ${radicado.demandante}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ACTUACIÓN */}
          {nivel === "ACTUACION" &&
            radicadoId && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Actuación
                </label>

                <select
                  value={actuacionId}
                  onChange={(e) =>
                    setActuacionId(e.target.value)
                  }
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{
                    background:
                      "var(--surface-muted)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <option value="">
                    Seleccionar actuación...
                  </option>

                  {actuaciones.map((actuacion) => (
                    <option
                      key={actuacion.id}
                      value={actuacion.id}
                    >
                      {actuacion.fecha_actuacion
                        ? `${actuacion.fecha_actuacion} · `
                        : ""}
                      {actuacion.actuacion ||
                        "Actuación sin descripción"}
                    </option>
                  ))}
                </select>

                {actuaciones.length === 0 && (
                  <p
                    className="mt-2 text-xs"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Este radicado no tiene actuaciones
                    disponibles.
                  </p>
                )}
              </div>
            )}

          {/* PRIORIDAD + FECHA */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Prioridad
              </label>

              <select
                value={prioridad}
                onChange={(e) =>
                  setPrioridad(
                    e.target.value as PrioridadTarea
                  )
                }
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
                <option value="URGENTE">
                  Urgente
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Fecha límite
              </label>

              <input
                type="datetime-local"
                value={fechaLimite}
                onChange={(e) =>
                  setFechaLimite(e.target.value)
                }
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--surface-muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg border px-3 py-2.5 text-sm"
              style={{
                background: "var(--danger-light)",
                borderColor: "var(--danger)",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          {/* BOTONES */}
          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{
              borderColor: "var(--border)",
            }}
          >
            <button
              onClick={onClose}
              disabled={guardando}
              className="rounded-lg border px-4 py-2.5 text-sm font-medium transition"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground-secondary)",
              }}
            >
              Cancelar
            </button>

            <button
              onClick={crearTarea}
              disabled={guardando}
              className="rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {guardando
                ? "Creando..."
                : "Crear tarea"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}