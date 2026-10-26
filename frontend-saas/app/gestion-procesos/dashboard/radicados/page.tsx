"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Eye,
  FilePlus2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { fetchApi, iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

interface Actuacion {
  id: number;
  orden: number;
  fecha_actuacion: string;
  actuacion: string;
  anotacion: string;
  fecha_inicia_termino: string;
  fecha_finaliza_termino: string;
  fecha_registro: string;
  es_fijacion: boolean;
}

interface Radicado {
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
}

type SortColumn =
  | "numero"
  | "demandante"
  | "demandado"
  | "despacho"
  | "estado";

type SortDirection = "asc" | "desc";

function normalizarTexto(texto: string | null | undefined) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obtenerEstadoVisual(estado: string) {
  const estadoNormalizado = normalizarTexto(estado);

  if (estadoNormalizado === "sin consultar") {
    return {
      label: "Sin consultar",
      className:
        "bg-[var(--surface-secondary)] text-[var(--foreground-muted)]",
    };
  }

  if (estadoNormalizado === "encolada") {
    return {
      label: "En cola",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }

  if (estadoNormalizado === "ejecutando") {
    return {
      label: "Consultando",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    };
  }

  if (estadoNormalizado === "error") {
    return {
      label: "Error",
      className: "bg-red-500/10 text-red-600 dark:text-red-400",
    };
  }

  return {
    label: estado || "Disponible",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
}

export default function RadicadosPage() {
  const router = useRouter();
  const { user, token, loading: sessionLoading } = useSession();
  const isAdmin = user?.rol === "ADMIN";

  const [radicados, setRadicados] = useState<Radicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [numeroNuevo, setNumeroNuevo] = useState("");
  const [adding, setAdding] = useState(false);

  const [processingIds, setProcessingIds] = useState<number[]>([]);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const [sortColumn, setSortColumn] = useState<SortColumn>("numero");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("q") ?? "");
    const order = params.get("orden");
    if (["numero", "demandante", "demandado", "despacho", "estado"].includes(order ?? "")) setSortColumn(order as SortColumn);
    if (params.get("direccion") === "desc") setSortDirection("desc");
  }, []);

  function abrirDetalleRadicado(id: number) {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    query.set("orden", sortColumn);
    query.set("direccion", sortDirection);
    const listUrl = `/gestion-procesos/dashboard/radicados?${query.toString()}`;
    router.push(`/gestion-procesos/dashboard/radicados/${id}?returnTo=${encodeURIComponent(listUrl)}`);
  }

  /*
   * Menú de acciones individuales.
   *
   * Se renderiza mediante createPortal en document.body para evitar
   * que overflow-x-auto de la tabla lo recorte.
   */
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(
    null
  );

  const [actionMenuPosition, setActionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const limiteRadicados = user?.plan?.limite_radicados ?? 0;

  const radicadosUtilizados = radicados.length;

  const cuposDisponibles = Math.max(
    limiteRadicados - radicadosUtilizados,
    0
  );

  const porcentajeUtilizado =
    limiteRadicados > 0
      ? Math.min(
          (radicadosUtilizados / limiteRadicados) * 100,
          100
        )
      : 100;

  const porcentajeDisponible =
    limiteRadicados > 0
      ? (cuposDisponibles / limiteRadicados) * 100
      : 0;

  const sinCupos =
    limiteRadicados === 0 || cuposDisponibles <= 0;

  const pocosCupos =
    !sinCupos && porcentajeDisponible < 20;

  /*
   * Cargar radicados
   */
  async function cargarRadicados(authToken: string) {
    try {
      setLoading(true);
      setError("");

      const response = (await fetchApi("/api/radicados", {
        method: "GET",
        token: authToken,
      })) as Radicado[];

      setRadicados(response);
    } catch (err) {
      console.error("Error cargando radicados:", err);
      setError("No fue posible cargar los radicados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!token) {
      return;
    }

    cargarRadicados(token);
  }, [token, sessionLoading, router]);

  /*
   * Cerrar menú de acciones al hacer scroll o cambiar tamaño.
   * Esto evita que el menú quede desfasado respecto al botón.
   */
  useEffect(() => {
    if (openActionMenu === null) {
      return;
    }

    function cerrarMenu() {
      setOpenActionMenu(null);
      setActionMenuPosition(null);
    }

    window.addEventListener("resize", cerrarMenu);
    window.addEventListener("scroll", cerrarMenu, true);

    return () => {
      window.removeEventListener("resize", cerrarMenu);
      window.removeEventListener("scroll", cerrarMenu, true);
    };
  }, [openActionMenu]);

  /*
   * Notificaciones
   */
  function mostrarNotificacion(
    type: "success" | "error" | "warning",
    message: string
  ) {
    setNotification({
      type,
      message,
    });

    window.setTimeout(() => {
      setNotification(null);
    }, 4000);
  }

  /*
   * Búsqueda + ordenamiento
   */
  const radicadosFiltrados = useMemo(() => {
    const termino = normalizarTexto(search);

    let resultado = [...radicados];

    if (termino) {
      resultado = resultado.filter((radicado) => {
        return [
          radicado.numero,
          radicado.demandante,
          radicado.demandado,
          radicado.despacho_departamento,
        ].some((valor) =>
          normalizarTexto(valor).includes(termino)
        );
      });
    }

    resultado.sort((a, b) => {
      let valorA = "";
      let valorB = "";

      switch (sortColumn) {
        case "numero":
          valorA = a.numero;
          valorB = b.numero;
          break;

        case "demandante":
          valorA = a.demandante;
          valorB = b.demandante;
          break;

        case "demandado":
          valorA = a.demandado;
          valorB = b.demandado;
          break;

        case "despacho":
          valorA = a.despacho_departamento;
          valorB = b.despacho_departamento;
          break;

        case "estado":
          valorA = obtenerEstadoVisual(a.estado_consulta).label;
          valorB = obtenerEstadoVisual(b.estado_consulta).label;
          break;
      }

      const comparison = normalizarTexto(valorA).localeCompare(
        normalizarTexto(valorB),
        "es",
        {
          numeric: true,
          sensitivity: "base",
        }
      );

      return sortDirection === "asc"
        ? comparison
        : -comparison;
    });

    return resultado;
  }, [radicados, search, sortColumn, sortDirection]);

  /*
   * Ordenar una columna
   */
  function ordenarPor(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((actual) =>
        actual === "asc" ? "desc" : "asc"
      );
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  }

  function obtenerIconoOrden(column: SortColumn) {
    if (sortColumn !== column) {
      return (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      );
    }

    if (sortDirection === "asc") {
      return <ArrowUp className="h-3.5 w-3.5" />;
    }

    return <ArrowDown className="h-3.5 w-3.5" />;
  }

  /*
   * Selección
   */
  const todosSeleccionados =
    radicadosFiltrados.length > 0 &&
    radicadosFiltrados.every((radicado) =>
      selectedIds.includes(radicado.id)
    );

  function toggleSeleccion(id: number) {
    setSelectedIds((actual) => {
      if (actual.includes(id)) {
        return actual.filter((item) => item !== id);
      }

      return [...actual, id];
    });
  }

  function toggleSeleccionTodos() {
    if (todosSeleccionados) {
      setSelectedIds((actual) =>
        actual.filter(
          (id) =>
            !radicadosFiltrados.some(
              (radicado) => radicado.id === id
            )
        )
      );
      return;
    }

    setSelectedIds((actual) => {
      const ids = new Set(actual);

      radicadosFiltrados.forEach((radicado) => {
        ids.add(radicado.id);
      });

      return Array.from(ids);
    });
  }

  /*
   * Abrir modal agregar
   */
  function abrirModalAgregar() {
    if (sinCupos) {
      mostrarNotificacion(
        "warning",
        "Has alcanzado el límite de radicados de tu plan."
      );
      return;
    }

    setNumeroNuevo("");
    setShowAddModal(true);
  }

  /*
   * Agregar radicado
   */
  async function agregarRadicado() {
    const numero = numeroNuevo.trim();

    if (!numero) {
      mostrarNotificacion(
        "warning",
        "Ingresa el número del radicado."
      );
      return;
    }

    if (sinCupos) {
      mostrarNotificacion(
        "warning",
        "No tienes cupos disponibles en tu plan."
      );
      return;
    }

    if (!token) {
      return;
    }

    try {
      setAdding(true);

      const result = await fetchApi("/api/radicados", {
        method: "POST",
        token,
        body: JSON.stringify({
          numero,
        }),
      });

      let successMessage = result?.mensaje || "Radicado agregado correctamente.";
      if (typeof result?.consulta_id === "number") {
        await iniciarWorkflowConsultaRadicado(token, {
          tipo: "AUTOMATICA_NUEVO",
          radicado_id: result.id,
          consulta_id: result.consulta_id,
        });
        successMessage = `${successMessage} Workflow de consulta iniciado.`;
      }

      await cargarRadicados(token);

      setShowAddModal(false);
      setNumeroNuevo("");

      mostrarNotificacion(
        "success",
        successMessage
      );
    } catch (err) {
      console.error("Error agregando radicado:", err);

      mostrarNotificacion(
        "error",
        err instanceof Error
          ? err.message
          : "No fue posible agregar el radicado."
      );
    } finally {
      setAdding(false);
    }
  }

  /*
   * Consultar un radicado
   */
  async function consultarRadicado(id: number) {
    if (!token) {
      return;
    }

    setOpenActionMenu(null);
    setActionMenuPosition(null);

    setProcessingIds((actual) => [...actual, id]);

    try {
      await iniciarWorkflowConsultaRadicado(token, {
        tipo: "MANUAL",
        radicado_id: id,
      });

      setRadicados((actual) =>
        actual.map((radicado) =>
          radicado.id === id
            ? {
                ...radicado,
                estado_consulta: "ENCOLADA",
              }
            : radicado
        )
      );

      mostrarNotificacion(
        "success",
        "La consulta fue enviada al Workflow."
      );
    } catch (err) {
      console.error("Error consultando radicado:", err);

      mostrarNotificacion(
        "error",
        err instanceof Error
          ? err.message
          : "No fue posible consultar el radicado."
      );
    } finally {
      setProcessingIds((actual) =>
        actual.filter((item) => item !== id)
      );
    }
  }

  /*
   * Consultar seleccionados
   */
  async function consultarSeleccionados() {
    if (!token || selectedIds.length === 0) {
      return;
    }

    const ids = [...selectedIds];

    setProcessingIds((actual) => [
      ...new Set([...actual, ...ids]),
    ]);

    try {
      await iniciarWorkflowConsultaRadicado(token, {
        tipo: "MANUAL",
        radicado_ids: ids,
      });
    } catch (err) {
      mostrarNotificacion(
        "error",
        err instanceof Error ? err.message : "No fue posible iniciar el Workflow."
      );
      setProcessingIds((actual) => actual.filter((id) => !ids.includes(id)));
      return;
    }

    setRadicados((actual) =>
      actual.map((radicado) =>
        ids.includes(radicado.id)
          ? {
              ...radicado,
              estado_consulta: "ENCOLADA",
            }
          : radicado
      )
    );

    setProcessingIds((actual) =>
      actual.filter((id) => !ids.includes(id))
    );

    setSelectedIds([]);

    mostrarNotificacion("success", `${ids.length} consultas enviadas al Workflow.`);
  }

  /*
   * Eliminar un radicado
   */
  async function eliminarRadicado(id: number) {
    if (!token) {
      return;
    }

    setOpenActionMenu(null);
    setActionMenuPosition(null);

    setDeletingIds((actual) => [...actual, id]);

    try {
      await fetchApi(`/api/radicados/${id}`, {
        method: "DELETE",
        token,
      });

      setRadicados((actual) =>
        actual.filter((radicado) => radicado.id !== id)
      );

      setSelectedIds((actual) =>
        actual.filter((item) => item !== id)
      );

      mostrarNotificacion(
        "success",
        "Radicado eliminado correctamente."
      );
    } catch (err) {
      console.error("Error eliminando radicado:", err);

      mostrarNotificacion(
        "error",
        err instanceof Error
          ? err.message
          : "No fue posible eliminar el radicado."
      );
    } finally {
      setDeletingIds((actual) =>
        actual.filter((item) => item !== id)
      );
    }
  }

  /*
   * Eliminar seleccionados
   */
  async function eliminarSeleccionados() {
    if (!token || selectedIds.length === 0) {
      return;
    }

    const ids = [...selectedIds];

    setDeletingIds((actual) => [
      ...new Set([...actual, ...ids]),
    ]);

    const resultados = await Promise.allSettled(
      ids.map((id) =>
        fetchApi(`/api/radicados/${id}`, {
          method: "DELETE",
          token,
        })
      )
    );

    const exitosos = resultados.filter(
      (resultado) => resultado.status === "fulfilled"
    ).length;

    const eliminados = new Set(
      ids.filter(
        (_, index) =>
          resultados[index].status === "fulfilled"
      )
    );

    setRadicados((actual) =>
      actual.filter(
        (radicado) => !eliminados.has(radicado.id)
      )
    );

    setSelectedIds([]);

    setDeletingIds((actual) =>
      actual.filter((id) => !ids.includes(id))
    );

    if (exitosos === ids.length) {
      mostrarNotificacion(
        "success",
        `${exitosos} radicado${
          exitosos === 1 ? "" : "s"
        } eliminado${exitosos === 1 ? "" : "s"} correctamente.`
      );
    } else {
      mostrarNotificacion(
        "warning",
        `${exitosos} de ${ids.length} radicados fueron eliminados correctamente.`
      );
    }
  }

  /*
   * Menú individual mediante PORTAL
   */
  function abrirMenuAcciones(
    event: React.MouseEvent<HTMLButtonElement>,
    id: number
  ) {
    if (openActionMenu === id) {
      setOpenActionMenu(null);
      setActionMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const menuWidth = 176;
    const menuHeight = 96;
    const gap = 6;

    let top = rect.bottom + gap;

    /*
     * Si no hay espacio debajo, abre hacia arriba.
     */
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - gap;
    }

    let left = rect.right - menuWidth;

    /*
     * Mantener el menú dentro de la pantalla en móvil.
     */
    left = Math.max(
      8,
      Math.min(
        left,
        window.innerWidth - menuWidth - 8
      )
    );

    setActionMenuPosition({
      top,
      left,
    });

    setOpenActionMenu(id);
  }

  const radicadoMenuAbierto =
    openActionMenu !== null
      ? radicados.find(
          (radicado) => radicado.id === openActionMenu
        )
      : null;

  /*
   * Loading de sesión
   */
  if (sessionLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--foreground-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Verificando sesión...
        </div>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  /*
   * Loading de radicados
   */
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--foreground-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Cargando radicados...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* =========================================================
          NOTIFICACIÓN
      ========================================================== */}
      {notification && (
        <div
          className={`fixed right-4 top-4 z-[10000] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${
            notification.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : notification.type === "warning"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          )}

          <span className="text-sm font-medium">
            {notification.message}
          </span>

          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-2 shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* =========================================================
          CABECERA
      ========================================================== */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Radicados
          </h1>

          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Administra, consulta y realiza seguimiento a tus procesos.
          </p>
        </div>

        {/* Uso del plan */}
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:max-w-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                Uso del plan
              </p>

              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                {radicadosUtilizados} de {limiteRadicados} radicados
              </p>
            </div>

            <span className="text-sm font-medium text-[var(--foreground-muted)]">
              {Math.round(porcentajeUtilizado)}%
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
            <div
              className={`h-full rounded-full transition-all ${
                sinCupos
                  ? "bg-red-500"
                  : pocosCupos
                  ? "bg-amber-500"
                  : "bg-[var(--primary)]"
              }`}
              style={{
                width: `${porcentajeUtilizado}%`,
              }}
            />
          </div>

          <div className="mt-2 flex justify-between text-xs text-[var(--foreground-muted)]">
            <span>
              {cuposDisponibles} cupo
              {cuposDisponibles === 1 ? "" : "s"} disponible
              {cuposDisponibles === 1 ? "" : "s"}
            </span>

            <span>
              Plan: {user?.plan?.nombre ?? "Sin plan"}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================
          ALERTAS
      ========================================================== */}
      {sinCupos && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-700 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

          <div>
            <p className="font-semibold">
              Has alcanzado el límite de tu plan
            </p>

            <p className="mt-1 text-sm opacity-90">
              No puedes agregar nuevos radicados hasta liberar un cupo
              o cambiar de plan.
            </p>
          </div>
        </div>
      )}

      {!sinCupos && pocosCupos && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

          <div>
            <p className="font-semibold">
              Quedan pocos cupos disponibles
            </p>

            <p className="mt-1 text-sm opacity-90">
              Te quedan {cuposDisponibles} de {limiteRadicados} cupos
              disponibles.
            </p>
          </div>
        </div>
      )}

      {/* =========================================================
          ERROR
      ========================================================== */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-700 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />

            <span className="text-sm">
              {error}
            </span>
          </div>

          <button
            type="button"
            onClick={() => cargarRadicados(token)}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-red-500/10"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* =========================================================
          CINTA DE OPCIONES
      ========================================================== */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={abrirModalAgregar}
              disabled={sinCupos}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 py-2.5 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FilePlus2 className="h-4 w-4" />
              <span>Agregar</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={consultarSeleccionados}
                disabled={selectedIds.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3.5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Consultar</span>
                {selectedIds.length > 0 && (
                  <span className="rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-xs">
                    {selectedIds.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={eliminarSeleccionados}
              disabled={selectedIds.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/20 px-3.5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">
                Eliminar
              </span>

              {selectedIds.length > 0 && (
                <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-xs">
                  {selectedIds.length}
                </span>
              )}
            </button>
          </div>

          {/* Búsqueda */}
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-muted)]" />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar radicado..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="border-t border-[var(--border)] px-3 py-2">
            <p className="text-xs text-[var(--foreground-muted)]">
              {selectedIds.length} radicado
              {selectedIds.length === 1 ? "" : "s"} seleccionado
              {selectedIds.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>

      {/* =========================================================
          TABLA
      ========================================================== */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {radicadosFiltrados.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
              <Search className="h-5 w-5 text-[var(--foreground-muted)]" />
            </div>

            <h3 className="mt-4 font-semibold text-[var(--foreground)]">
              {search
                ? "No se encontraron resultados"
                : "No tienes radicados"}
            </h3>

            <p className="mt-1 max-w-sm text-sm text-[var(--foreground-muted)]">
              {search
                ? "Prueba con otro número de radicado, demandante, demandado o despacho."
                : "Agrega tu primer radicado para comenzar a realizar seguimiento."}
            </p>

            {!search && !sinCupos && (
              <button
                type="button"
                onClick={abrirModalAgregar}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white transition hover:opacity-90"
              >
                <FilePlus2 className="h-4 w-4" />
                Agregar radicado
              </button>
            )}
          </div>
        ) : (
          <>
          <div className="divide-y divide-[var(--border)] md:hidden">
            {radicadosFiltrados.map((radicado) => {
              const estado = obtenerEstadoVisual(radicado.estado_consulta);
              const seleccionado = selectedIds.includes(radicado.id);
              return (
                <article key={radicado.id} className={`p-4 ${seleccionado ? "bg-[var(--primary)]/[0.04]" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => toggleSeleccion(radicado.id)} aria-label={`${seleccionado ? "Quitar selección de" : "Seleccionar"} ${radicado.numero}`} aria-pressed={seleccionado} className={`mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg border ${seleccionado ? "border-[var(--primary)] bg-[var(--primary)] !text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)]"}`}>
                      {seleccionado ? <Check className="size-4" /> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => abrirDetalleRadicado(radicado.id)} className="block min-h-11 max-w-full truncate text-left font-semibold text-[var(--primary)] hover:underline">{radicado.numero}</button>
                      <p className="text-sm text-[var(--foreground)]">{radicado.demandante || "Demandante sin registrar"}</p>
                      <p className="mt-1 text-sm text-[var(--foreground-muted)]">Demandado: {radicado.demandado || "—"}</p>
                      <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">{radicado.despacho_departamento || "Despacho sin registrar"}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${estado.className}`}>{estado.label}</span>
                        <button type="button" onClick={() => abrirDetalleRadicado(radicado.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--primary)] hover:bg-[var(--surface-secondary)]"><Eye className="size-4" /> Ver detalle</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)]/50">
                  {/* Selección */}
                  <th className="w-12 px-4 py-3">
                    <button
                      type="button"
                      onClick={toggleSeleccionTodos}
                      aria-label="Seleccionar todos"
                      className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                        todosSeleccionados
                          ? "border-[var(--primary)] bg-[var(--primary)] !text-white"
                          : "border-[var(--border)] bg-[var(--surface)]"
                      }`}
                    >
                      {todosSeleccionados && (
                        <Check className="h-3 w-3" />
                      )}
                    </button>
                  </th>

                  {/* Radicado */}
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => ordenarPor("numero")}
                      className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]"
                    >
                      Radicado
                      {obtenerIconoOrden("numero")}
                    </button>
                  </th>

                  {/* Demandante */}
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() =>
                        ordenarPor("demandante")
                      }
                      className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]"
                    >
                      Demandante
                      {obtenerIconoOrden("demandante")}
                    </button>
                  </th>

                  {/* Demandado */}
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() =>
                        ordenarPor("demandado")
                      }
                      className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]"
                    >
                      Demandado
                      {obtenerIconoOrden("demandado")}
                    </button>
                  </th>

                  {/* Despacho */}
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => ordenarPor("despacho")}
                      className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]"
                    >
                      Despacho
                      {obtenerIconoOrden("despacho")}
                    </button>
                  </th>

                  {/* Estado */}
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => ordenarPor("estado")}
                      className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]"
                    >
                      Estado
                      {obtenerIconoOrden("estado")}
                    </button>
                  </th>

                  {/* Acciones */}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody>
                {radicadosFiltrados.map((radicado) => {
                  const seleccionado = selectedIds.includes(
                    radicado.id
                  );

                  const estado = obtenerEstadoVisual(
                    radicado.estado_consulta
                  );

                  return (
                    <tr
                      key={radicado.id}
                      className={`border-b border-[var(--border)] last:border-b-0 transition ${
                        seleccionado
                          ? "bg-[var(--primary)]/[0.04]"
                          : "hover:bg-[var(--surface-secondary)]/40"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            toggleSeleccion(radicado.id)
                          }
                          aria-label={`Seleccionar ${radicado.numero}`}
                          className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                            seleccionado
                              ? "border-[var(--primary)] bg-[var(--primary)] !text-white"
                              : "border-[var(--border)] bg-[var(--surface)]"
                          }`}
                        >
                          {seleccionado && (
                            <Check className="h-3 w-3" />
                          )}
                        </button>
                      </td>

                      {/* Radicado */}
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            abrirDetalleRadicado(radicado.id)
                          }
                          className="font-medium text-[var(--primary)] hover:underline"
                        >
                          {radicado.numero}
                        </button>
                      </td>

                      {/* Demandante */}
                      <td className="max-w-[220px] px-4 py-4">
                        <div
                          className="truncate text-sm text-[var(--foreground)]"
                          title={radicado.demandante}
                        >
                          {radicado.demandante || "—"}
                        </div>
                      </td>

                      {/* Demandado */}
                      <td className="max-w-[220px] px-4 py-4">
                        <div
                          className="truncate text-sm text-[var(--foreground)]"
                          title={radicado.demandado}
                        >
                          {radicado.demandado || "—"}
                        </div>
                      </td>

                      {/* Despacho */}
                      <td className="max-w-[240px] px-4 py-4">
                        <div
                          className="truncate text-sm text-[var(--foreground)]"
                          title={radicado.despacho_departamento}
                        >
                          {radicado.despacho_departamento || "—"}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${estado.className}`}
                        >
                          {estado.label}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Ver */}
                          <button
                            type="button"
                            onClick={() =>
                              abrirDetalleRadicado(radicado.id)
                            }
                            title="Ver detalle"
                            className="rounded-lg p-2 text-[var(--foreground-muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Menú */}
                          <button
                            type="button"
                            onClick={(event) =>
                              abrirMenuAcciones(
                                event,
                                radicado.id
                              )
                            }
                            title="Más acciones"
                            className="rounded-lg p-2 text-[var(--foreground-muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* =========================================================
          MENÚ DE ACCIONES PORTAL
      ========================================================== */}
      {openActionMenu !== null &&
        actionMenuPosition &&
        radicadoMenuAbierto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[9999] w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 text-left shadow-2xl"
            style={{
              top: actionMenuPosition.top,
              left: actionMenuPosition.left,
            }}
          >
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setOpenActionMenu(null);
                  setActionMenuPosition(null);
                  consultarRadicado(radicadoMenuAbierto.id);
                }}
                disabled={processingIds.includes(radicadoMenuAbierto.id) || deletingIds.includes(radicadoMenuAbierto.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {processingIds.includes(radicadoMenuAbierto.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Consultar
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpenActionMenu(null);
                setActionMenuPosition(null);
                eliminarRadicado(radicadoMenuAbierto.id);
              }}
              disabled={
                processingIds.includes(
                  radicadoMenuAbierto.id
                ) ||
                deletingIds.includes(
                  radicadoMenuAbierto.id
                )
              }
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
            >
              {deletingIds.includes(
                radicadoMenuAbierto.id
              ) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}

              Eliminar
            </button>
          </div>,
          document.body
        )}

      {/* =========================================================
          MODAL AGREGAR
      ========================================================== */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              if (!adding) {
                setShowAddModal(false);
              }
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl sm:p-6">
            {/* Encabezado */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  Agregar radicado
                </h2>

                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Ingresa el número del proceso que deseas
                  monitorear.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!adding) {
                    setShowAddModal(false);
                  }
                }}
                disabled={adding}
                className="rounded-lg p-2 text-[var(--foreground-muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contador */}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)]/50 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Radicados utilizados
                </p>

                <p className="mt-1 text-sm text-[var(--foreground)]">
                  Tienes{" "}
                  <span className="font-semibold">
                    {radicadosUtilizados}
                  </span>{" "}
                  radicado
                  {radicadosUtilizados === 1 ? "" : "s"} registrado
                  {radicadosUtilizados === 1 ? "" : "s"}.
                </p>
              </div>

              <div
                className={`shrink-0 text-lg font-bold ${
                  sinCupos
                    ? "text-red-500"
                    : pocosCupos
                    ? "text-amber-500"
                    : "text-[var(--foreground)]"
                }`}
              >
                {radicadosUtilizados}/{limiteRadicados}
              </div>
            </div>

            {/* Input */}
            <div className="mt-5">
              <label
                htmlFor="numero-radicado"
                className="mb-2 block text-sm font-medium text-[var(--foreground)]"
              >
                Número de radicado
              </label>

              <input
                id="numero-radicado"
                type="text"
                value={numeroNuevo}
                onChange={(event) =>
                  setNumeroNuevo(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !adding) {
                    agregarRadicado();
                  }
                }}
                placeholder="Ej. 05001310300120260012300"
                autoFocus
                disabled={adding}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)] disabled:opacity-50"
              />
            </div>

            {/* Cupos */}
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--foreground-muted)]">
              <span>
                Cupos disponibles:{" "}
                <strong className="text-[var(--foreground)]">
                  {cuposDisponibles}
                </strong>
              </span>

              <span>
                Plan: {user?.plan?.nombre ?? "Sin plan"}
              </span>
            </div>

            {/* Botones */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={adding}
                className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:opacity-40 sm:w-auto"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={agregarRadicado}
                disabled={
                  adding ||
                  !numeroNuevo.trim() ||
                  sinCupos
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                {adding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Agregando...
                  </>
                ) : (
                  <>
                    <FilePlus2 className="h-4 w-4" />
                    Agregar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
