"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays, FileText, FolderOpen, ListChecks, Plus, RefreshCw } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Radicado } from "@/components/ui/Radicado";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { useToast } from "@/components/ui/ToastProvider";
import { useSession } from "@/context/SessionContext";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, fechaCorta } from "@/lib/fechas";
import { useAccionDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Proceso = Esquemas["ProcesoResumen"];
type Filtro = "todos" | "vencidas" | "cliente" | "colaboro";
const RUTA = "/gestion-procesos/abogado/procesos";

/** Todas las páginas del listado: la firma tiene decenas o pocos cientos de procesos. */
async function todosLosProcesos(archivados: boolean) {
  const items: Proceso[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < 20; pagina++) {
    const { data, error } = await api.GET("/api/v2/procesos", { params: { query: { archivados, limite: 100, cursor } } });
    if (!data) throw new Error(mensajeDeError(error));
    items.push(...data.items);
    if (!data.siguiente) break;
    cursor = data.siguiente;
  }
  return items;
}

export default function ProcesosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();
  const [archivados, setArchivados] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [procesos, setProcesos] = useState<Proceso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [archivar, setArchivar] = useState<Proceso | null>(null);

  useAccionDeUrl("nuevo", useCallback(() => setNuevo(true), []));

  const cargar = useCallback(async () => {
    try {
      setProcesos(await todosLosProcesos(archivados));
      setError(null);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudieron cargar los procesos.");
    }
  }, [archivados]);
  useLoadEffect(cargar);

  async function reabrir(p: Proceso) {
    const { error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/reabrir", { params: { path: { proceso_id: p.id } } });
    if (fallo) {
      toast({ title: mensajeDeError(fallo), tone: "error" });
      return;
    }
    toast({ title: `«${p.nombre}» volvió a los procesos activos`, tone: "success" });
    void cargar();
  }

  async function confirmarArchivo() {
    if (!archivar) return;
    const { error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/archivar", { params: { path: { proceso_id: archivar.id } } });
    if (fallo) throw new Error(mensajeDeError(fallo));
    toast({ title: `«${archivar.nombre}» quedó archivado`, description: "Lo encuentra en Archivados si necesita reabrirlo.", tone: "success" });
    void cargar();
  }

  const lista = procesos ?? [];
  const colaboro = (p: Proceso) => p.responsable.id !== user?.id;
  const conteo = {
    todos: lista.length,
    vencidas: lista.filter((p) => (p.actividad?.tareas_vencidas ?? 0) > 0).length,
    cliente: lista.filter((p) => (p.actividad?.pendiente_cliente ?? 0) > 0).length,
    colaboro: lista.filter(colaboro).length,
  };
  const visibles = lista.filter((p) =>
    filtro === "todos"
    || (filtro === "vencidas" && (p.actividad?.tareas_vencidas ?? 0) > 0)
    || (filtro === "cliente" && (p.actividad?.pendiente_cliente ?? 0) > 0)
    || (filtro === "colaboro" && colaboro(p)),
  );

  const columnas: DataTableColumn<Proceso>[] = [
    {
      key: "nombre",
      header: "Proceso",
      mobile: "title",
      sortValue: (p) => p.nombre,
      searchValue: (p) => `${p.nombre} ${p.radicados.join(" ")} ${p.clientes.map((c) => c.nombre).join(" ")}`,
      render: (p) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink">{p.nombre}</span>
          {p.radicados.length > 0 && (
            <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Radicado numero={p.radicados[0]} copiable={false} className="truncate" />
              {p.radicados.length > 1 && <span className="shrink-0">+{p.radicados.length - 1}</span>}
            </span>
          )}
        </span>
      ),
      className: "max-w-xs",
    },
    {
      key: "clientes",
      header: "Clientes",
      mobile: "subtitle",
      sortValue: (p) => p.clientes.map((c) => c.nombre).join(", "),
      render: (p) => <span className="line-clamp-2">{p.clientes.map((c) => c.nombre).join(", ") || <span className="text-ink-3">Sin clientes</span>}</span>,
    },
    {
      key: "etapa",
      header: "Etapa",
      mobile: "meta",
      sortValue: (p) => (p.etapa ? p.etapa.posicion / Math.max(1, p.etapa.total) : -1),
      exportValue: (p) => p.etapa?.nombre ?? "Sin etapa",
      render: (p) => p.etapa ? (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className="flex gap-0.5">
            {Array.from({ length: p.etapa.total }, (_, i) => (
              <span key={i} className={cx("h-1.5 w-2.5 rounded-full", i < p.etapa!.posicion - 1 ? "bg-navy" : i === p.etapa!.posicion - 1 ? "bg-gold" : "bg-line-strong")} />
            ))}
          </span>
          {p.etapa.nombre}
        </span>
      ) : <span className="text-ink-3">Sin etapa</span>,
    },
    {
      key: "responsable",
      header: "Responsable",
      mobile: "meta",
      hideOnMobile: true,
      wideOnly: true,
      sortValue: (p) => p.responsable.nombre,
      render: (p) => (
        <span className="block">
          {p.responsable.nombre}
          {colaboro(p) && <span className="block text-[12.5px] text-ink-3">Usted colabora</span>}
        </span>
      ),
    },
    {
      key: "tareas",
      header: "Tareas",
      mobile: "meta",
      align: "right",
      sortValue: (p) => (p.actividad?.tareas_vencidas ?? 0) * 1000 + (p.actividad?.tareas_abiertas ?? 0),
      exportValue: (p) => String(p.actividad?.tareas_abiertas ?? 0),
      render: (p) => (
        <span className="whitespace-nowrap tabular-nums">
          {p.actividad?.tareas_abiertas ?? 0}
          {(p.actividad?.tareas_vencidas ?? 0) > 0 && <span className="ml-1 font-semibold text-bad">({p.actividad!.tareas_vencidas} vencida{p.actividad!.tareas_vencidas === 1 ? "" : "s"})</span>}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Del cliente",
      mobileLabel: "Esperando al cliente",
      mobile: "hidden",
      align: "right",
      wideOnly: true,
      sortValue: (p) => p.actividad?.pendiente_cliente ?? 0,
      render: (p) => <span className="tabular-nums">{p.actividad?.pendiente_cliente || <span className="text-ink-3">—</span>}</span>,
    },
    {
      key: "vence",
      header: archivados ? "Archivado" : "Vence",
      mobileLabel: archivados ? "Archivado" : "Próxima tarea vence",
      mobile: "meta",
      className: "whitespace-nowrap",
      sortValue: (p) => (archivados ? p.archivado_en : p.actividad?.proximo_vencimiento) ?? "",
      exportValue: (p) => (archivados ? fechaCorta(p.archivado_en) : p.actividad?.proximo_vencimiento ?? ""),
      render: (p) => archivados
        ? fechaCorta(p.archivado_en)
        : p.actividad?.proximo_vencimiento ? diaCorto(p.actividad.proximo_vencimiento.slice(0, 10)) : <span className="text-ink-3">—</span>,
    },
  ];

  const acciones: RowAction<Proceso>[] = [
    { label: "Abrir el expediente", icon: <FolderOpen size={16} />, href: (p) => `${RUTA}/${p.id}` },
    { label: "Tareas", icon: <ListChecks size={16} />, href: (p) => `${RUTA}/${p.id}/tareas`, hidden: (p) => Boolean(p.archivado_en) },
    { label: "Agenda", icon: <CalendarDays size={16} />, href: (p) => `${RUTA}/${p.id}/agenda`, hidden: (p) => Boolean(p.archivado_en) },
    { label: "Documentos", icon: <FileText size={16} />, href: (p) => `${RUTA}/${p.id}/documentos`, hidden: (p) => Boolean(p.archivado_en) },
    { label: "Archivar", icon: <Archive size={16} />, tone: "danger", separated: true, hidden: (p) => Boolean(p.archivado_en) || !p.puede_administrar, onSelect: (p) => setArchivar(p) },
    { label: "Reabrir", icon: <ArchiveRestore size={16} />, hidden: (p) => !p.archivado_en || !p.puede_administrar, onSelect: (p) => void reabrir(p) },
  ];

  const vacio = archivados
    ? ["No hay procesos archivados", "Los procesos que archive aparecen aquí y se pueden reabrir."]
    : filtro !== "todos"
      ? ["Ningún proceso coincide", "Toque el filtro otra vez para ver todos."]
      : ["Aún no hay procesos", "Cree el primer expediente de la firma."];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={archivados ? "Procesos archivados" : "Procesos"}
        description="Los expedientes de la firma: su etapa, lo que vence y lo que falta del cliente."
        action={!archivados ? <Button icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nuevo proceso</Button> : undefined}
      />

      <div className="mb-4">
        <SegmentedControl
          label="Procesos activos o archivados"
          value={archivados ? "archivados" : "activos"}
          onChange={(v) => { setProcesos(null); setFiltro("todos"); setArchivados(v === "archivados"); }}
          options={[{ value: "activos", label: "Activos" }, { value: "archivados", label: "Archivados" }]}
        />
      </div>

      {!archivados && (
        <SummaryStrip
          active={filtro}
          onSelect={(clave) => setFiltro(!clave || clave === filtro ? "todos" : (clave as Filtro))}
          items={[
            { key: "todos", label: "Procesos activos", value: procesos ? conteo.todos : "—" },
            { key: "vencidas", label: "Con tareas vencidas", value: procesos ? conteo.vencidas : "—", tone: conteo.vencidas ? "danger" : "default" },
            { key: "cliente", label: "Esperando al cliente", value: procesos ? conteo.cliente : "—", tone: conteo.cliente ? "warning" : "default" },
            { key: "colaboro", label: "Donde colabora", value: procesos ? conteo.colaboro : "—" },
          ]}
        />
      )}

      <div className="mt-5">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : (
          <DataTable
            caption={archivados ? "Procesos archivados" : "Procesos de la firma"}
            rows={visibles}
            columns={archivados ? columnas.filter((c) => c.key !== "tareas" && c.key !== "cliente") : columnas}
            rowKey={(p) => p.id}
            rowHref={(p) => `${RUTA}/${p.id}`}
            rowActions={acciones}
            rowTone={(p) => ((p.actividad?.tareas_vencidas ?? 0) > 0 ? "danger" : undefined)}
            searchPlaceholder="Buscar por proceso, cliente o radicado"
            initialSort={{ key: archivados ? "vence" : "nombre", direction: archivados ? "desc" : "asc" }}
            exportFilename={archivados ? "procesos-archivados" : "procesos"}
            storageKey="abogado-procesos-v2"
            loading={!procesos}
            onRefresh={() => void cargar()}
            emptyTitle={vacio[0]}
            emptyDescription={vacio[1]}
            emptyAction={!archivados && filtro === "todos" ? <Button icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nuevo proceso</Button> : undefined}
          />
        )}
      </div>

      {nuevo && <NuevoProcesoModal onClose={() => setNuevo(false)} onCreado={(p) => router.push(`${RUTA}/${p.id}/relaciones`)} />}
      <ConfirmDialog
        open={archivar !== null}
        onClose={() => setArchivar(null)}
        onConfirm={confirmarArchivo}
        title={`¿Archivar «${archivar?.nombre ?? ""}»?`}
        description="Sale de las listas y de Hoy, y el cliente deja de verlo como activo. Todo su expediente se conserva y se puede reabrir."
        confirmLabel="Archivar"
      />
    </div>
  );
}

