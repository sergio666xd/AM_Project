"use client";

import { apiRequest, iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";


type Actuacion = {
  id: number;
  orden: number;
  fecha_actuacion?: string | null;
  actuacion?: string | null;
  anotacion?: string | null;
  fecha_inicia_termino?: string | null;
  fecha_finaliza_termino?: string | null;
  fecha_registro?: string | null;
  es_fijacion?: boolean | null;
};

type Radicado = {
  id: number;
  numero: string;
  estado_consulta?: string | null;
  despacho_departamento?: string | null;
  demandante?: string | null;
  demandado?: string | null;
  consultado_en?: string | null;
  alerta_enviada?: boolean | null;
  detalle_pendiente?: string | null;
  actuaciones?: Actuacion[];
};

type SortDirection = "asc" | "desc";

function getLatestActuacion(
  radicado: Radicado
): Actuacion | null {
  if (!radicado.actuaciones?.length) {
    return null;
  }

  return [...radicado.actuaciones].sort((a, b) => {
    const dateA = a.fecha_actuacion
      ? new Date(a.fecha_actuacion).getTime()
      : 0;

    const dateB = b.fecha_actuacion
      ? new Date(b.fecha_actuacion).getTime()
      : 0;

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return (b.orden ?? 0) - (a.orden ?? 0);
  })[0];
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-CO", { timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getStatusLabel(status?: string | null) {
  switch (status?.toUpperCase()) {
    case "COMPLETADA":
      return "Actualizado";

    case "EJECUTANDO":
      return "Consultando";

    case "ENCOLADA":
      return "En cola";

    case "ERROR":
      return "Error";

    case "SIN CONSULTAR":
      return "Sin consultar";

    default:
      return status || "Sin consultar";
  }
}

function getStatusStyle(status?: string | null) {
  switch (status?.toUpperCase()) {
    case "COMPLETADA":
      return {
        background: "var(--success-light)",
        color: "var(--success)",
      };

    case "EJECUTANDO":
    case "ENCOLADA":
      return {
        background: "var(--info-light)",
        color: "var(--info)",
      };

    case "ERROR":
      return {
        background: "var(--danger-light)",
        color: "var(--danger)",
      };

    default:
      return {
        background: "var(--surface-muted)",
        color: "var(--foreground-muted)",
      };
  }
}

export default function RadicadosPage() {
  const { user } = useSession();
  const isAdmin = user?.rol === "ADMIN";
  const [radicados, setRadicados] = useState<Radicado[]>([]);

  const [search, setSearch] = useState("");

  // La página inicia ordenada de más nueva a más antigua.
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [consultingId, setConsultingId] = useState<number | null>(
    null
  );

  const [deletingId, setDeletingId] = useState<number | null>(
    null
  );

  const [bulkLoading, setBulkLoading] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nuevoNumero, setNuevoNumero] = useState("");

  const token = () => localStorage.getItem("token") || "";

  const loadRadicados = useCallback(async () => {
    setError("");

    try {
      const response = await apiRequest(`/api/radicados`, {
        headers: {
          Authorization: `Bearer ${token()}`,
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "No fue posible cargar los radicados."
        );
      }

      setRadicados(Array.isArray(data) ? data : []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar los radicados."
      );
    }
  }, []);

  useEffect(() => {
    async function initialLoad() {
      setLoading(true);

      try {
        await loadRadicados();
      } finally {
        setLoading(false);
      }
    }

    void initialLoad();
  }, [loadRadicados]);

  const filteredAndSortedRadicados = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = radicados.filter((radicado) => {
      if (!query) return true;

      const latest = getLatestActuacion(radicado);

      const searchableText = [
        radicado.numero,
        radicado.despacho_departamento,
        radicado.demandante,
        radicado.demandado,
        radicado.estado_consulta,
        latest?.actuacion,
        latest?.anotacion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });

    return [...filtered].sort((a, b) => {
      const latestA = getLatestActuacion(a);
      const latestB = getLatestActuacion(b);

      const dateA = latestA?.fecha_actuacion
        ? new Date(latestA.fecha_actuacion).getTime()
        : null;

      const dateB = latestB?.fecha_actuacion
        ? new Date(latestB.fecha_actuacion).getTime()
        : null;

      // Los que no tienen actuaciones quedan al final.
      if (dateA === null && dateB === null) {
        return a.numero.localeCompare(b.numero);
      }

      if (dateA === null) return 1;
      if (dateB === null) return -1;

      return sortDirection === "desc"
        ? dateB - dateA
        : dateA - dateB;
    });
  }, [radicados, search, sortDirection]);

  const allVisibleSelected =
    filteredAndSortedRadicados.length > 0 &&
    filteredAndSortedRadicados.every((radicado) =>
      selectedIds.includes(radicado.id)
    );

  const someVisibleSelected =
    filteredAndSortedRadicados.some((radicado) =>
      selectedIds.includes(radicado.id)
    );

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleSelectAll() {
    const visibleIds = filteredAndSortedRadicados.map(
      (radicado) => radicado.id
    );

    if (visibleIds.every((id) => selectedIds.includes(id))) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id))
      );
      return;
    }

    setSelectedIds((current) =>
      Array.from(new Set([...current, ...visibleIds]))
    );
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function refresh() {
    setRefreshing(true);
    setMessage("");

    try {
      await loadRadicados();
    } finally {
      setRefreshing(false);
    }
  }

  async function createRadicado(event: FormEvent) {
    event.preventDefault();

    const numero = nuevoNumero.trim();

    if (!numero) {
      setError("Ingresa el número de radicado.");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(`/api/radicados`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          numero,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "No fue posible crear el radicado."
        );
      }

      if (typeof data?.consulta_id === "number") {
        await iniciarWorkflowConsultaRadicado(token(), {
          tipo: "AUTOMATICA_NUEVO",
          radicado_id: data.id,
          consulta_id: data.consulta_id,
        });
      }

      setShowCreateModal(false);
      setNuevoNumero("");

      await loadRadicados();

      setMessage(
        data?.mensaje || `El radicado ${numero} fue agregado correctamente.`
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible crear el radicado."
      );
    } finally {
      setCreating(false);
    }
  }

  async function consultarRadicado(radicado: Radicado) {
    setConsultingId(radicado.id);
    setError("");
    setMessage("");

    try {
      await iniciarWorkflowConsultaRadicado(token(), {
        tipo: "MANUAL",
        radicado_id: radicado.id,
      });

      setMessage(
        `La consulta del radicado ${radicado.numero} fue enviada a segundo plano.`
      );

      await loadRadicados();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible iniciar la consulta."
      );
    } finally {
      setConsultingId(null);
    }
  }

  async function deleteRadicado(radicado: Radicado) {
    const confirmed = window.confirm(
      `¿Deseas eliminar el radicado ${radicado.numero}? Esta acción no se puede deshacer.`
    );

    if (!confirmed) return;

    setDeletingId(radicado.id);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/radicados/${radicado.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token()}`,
          },
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "No fue posible eliminar el radicado."
        );
      }

      setRadicados((current) =>
        current.filter((item) => item.id !== radicado.id)
      );

      setSelectedIds((current) =>
        current.filter((id) => id !== radicado.id)
      );

      setMessage(
        `El radicado ${radicado.numero} fue eliminado correctamente.`
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible eliminar el radicado."
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function consultSelected() {
    if (!selectedIds.length) return;

    setBulkLoading(true);
    setError("");
    setMessage("");

    try {
      await iniciarWorkflowConsultaRadicado(token(), {
        tipo: "MANUAL",
        radicado_ids: selectedIds,
      });
      setMessage(`${selectedIds.length} consulta(s) enviadas al Workflow.`);

      clearSelection();
      await loadRadicados();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible procesar las consultas."
      );
    } finally {
      setBulkLoading(false);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;

    const confirmed = window.confirm(
      `¿Deseas eliminar los ${selectedIds.length} radicados seleccionados? Esta acción no se puede deshacer.`
    );

    if (!confirmed) return;

    setBulkLoading(true);
    setError("");
    setMessage("");

    try {
      const results = await Promise.allSettled(
        selectedIds.map(async (id) => {
          const response = await apiRequest(
            `/api/radicados/${id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token()}`,
              },
            }
          );

          const data = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(
              data?.detail ||
                `No fue posible eliminar el radicado ${id}.`
            );
          }

          return data;
        })
      );

      const successful = results.filter(
        (result) => result.status === "fulfilled"
      ).length;

      const failed = results.length - successful;

      if (successful > 0) {
        const successfulIds = selectedIds.filter(
          (_, index) =>
            results[index].status === "fulfilled"
        );

        setRadicados((current) =>
          current.filter(
            (radicado) => !successfulIds.includes(radicado.id)
          )
        );

        setSelectedIds((current) =>
          current.filter(
            (id) => !successfulIds.includes(id)
          )
        );
      }

      if (failed > 0) {
        setError(
          `${successful} radicado(s) eliminado(s) y ${failed} no pudieron eliminarse.`
        );
      } else {
        setMessage(
          `${successful} radicado(s) eliminado(s) correctamente.`
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible eliminar los radicados."
      );
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleSort() {
    setSortDirection((current) =>
      current === "desc" ? "asc" : "desc"
    );
  }

  return (
    <section className="space-y-6">
      {/* HEADER */}
      <header>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              className="text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              Gestión judicial
            </p>

            <h1
              className="mt-1 text-2xl font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              Radicados
            </h1>

            <p
              className="mt-1 text-sm"
              style={{ color: "var(--foreground-muted)" }}
            >
              Administra tus procesos judiciales y consulta sus
              actuaciones.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground-secondary)",
              }}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Actualizar
            </button>

            <button
              type="button"
              onClick={() => {
                setError("");
                setMessage("");
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus size={17} />
              Nuevo radicado
            </button>
          </div>
        </div>
      </header>

      {/* MENSAJES */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            background: "var(--danger-light)",
            borderColor: "var(--danger)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            background: "var(--success-light)",
            borderColor: "var(--success)",
            color: "var(--success)",
          }}
        >
          {message}
        </div>
      )}

      {/* HERRAMIENTAS */}
      <div
        className="rounded-xl border p-4 shadow-sm"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{
                color: "var(--foreground-muted)",
              }}
            />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar radicado, despacho o partes..."
              className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition"
              style={{
                background: "var(--surface-muted)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div
            className="text-sm"
            style={{
              color: "var(--foreground-muted)",
            }}
          >
            {filteredAndSortedRadicados.length}{" "}
            {filteredAndSortedRadicados.length === 1
              ? "radicado"
              : "radicados"}
          </div>
        </div>
      </div>

      {/* ACCIONES MASIVAS */}
      {selectedIds.length > 0 && (
        <div
          className="flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          style={{
            background: "var(--primary-light)",
            borderColor: "var(--primary)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex size-7 items-center justify-center rounded-full"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Check size={15} />
            </div>

            <span
              className="text-sm font-medium"
              style={{ color: "var(--foreground)" }}
            >
              {selectedIds.length}{" "}
              {selectedIds.length === 1
                ? "radicado seleccionado"
                : "radicados seleccionados"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => void consultSelected()}
                disabled={bulkLoading}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--foreground-secondary)",
                }}
              >
                <RefreshCw
                  size={15}
                  className={bulkLoading ? "animate-spin" : ""}
                />
                Consultar seleccionados
              </button>
            )}

            <button
              type="button"
              onClick={() => void deleteSelected()}
              disabled={bulkLoading}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50"
              style={{
                background: "var(--danger-light)",
                borderColor: "var(--danger)",
                color: "var(--danger)",
              }}
            >
              <Trash2 size={15} />
              Eliminar seleccionados
            </button>

            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkLoading}
              className="rounded-lg p-2 transition hover:bg-[var(--surface-hover)] disabled:opacity-50"
              style={{
                color: "var(--foreground-muted)",
              }}
              title="Cancelar selección"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      {/* TABLA */}
      <div
        className="overflow-hidden rounded-xl border shadow-sm"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{
            borderColor: "var(--border)",
          }}
        >
          <div>
            <h2
              className="font-semibold"
              style={{
                color: "var(--foreground)",
              }}
            >
              Procesos judiciales
            </h2>

            <p
              className="mt-0.5 text-xs"
              style={{
                color: "var(--foreground-muted)",
              }}
            >
              Ordenados por última actuación, de más reciente a
              más antigua.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-60 items-center justify-center">
            <RefreshCw
              size={24}
              className="animate-spin"
              style={{
                color: "var(--primary)",
              }}
            />
          </div>
        ) : filteredAndSortedRadicados.length === 0 ? (
          <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
            <div
              className="flex size-12 items-center justify-center rounded-full"
              style={{
                background: "var(--surface-muted)",
                color: "var(--foreground-muted)",
              }}
            >
              <FileText size={22} />
            </div>

            <p
              className="mt-4 font-medium"
              style={{
                color: "var(--foreground)",
              }}
            >
              {search
                ? "No se encontraron radicados"
                : "No hay radicados registrados"}
            </p>

            <p
              className="mt-1 max-w-md text-sm"
              style={{
                color: "var(--foreground-muted)",
              }}
            >
              {search
                ? "Prueba con otro número de radicado, despacho o parte."
                : "Agrega tu primer radicado para comenzar a realizar seguimiento."}
            </p>

            {!search && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                <Plus size={16} />
                Agregar radicado
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    borderColor: "var(--border)",
                  }}
                >
                  {/* SELECCIONAR TODO */}
                  <th className="w-12 px-5 py-3">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex size-5 items-center justify-center rounded border transition"
                      style={{
                        background: allVisibleSelected
                          ? "var(--primary)"
                          : "var(--surface)",
                        borderColor: allVisibleSelected
                          ? "var(--primary)"
                          : "var(--border-strong)",
                        color: "var(--primary-foreground)",
                      }}
                      title={
                        allVisibleSelected
                          ? "Deseleccionar todos"
                          : "Seleccionar todos"
                      }
                    >
                      {allVisibleSelected ? (
                        <Check size={13} />
                      ) : someVisibleSelected ? (
                        <span
                          className="block h-0.5 w-2.5"
                          style={{
                            background:
                              "var(--primary)",
                          }}
                        />
                      ) : (
                        <Square
                          size={12}
                          style={{
                            color: "var(--foreground-muted)",
                          }}
                        />
                      )}
                    </button>
                  </th>

                  <th
                    className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Radicado
                  </th>

                  <th
                    className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Despacho
                  </th>

                  <th
                    className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Partes
                  </th>

                  <th
                    className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Actuaciones
                  </th>

                  <th
                    className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={toggleSort}
                      className="inline-flex items-center gap-1.5 transition hover:opacity-80"
                    >
                      Última Actuación

                      {sortDirection === "desc" ? (
                        <ArrowDown size={14} />
                      ) : (
                        <ArrowUp size={14} />
                      )}
                    </button>
                  </th>

                  <th
                    className="px-5 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Estado
                  </th>

                  <th className="px-5 py-3" />
                </tr>
              </thead>

              <tbody>
                {filteredAndSortedRadicados.map((radicado) => {
                  const latest = getLatestActuacion(radicado);
                  const isSelected = selectedIds.includes(
                    radicado.id
                  );

                  const statusStyle = getStatusStyle(
                    radicado.estado_consulta
                  );

                  const isConsulting =
                    consultingId === radicado.id;

                  const isDeleting =
                    deletingId === radicado.id;

                  return (
                    <tr
                      key={radicado.id}
                      className="border-b transition last:border-b-0 hover:bg-[var(--surface-hover)]"
                      style={{
                        borderColor: "var(--border)",
                        background: isSelected
                          ? "var(--primary-light)"
                          : undefined,
                      }}
                    >
                      {/* CHECKBOX */}
                      <td className="px-5 py-4 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            toggleSelected(radicado.id)
                          }
                          className="flex size-5 items-center justify-center rounded border transition"
                          style={{
                            background: isSelected
                              ? "var(--primary)"
                              : "var(--surface)",
                            borderColor: isSelected
                              ? "var(--primary)"
                              : "var(--border-strong)",
                            color: "var(--primary-foreground)",
                          }}
                          title={
                            isSelected
                              ? "Deseleccionar"
                              : "Seleccionar"
                          }
                        >
                          {isSelected && (
                            <Check size={13} />
                          )}
                        </button>
                      </td>

                      {/* RADICADO */}
                      <td className="px-5 py-4 align-top">
                        <Link
                          href={`/gestion-procesos/abogado/radicados/${radicado.id}`}
                          className="group inline-flex items-center gap-2"
                        >
                          <span
                            className="font-medium transition group-hover:underline"
                            style={{
                              color: "var(--primary)",
                            }}
                          >
                            {radicado.numero}
                          </span>

                          <ChevronRight
                            size={15}
                            style={{
                              color:
                                "var(--foreground-muted)",
                            }}
                          />
                        </Link>
                      </td>

                      {/* DESPACHO */}
                      <td className="px-5 py-4 align-top">
                        <p
                          className="max-w-[200px] text-sm"
                          style={{
                            color:
                              "var(--foreground-secondary)",
                          }}
                        >
                          {radicado.despacho_departamento ||
                            "—"}
                        </p>
                      </td>

                      {/* PARTES */}
                      <td className="px-5 py-4 align-top">
                        <div className="max-w-[250px] space-y-1">
                          <p
                            className="truncate text-sm"
                            title={
                              radicado.demandante || ""
                            }
                            style={{
                              color:
                                "var(--foreground-secondary)",
                            }}
                          >
                            <span
                              className="text-xs"
                              style={{
                                color:
                                  "var(--foreground-muted)",
                              }}
                            >
                              Demandante:{" "}
                            </span>
                            {radicado.demandante || "—"}
                          </p>

                          <p
                            className="truncate text-sm"
                            title={
                              radicado.demandado || ""
                            }
                            style={{
                              color:
                                "var(--foreground-secondary)",
                            }}
                          >
                            <span
                              className="text-xs"
                              style={{
                                color:
                                  "var(--foreground-muted)",
                              }}
                            >
                              Demandado:{" "}
                            </span>
                            {radicado.demandado || "—"}
                          </p>
                        </div>
                      </td>

                      {/* ACTUACIONES */}
                      <td className="px-5 py-4 align-top">
                        <span
                          className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                          style={{
                            background:
                              "var(--surface-muted)",
                            color:
                              "var(--foreground-secondary)",
                          }}
                        >
                          {radicado.actuaciones?.length ?? 0}
                        </span>
                      </td>

                      {/* ÚLTIMA ACTUACIÓN */}
                      <td className="px-5 py-4 align-top">
                        {latest ? (
                          <div className="max-w-[280px]">
                            <p
                              className="text-sm font-medium"
                              style={{
                                color:
                                  "var(--foreground)",
                              }}
                            >
                              {formatDate(
                                latest.fecha_actuacion
                              )}
                            </p>

                            <p
                              className="mt-1 line-clamp-2 text-sm"
                              title={
                                latest.actuacion ||
                                latest.anotacion ||
                                ""
                              }
                              style={{
                                color:
                                  "var(--foreground-secondary)",
                              }}
                            >
                              {latest.actuacion ||
                                latest.anotacion ||
                                "Sin descripción"}
                            </p>
                          </div>
                        ) : (
                          <span
                            className="text-sm"
                            style={{
                              color:
                                "var(--foreground-muted)",
                            }}
                          >
                            Sin actuaciones
                          </span>
                        )}
                      </td>

                      {/* ESTADO */}
                      <td className="px-5 py-4 align-top">
                        <span
                          className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                          style={statusStyle}
                        >
                          {getStatusLabel(
                            radicado.estado_consulta
                          )}
                        </span>
                      </td>

                      {/* ACCIONES */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center justify-end gap-1">
                          {/* Consultar */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void consultarRadicado(radicado)}
                              disabled={isConsulting || isDeleting || bulkLoading}
                              className="rounded-lg p-2 transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                              title="Consultar actuaciones"
                              style={{ color: "var(--info)" }}
                            >
                              <RefreshCw
                                size={17}
                                className={isConsulting ? "animate-spin" : ""}
                              />
                            </button>
                          )}

                          {/* Ver detalle */}
                          <Link
                            href={`/gestion-procesos/abogado/radicados/${radicado.id}`}
                            className="rounded-lg p-2 transition hover:bg-[var(--surface-muted)]"
                            title="Ver detalle"
                            style={{
                              color:
                                "var(--foreground-muted)",
                            }}
                          >
                            <ChevronRight size={17} />
                          </Link>

                          {/* Eliminar */}
                          <button
                            type="button"
                            onClick={() =>
                              void deleteRadicado(
                                radicado
                              )
                            }
                            disabled={isDeleting || isConsulting || bulkLoading}
                            className="rounded-lg p-2 transition hover:bg-[var(--danger-light)] disabled:cursor-not-allowed disabled:opacity-50"
                            title="Eliminar radicado"
                            style={{ color: "var(--danger)" }}
                          >
                            {isDeleting ? (
                              <RefreshCw size={17} className="animate-spin" />
                            ) : (
                              <Trash2 size={17} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR RADICADO */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border shadow-xl"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{
                borderColor: "var(--border)",
              }}
            >
              <div>
                <h2
                  className="font-semibold"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Nuevo radicado
                </h2>

                <p
                  className="mt-0.5 text-xs"
                  style={{
                    color:
                      "var(--foreground-muted)",
                  }}
                >
                  Agrega un proceso para iniciar su seguimiento.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(false)
                }
                className="rounded-lg p-2 transition hover:bg-[var(--surface-muted)]"
                style={{
                  color:
                    "var(--foreground-muted)",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createRadicado}>
              <div className="space-y-4 p-5">
                <div>
                  <label
                    htmlFor="numero-radicado"
                    className="mb-1.5 block text-sm font-medium"
                    style={{
                      color:
                        "var(--foreground)",
                    }}
                  >
                    Número de radicado
                  </label>

                  <input
                    id="numero-radicado"
                    type="text"
                    value={nuevoNumero}
                    onChange={(event) =>
                      setNuevoNumero(
                        event.target.value
                      )
                    }
                    placeholder="Ej. 05001310300120260012300"
                    autoFocus
                    required
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition"
                    style={{
                      background:
                        "var(--surface-muted)",
                      borderColor:
                        "var(--border)",
                      color:
                        "var(--foreground)",
                    }}
                  />

                  <p
                    className="mt-1.5 text-xs"
                    style={{
                      color:
                        "var(--foreground-muted)",
                    }}
                  >
                    El número será utilizado para consultar
                    automáticamente el proceso.
                  </p>
                </div>
              </div>

              <div
                className="flex justify-end gap-2 border-t px-5 py-4"
                style={{
                  borderColor:
                    "var(--border)",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateModal(false)
                  }
                  disabled={creating}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50"
                  style={{
                    background:
                      "var(--surface)",
                    borderColor:
                      "var(--border)",
                    color:
                      "var(--foreground-secondary)",
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    creating ||
                    !nuevoNumero.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background:
                      "var(--primary)",
                    color:
                      "var(--primary-foreground)",
                  }}
                >
                  {creating && (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  )}

                  {creating
                    ? "Agregando..."
                    : "Agregar radicado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}