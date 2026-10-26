"use client";

import { apiRequest, iniciarWorkflowConsultaRadicado } from "@/lib/api";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { consultaLabel } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ChevronRight,
  Plus,
  RefreshCw,
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

    // Orden 1 es la actuación más reciente en la Rama Judicial.
    return (a.orden ?? 0) - (b.orden ?? 0);
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

export default function RadicadosPage() {
  const [radicados, setRadicados] = useState<Radicado[]>([]);

  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [, setRefreshing] = useState(false);

  const [consultingId, setConsultingId] = useState<number | null>(
    null
  );

  const [deletingId, setDeletingId] = useState<number | null>(
    null
  );

  const [, setBulkLoading] = useState(false);

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
      `¿Quitar el radicado ${radicado.numero} de tu lista? Dejarás de recibir sus actuaciones.`
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

  async function consultSelected(selectedIds: number[]) {
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

  async function deleteSelected(selectedIds: number[]) {
    if (!selectedIds.length) return;

    const confirmed = window.confirm(
      `¿Quitar los ${selectedIds.length} radicados seleccionados de tu lista?`
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


  const consulta = (radicado: Radicado) => consultaLabel(radicado.estado_consulta);
  const hasIssue = (radicado: Radicado) => ["risk", "attention"].includes(consulta(radicado).tone);
  const visibleRadicados = radicados.filter((radicado) =>
    !quickFilter ||
    (quickFilter === "OK" && consulta(radicado).label === "Consultado") ||
    (quickFilter === "INCIDENCIAS" && hasIssue(radicado)) ||
    (quickFilter === "SIN_CONSULTAR" && consulta(radicado).label === "Sin consultar"),
  );

  const radicadoColumns: DataTableColumn<Radicado>[] = [
    {
      key: "numero",
      header: "Radicado",
      mobile: "title",
      sortValue: (radicado) => radicado.numero,
      searchValue: (radicado) => [radicado.numero, radicado.demandante, radicado.demandado, radicado.despacho_departamento, getLatestActuacion(radicado)?.actuacion].filter(Boolean).join(" "),
      render: (radicado) => <span className="font-mono text-[13px] font-medium text-foreground">{radicado.numero}</span>,
    },
    {
      key: "partes",
      header: "Partes",
      mobile: "subtitle",
      sortValue: (radicado) => radicado.demandante,
      render: (radicado) => (
        <span className="block max-w-72">
          <span className="line-clamp-2">{[radicado.demandante, radicado.demandado].filter(Boolean).join(" vs. ") || <span className="text-foreground-muted">Pendiente de consulta</span>}</span>
          {radicado.despacho_departamento && <span className="block truncate text-xs text-foreground-muted">{radicado.despacho_departamento}</span>}
        </span>
      ),
    },
    {
      key: "estado",
      header: "Consulta",
      mobile: "badge",
      sortValue: (radicado) => consulta(radicado).label,
      render: (radicado) => <Badge tone={consulta(radicado).tone}>{consultingId === radicado.id ? "Consultando…" : consulta(radicado).label}</Badge>,
    },
    {
      key: "ultima_actuacion",
      header: "Última actuación",
      mobile: "meta",
      sortValue: (radicado) => getLatestActuacion(radicado)?.fecha_actuacion,
      exportValue: (radicado) => [getLatestActuacion(radicado)?.fecha_actuacion, getLatestActuacion(radicado)?.actuacion].filter(Boolean).join(" · "),
      render: (radicado) => {
        const latest = getLatestActuacion(radicado);
        return latest ? (
          <span className="block max-w-64">
            <span className="block truncate">{latest.actuacion || "Actuación"}</span>
            <span className="text-xs text-foreground-muted">{formatDate(latest.fecha_actuacion)}</span>
          </span>
        ) : <span className="text-foreground-muted">Sin actuaciones</span>;
      },
    },
    {
      key: "actuaciones",
      header: "Actuaciones",
      mobile: "hidden",
      align: "right",
      hideOnMobile: true,
      sortValue: (radicado) => radicado.actuaciones?.length ?? 0,
      render: (radicado) => <span className="tabular-nums">{radicado.actuaciones?.length ?? 0}</span>,
    },
    {
      key: "consultado_en",
      header: "Consultado",
      mobile: "meta",
      wideOnly: true,
      className: "whitespace-nowrap",
      sortValue: (radicado) => radicado.consultado_en,
      render: (radicado) => radicado.consultado_en || <span className="text-foreground-muted">Nunca</span>,
    },
  ];

  const radicadoActions: RowAction<Radicado>[] = [
    { label: "Ver actuaciones", icon: <ChevronRight />, href: (radicado) => `/gestion-procesos/abogado/radicados/${radicado.id}` },
    { label: "Consultar ahora", icon: <RefreshCw />, onSelect: (radicado) => consultarRadicado(radicado), disabled: (radicado) => consultingId === radicado.id },
    { label: "Quitar de mi lista", icon: <Trash2 />, tone: "danger", separated: true, onSelect: (radicado) => deleteRadicado(radicado), disabled: (radicado) => deletingId === radicado.id },
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline="Expedientes"
        title="Radicados"
        description="Radicados judiciales que sigues, con el estado de su consulta y la última actuación registrada."
        action={
          <Button variant="primary" onClick={() => { setError(""); setMessage(""); setShowCreateModal(true); }} icon={<Plus className="size-4" />}>
            Nuevo radicado
          </Button>
        }
      />

      <SummaryStrip
        active={quickFilter}
        onSelect={setQuickFilter}
        items={[
          { key: "TODOS", label: "Radicados", value: radicados.length },
          { key: "OK", label: "Consultados", value: radicados.filter((radicado) => consulta(radicado).label === "Consultado").length, tone: "success" },
          { key: "INCIDENCIAS", label: "Con incidencias", value: radicados.filter(hasIssue).length, tone: "danger" },
          { key: "SIN_CONSULTAR", label: "Sin consultar", value: radicados.filter((radicado) => consulta(radicado).label === "Sin consultar").length, tone: "warning" },
        ]}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Cerrar error"><X className="size-4" /></button>
        </div>
      )}
      {message && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-success/30 bg-success-light px-4 py-3 text-sm text-success">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage("")} aria-label="Cerrar aviso"><X className="size-4" /></button>
        </div>
      )}

      <DataTable
        caption="Radicados"
        rows={quickFilter === "TODOS" ? radicados : visibleRadicados}
        columns={radicadoColumns}
        rowKey={(radicado) => radicado.id}
        rowHref={(radicado) => `/gestion-procesos/abogado/radicados/${radicado.id}`}
        rowActions={radicadoActions}
        bulkActions={[
          { label: "Consultar", icon: <RefreshCw />, onRun: (rows) => consultSelected(rows.map((radicado) => radicado.id)) },
          { label: "Quitar de mi lista", icon: <Trash2 />, tone: "danger", onRun: (rows) => deleteSelected(rows.map((radicado) => radicado.id)) },
        ]}
        rowTone={(radicado) => (consulta(radicado).tone === "risk" ? "danger" : undefined)}
        searchPlaceholder="Buscar por número, partes, despacho o actuación"
        initialSort={{ key: "ultima_actuacion", direction: "desc" }}
        exportFilename="radicados"
        storageKey="abogado-radicados"
        loading={loading}
        onRefresh={() => void refresh()}
        emptyTitle={radicados.length === 0 ? "Aún no sigues ningún radicado" : "Ningún radicado coincide con este filtro"}
        emptyDescription={radicados.length === 0 ? "Agrega el número de 23 dígitos para consultar sus actuaciones automáticamente." : "Toca el indicador de nuevo para ver todos."}
        emptyAction={radicados.length === 0 ? <Button variant="primary" onClick={() => setShowCreateModal(true)} icon={<Plus className="size-4" />}>Nuevo radicado</Button> : undefined}
      />

      {/* MODAL CREAR RADICADO */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 px-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Nuevo radicado
                </h2>

                <p className="mt-0.5 text-xs text-muted">
                  Agrega un proceso para iniciar su seguimiento.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(false)
                }
                className="rounded-lg p-2 text-muted hover:bg-surface-secondary hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createRadicado}>
              <div className="space-y-4 p-5">
                <div>
                  <label
                    htmlFor="numero-radicado"
                    className="mb-1.5 block text-sm font-medium text-foreground"
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
                    className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-brand-500"
                  />

                  <p className="mt-1.5 text-xs text-muted">
                    El número será utilizado para consultar
                    automáticamente el proceso.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setShowCreateModal(false)
                  }
                  disabled={creating}
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  loading={creating}
                  disabled={
                    creating ||
                    !nuevoNumero.trim()
                  }
                >
                  Agregar radicado
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}