function NuevoProcesoModal({ onClose, onCreado }: { onClose: () => void; onCreado: (p: Esquemas["ProcesoDetalle"]) => void }) {
  const id = useId();
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear(evento: FormEvent) {
    evento.preventDefault();
    if (!nombre.trim()) {
      setError("Escriba el nombre del proceso.");
      return;
    }
    setGuardando(true);
    const { data, error: fallo } = await api.POST("/api/v2/procesos", { body: { nombre: nombre.trim(), descripcion: descripcion.trim() || null } });
    setGuardando(false);
    if (!data) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: "Proceso creado", description: "Ahora agregue sus clientes y radicados.", tone: "success" });
    onCreado(data);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Nuevo proceso" description="Usted queda como responsable. Los clientes, radicados y la etapa se agregan después.">
      <form onSubmit={crear} noValidate>
        <label htmlFor={`${id}-nombre`} className={ETIQUETA}>Nombre del proceso</label>
        <input id={`${id}-nombre`} value={nombre} maxLength={255} autoFocus onChange={(e) => { setNombre(e.target.value); setError(null); }} placeholder="Ej.: Sucesión de Jorge Restrepo" aria-invalid={error ? true : undefined} className={CAMPO} />
        <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Descripción <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-descripcion`} rows={4} maxLength={4000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="De qué se trata, en pocas palabras." className={cx(CAMPO, "resize-y py-2.5")} />
        {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<Plus size={16} />}>Crear proceso</Button>
        </div>
      </form>
    </Modal>
  );
}
