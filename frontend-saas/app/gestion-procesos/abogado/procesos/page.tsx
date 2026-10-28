"use client";

import { apiRequest, TOKEN_EN_COOKIE } from "@/lib/api";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { OperationResult } from "@/components/ui/OperationResult";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { formatDate, formatDateTime, formatRelative, toDate } from "@/lib/labels";
import { useNow } from "@/lib/useNow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  FileText,
  FolderOpen,
  ListChecks,
  Plus,
  X,
} from "lucide-react";


type Process = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  responsable?: { id: number; nombre_completo: string };
  colaboradores?: { id: number; nombre_completo: string }[];
  soy_responsable?: boolean;
  archivado_en?: string | null;
  radicados_count?: number;
  clientes_count?: number;
  clientes?: { id: number; nombre_completo: string }[];
  tareas_pendientes?: number;
  tareas_vencidas?: number;
  documentos_pendientes?: number;
  proxima_actividad?: string | null;
  ultima_actividad?: string | null;
  estado_atencion?: "ACTIVO" | "ATENCION";
  riesgo?: boolean;
  inactivo?: boolean;
  radicados: {
    id: number;
    numero: string;
    actuaciones: {
      id: number;
    }[];
  }[];
};

async function requestProcesses(showArchived: boolean, headers: Record<string, string>) {
  const route = showArchived ? "procesos/archivados" : "procesos";
  const response = await apiRequest(`/api/expedientes/${route}`, { headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "No fue posible cargar los procesos.");
  return data as Process[];
}

export default function ProcesosPage() {
  const [items, setItems] = useState<Process[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [scopeFilter, setScopeFilter] = useState("TODAS");
  const now = useNow();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeHref, setNoticeHref] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      setItems(await requestProcesses(showArchived, headers()));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al cargar los procesos."
      );
    } finally {
      setLoading(false);
    }
  }, [headers, showArchived]);

  useEffect(() => {
    let active = true;
    requestProcesses(showArchived, headers())
      .then((data) => { if (active) setItems(data); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Error al cargar los procesos.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [headers, showArchived]);

  const visibleProcesses = useMemo(
    () =>
      items.filter((item) =>
        scopeFilter === "TODAS" ||
        (scopeFilter === "PROPIOS" && item.soy_responsable) ||
        (scopeFilter === "COLABORATIVOS" && !item.soy_responsable) ||
        (scopeFilter === "ATENCION" && item.estado_atencion === "ATENCION") ||
        (scopeFilter === "RIESGO" && item.riesgo),
      ),
    [items, scopeFilter],
  );

  const processStatus = (item: Process) =>
    item.archivado_en
      ? { label: "Archivado", tone: "archived" as const, rank: 0 }
      : item.riesgo
        ? { label: "En riesgo", tone: "risk" as const, rank: 4 }
        : item.estado_atencion === "ATENCION"
          ? { label: "Requiere atención", tone: "attention" as const, rank: 3 }
          : item.inactivo
            ? { label: "Sin actividad reciente", tone: "review" as const, rank: 2 }
            : { label: "Al día", tone: "completed" as const, rank: 1 };

  const processColumns: DataTableColumn<Process>[] = [
    {
      key: "nombre",
      header: "Proceso",
      mobile: "title",
      sortValue: (item) => item.nombre,
      searchValue: (item) => `${item.nombre} ${item.descripcion ?? ""} ${item.radicados.map((radicado) => radicado.numero).join(" ")}`,
      render: (item) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-foreground">{item.nombre}</span>
          {item.radicados.length > 0 && <span className="mt-0.5 block truncate font-mono text-xs font-normal text-foreground-muted">{item.radicados.map((radicado) => radicado.numero).join(" · ")}</span>}
        </span>
      ),
      className: "max-w-xs",
    },
    {
      key: "clientes",
      header: "Clientes",
      mobile: "subtitle",
      sortValue: (item) => (item.clientes || []).map((client) => client.nombre_completo).join(", "),
      render: (item) => <span className="line-clamp-2">{(item.clientes || []).map((client) => client.nombre_completo).join(", ") || <span className="text-foreground-muted">Sin cliente</span>}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      mobile: "badge",
      sortValue: (item) => processStatus(item).rank,
      exportValue: (item) => processStatus(item).label,
      render: (item) => <Badge tone={processStatus(item).tone}>{processStatus(item).label}</Badge>,
    },
    {
      key: "responsable",
      header: "Responsable",
      mobile: "meta",
      hideOnMobile: true,
      sortValue: (item) => item.responsable?.nombre_completo,
      render: (item) => (
        <span className="block">
          {item.responsable?.nombre_completo || "—"}
          {!item.soy_responsable && <span className="block text-xs text-foreground-muted">Colaboras en este proceso</span>}
        </span>
      ),
    },
    {
      key: "tareas",
      header: "Tareas",
      mobile: "meta",
      align: "right",
      sortValue: (item) => (item.tareas_vencidas ?? 0) * 1000 + (item.tareas_pendientes ?? 0),
      render: (item) => (
        <span className="whitespace-nowrap tabular-nums">
          {item.tareas_pendientes ?? 0}
          {(item.tareas_vencidas ?? 0) > 0 && <span className="ml-1 font-semibold text-danger">({item.tareas_vencidas} venc.)</span>}
        </span>
      ),
    },
    {
      key: "documentos",
      header: "Documentos pend.",
      mobileLabel: "Documentos pendientes",
      mobile: "hidden",
      align: "right",
      wideOnly: true,
      sortValue: (item) => item.documentos_pendientes ?? 0,
      render: (item) => <span className="tabular-nums">{item.documentos_pendientes ?? 0}</span>,
    },
    {
      key: "proxima_actividad",
      header: "Próximo vencimiento",
      mobile: "meta",
      className: "whitespace-nowrap",
      sortValue: (item) => toDate(item.proxima_actividad),
      exportValue: (item) => formatDateTime(item.proxima_actividad),
      render: (item) => item.proxima_actividad ? formatDate(item.proxima_actividad) : <span className="text-foreground-muted">—</span>,
    },
    {
      key: "ultima_actividad",
      header: "Actividad",
      mobile: "hidden",
      hideOnMobile: true,
      className: "whitespace-nowrap",
      sortValue: (item) => toDate(item.ultima_actividad),
      exportValue: (item) => formatDateTime(item.ultima_actividad),
      render: (item) => item.ultima_actividad ? <span title={formatDateTime(item.ultima_actividad)}>{formatRelative(item.ultima_actividad, now)}</span> : "—",
    },
  ];

  const processActions: RowAction<Process>[] = [
    { label: "Abrir ficha", icon: <FolderOpen />, href: (item) => `/gestion-procesos/abogado/procesos/${item.id}` },
    { label: "Tareas", icon: <ListChecks />, href: (item) => `/gestion-procesos/abogado/procesos/${item.id}/tareas`, hidden: (item) => Boolean(item.archivado_en) },
    { label: "Agenda", icon: <CalendarDays />, href: (item) => `/gestion-procesos/abogado/procesos/${item.id}/agenda`, hidden: (item) => Boolean(item.archivado_en) },
    { label: "Documentos", icon: <FileText />, href: (item) => `/gestion-procesos/abogado/documentos?proceso=${item.id}`, hidden: (item) => Boolean(item.archivado_en) },
    {
      label: "Archivar proceso",
      icon: <Archive />,
      tone: "danger",
      separated: true,
      hidden: (item) => Boolean(item.archivado_en) || !item.soy_responsable,
      disabled: () => working,
      onSelect: (item) => {
        if (window.confirm(`¿Archivar “${item.nombre}”? Podrás restaurarlo desde Archivados.`)) void changeArchiveStatus(item.id, true);
      },
    },
    {
      label: "Restaurar proceso",
      icon: <ArchiveRestore />,
      hidden: (item) => !item.archivado_en,
      disabled: () => working,
      onSelect: (item) => changeArchiveStatus(item.id, false),
    },
  ];

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) return;

    setWorking(true);
    setError("");

    try {
      const response = await apiRequest(
        `/api/expedientes/procesos`,
        {
          method: "POST",
          headers: {
            ...headers(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre: name.trim(),
            descripcion: description.trim() || null,
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.detail || "No fue posible crear el proceso."
        );
      }

      setName("");
      setDescription("");
      setShowCreateModal(false);

      await load();

      setNotice("Proceso creado correctamente.");
      setNoticeHref(typeof body.id === "number" ? `/gestion-procesos/abogado/procesos/${body.id}` : null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al crear el proceso."
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeArchiveStatus(processId: number, archive: boolean) {
    setWorking(true);
    setError("");
    try {
      const response = await apiRequest(`/api/expedientes/procesos/${processId}${archive ? "" : "/restaurar"}`, {
        method: archive ? "DELETE" : "PATCH",
        headers: headers(),
      });
      const body: { mensaje?: string; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "No fue posible actualizar el proceso.");
      await load();
      setNotice(body.mensaje || (archive ? "Proceso archivado." : "Proceso restaurado."));
      setNoticeHref(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar el proceso.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="motion-swap mx-auto max-w-7xl space-y-5">
      {/* TOAST */}
      {notice && <OperationResult title={notice} description={noticeHref ? "El expediente quedó creado y puedes continuar con sus datos." : undefined} actionHref={noticeHref ?? undefined} actionLabel={noticeHref ? "Abrir expediente" : undefined} onDismiss={() => { setNotice(""); setNoticeHref(null); }} />}

      {/* HEADER */}
      <PageHeader
        overline="Despacho"
        title={showArchived ? "Procesos archivados" : "Procesos"}
        description="Administra los expedientes y procesos del despacho y accede a la ficha de cada uno para consultar su información."
        action={
          !showArchived ? (
            <Button
              variant="primary"
              onClick={() => {
                setError("");
                setShowCreateModal(true);
              }}
              icon={<Plus className="size-4" />}
            >
              Nuevo proceso
            </Button>
          ) : undefined
        }
      />

      <SegmentedControl
        label="Estado de los procesos"
        value={showArchived ? "archivados" : "activos"}
        onChange={(value) => {
          const archived = value === "archivados";
          if (archived === showArchived) return;
          setLoading(true);
          setItems([]);
          setScopeFilter("TODAS");
          setShowArchived(archived);
        }}
        options={[{ value: "activos", label: "Activos" }, { value: "archivados", label: "Archivados" }]}
      />

      {!showArchived && (
        <SummaryStrip
          active={scopeFilter}
          onSelect={(key) => setScopeFilter(key ?? "TODAS")}
          items={[
            { key: "TODAS", label: "Procesos activos", value: items.length },
            { key: "RIESGO", label: "En riesgo", value: items.filter((item) => item.riesgo).length, tone: "danger" },
            { key: "ATENCION", label: "Requieren atención", value: items.filter((item) => item.estado_atencion === "ATENCION").length, tone: "warning" },
            { key: "COLABORATIVOS", label: "Como colaborador", value: items.filter((item) => !item.soy_responsable).length },
          ]}
        />
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light px-4 py-3 text-sm font-medium text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => { setError(""); void load(); }}>Reintentar</Button>
        </div>
      )}

      <DataTable
        caption={showArchived ? "Procesos archivados" : "Procesos del despacho"}
        rows={visibleProcesses}
        columns={processColumns}
        rowKey={(item) => item.id}
        rowHref={(item) => `/gestion-procesos/abogado/procesos/${item.id}`}
        rowActions={processActions}
        rowTone={(item) => (item.riesgo ? "danger" : item.estado_atencion === "ATENCION" ? "warning" : undefined)}
        searchPlaceholder="Buscar por proceso, cliente o radicado"
        initialSort={{ key: "estado", direction: "desc" }}
        exportFilename={showArchived ? "procesos-archivados" : "procesos"}
        storageKey="abogado-procesos"
        loading={loading}
        onRefresh={() => void load()}
        emptyTitle={showArchived ? "No hay procesos archivados" : scopeFilter !== "TODAS" ? "Ningún proceso coincide con este filtro" : "Aún no hay procesos"}
        emptyDescription={showArchived ? "Los procesos que archives aparecerán aquí y podrás restaurarlos." : scopeFilter !== "TODAS" ? "Toca el indicador de nuevo para ver todos." : "Crea el primer expediente del despacho."}
        emptyAction={!showArchived && scopeFilter === "TODAS" ? <Button variant="primary" onClick={() => { setError(""); setShowCreateModal(true); }} icon={<Plus className="size-4" />}>Nuevo proceso</Button> : undefined}
      />

      {/* MODAL CREAR PROCESO */}
      {showCreateModal && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-process-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2
                  id="create-process-title"
                  className="text-base font-semibold text-foreground"
                >
                  Nuevo proceso
                </h2>

                <p className="mt-0.5 text-xs text-muted">
                  Registra un nuevo proceso en el despacho.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!working) {
                    setShowCreateModal(false);
                    setName("");
                    setDescription("");
                  }
                }}
                className="rounded-lg p-2 text-muted hover:bg-surface-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={create}>
              <div className="space-y-4 p-5">
                <div>
                  <label
                    htmlFor="process-name"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Nombre del proceso
                  </label>

                  <input
                    id="process-name"
                    required
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ej. Proceso ejecutivo Juan Pérez"
                    className="w-full rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-brand-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="process-description"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Descripción
                    <span className="ml-1 font-normal text-muted">
                      (opcional)
                    </span>
                  </label>

                  <textarea
                    id="process-description"
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    placeholder="Descripción breve del proceso..."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-secondary px-5 py-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={working}
                  onClick={() => {
                    setShowCreateModal(false);
                    setName("");
                    setDescription("");
                  }}
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  loading={working}
                  disabled={working || !name.trim()}
                >
                  Crear proceso
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
