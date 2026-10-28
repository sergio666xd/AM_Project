"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { CalendarClock, Check, CircleDashed, Flag, LayoutTemplate, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";

import { CalendarioMes, type ElementoCalendario } from "@/components/calendario/CalendarioMes";
import { AplicarPlantillaModal } from "@/components/tareas/AplicarPlantillaModal";
import { CambioLoteModal, type CambioLote } from "@/components/tareas/CambioLoteModal";
import { NuevaTareaModal } from "@/components/tareas/NuevaTareaModal";
import { TableroTareas } from "@/components/tareas/TableroTareas";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaDe, fechaCorta, hoyISO } from "@/lib/fechas";
import { RUTA_TAREA, estaAbierta, nombreEstado, prioridad, type EstadoTarea, type Tarea } from "@/lib/tareas";
import { useAccionDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { useNow } from "@/lib/useNow";

type Grupo = "abiertas" | "vencidas" | "semana" | "completadas";
type Vista = "lista" | "tablero" | "calendario";

const CAMPO_BUSQUEDA =
  "h-10 w-full rounded-lg bg-sheet pl-9 pr-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] placeholder:text-ink-3 focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";
const CATORCE_DIAS = 14 * 86_400_000;

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export default function TareasPage() {
  const { toast } = useToast();
  const [vista, setVista] = useState<Vista>("lista");
  const [grupo, setGrupo] = useState<Grupo>("abiertas");
  const [soloMias, setSoloMias] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [lista, setLista] = useState<Esquemas["ListaTareas"] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mes, setMes] = useState(hoyISO());
  const [nueva, setNueva] = useState(false);
  const [conPlantilla, setConPlantilla] = useState(false);
  const [cambio, setCambio] = useState<{ tipo: "fecha" | "prioridad"; tareas: Tarea[] } | null>(null);
  const [eliminar, setEliminar] = useState<Tarea[] | null>(null);

  useAccionDeUrl("nuevo", useCallback(() => setNueva(true), []));

  // El tablero y el calendario necesitan también las completadas; la lista, solo el grupo elegido.
  const grupoConsultado = vista === "lista" ? grupo : "todas";

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/tareas", { params: { query: { grupo: grupoConsultado, solo_mias: soloMias } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setLista(data);
    setCargando(false);
  }, [grupoConsultado, soloMias]);
  useLoadEffect(cargar);

  const filtradas = useMemo(() => {
    const items = lista?.items ?? [];
    const q = normalizar(busqueda.trim());
    if (!q) return items;
    return items.filter((t) => normalizar([t.titulo, t.proceso?.nombre, t.cliente?.nombre, t.radicado].filter(Boolean).join(" ")).includes(q));
  }, [lista, busqueda]);

  const ahora = useNow();
  const delTablero = useMemo(
    () => filtradas.filter((t) => estaAbierta(t) || (t.estado === "COMPLETADA" && t.completada_en && ahora - Date.parse(t.completada_en) < CATORCE_DIAS)),
    [filtradas, ahora],
  );

  const delCalendario = useMemo<ElementoCalendario[]>(() => filtradas.filter((t) => t.fecha_limite && t.estado !== "CANCELADA").map((t) => ({
    clave: `tarea:${t.id}`,
    titulo: t.titulo,
    dia: diaDe(t.fecha_limite!),
    etiqueta: t.estado === "COMPLETADA" ? "Completada" : t.vencida ? "Vencida" : prioridad(t.prioridad).nombre,
    tono: t.estado === "COMPLETADA" ? "ok" : t.vencida ? "bad" : prioridad(t.prioridad).tono,
    detalle: t.proceso?.nombre,
    href: RUTA_TAREA(t.id),
    tachado: t.estado === "COMPLETADA",
  })), [filtradas]);

  async function enLote(ids: number[], cuerpo: Partial<Omit<Esquemas["CambioEnLote"], "ids">>, exito?: string): Promise<string | null> {
    const { data, error: fallo } = await api.PATCH("/api/v2/tareas/lote", { body: { ids, eliminar: false, ...cuerpo } });
    if (fallo || !data) {
      const mensaje = mensajeDeError(fallo);
      toast({ title: "No se aplicó el cambio", description: mensaje, tone: "error" });
      void cargar();
      return mensaje;
    }
    toast({ title: exito ?? data.mensaje, tone: "success" });
    void cargar();
    return null;
  }

  function mover(tarea: Tarea, estado: EstadoTarea) {
    // Se ve el cambio enseguida; si la API lo rechaza, la recarga lo deshace.
    setLista((actual) => actual && {
      ...actual,
      items: actual.items.map((t) => (t.id === tarea.id ? { ...t, estado, completada_en: estado === "COMPLETADA" ? new Date().toISOString() : null, vencida: estado === "COMPLETADA" ? false : t.vencida } : t)),
    });
    void enLote([tarea.id], { estado }, `«${tarea.titulo}» pasó a ${nombreEstado(estado).toLowerCase()}`);
  }

  const columnas: DataTableColumn<Tarea>[] = [
    {
      key: "titulo",
      header: "Tarea",
      mobile: "title",
      sortValue: (t) => t.titulo,
      searchValue: (t) => t.titulo,
      render: (t) => (
        <div className="min-w-0">
          <span className={cx("font-semibold text-pretty text-ink", t.estado === "COMPLETADA" && "text-ink-2 line-through decoration-ink-3/60")}>{t.titulo}</span>
          {t.subtareas.total > 0 && <span className="ml-2 text-[12.5px] tabular-nums text-ink-3">{t.subtareas.hechas}/{t.subtareas.total}</span>}
          {t.cliente && <span className="block text-[12.5px] text-ink-3">Para {t.cliente.nombre} (cliente)</span>}
        </div>
      ),
    },
    {
      key: "proceso",
      header: "Proceso",
      mobile: "subtitle",
      sortValue: (t) => t.proceso?.nombre ?? "",
      exportValue: (t) => t.proceso?.nombre ?? "General",
      render: (t) => (t.proceso ? <span className="text-ink-2">{t.proceso.nombre}</span> : <span className="text-ink-3">General</span>),
    },
    {
      key: "prioridad",
      header: "Prioridad",
      mobile: "badge",
      sortValue: (t) => prioridad(t.prioridad).orden,
      exportValue: (t) => prioridad(t.prioridad).nombre,
      render: (t) => <Tag tone={prioridad(t.prioridad).tono}>{prioridad(t.prioridad).nombre}</Tag>,
    },
    {
      key: "fecha_limite",
      header: "Vence",
      mobile: "meta",
      sortValue: (t) => t.fecha_limite ?? "9999",
      exportValue: (t) => (t.fecha_limite ? diaDe(t.fecha_limite) : ""),
      render: (t) => t.fecha_limite
        ? <span className={cx("tabular-nums", t.vencida ? "font-semibold text-bad" : "text-ink-2")}>{t.vencida ? "Venció el " : ""}{fechaCorta(t.fecha_limite)}</span>
        : <span className="text-ink-3">Sin fecha</span>,
    },
    {
      key: "estado",
      header: "Estado",
      hideOnMobile: true,
      sortValue: (t) => t.estado,
      exportValue: (t) => nombreEstado(t.estado),
      render: (t) => <span className="text-ink-2">{nombreEstado(t.estado)}</span>,
    },
    {
      key: "responsable",
      header: "Responsable",
      wideOnly: true,
      sortValue: (t) => t.responsable.nombre,
      exportValue: (t) => t.responsable.nombre,
      render: (t) => <span className="text-ink-2">{t.responsable.nombre}</span>,
    },
  ];

  const acciones: RowAction<Tarea>[] = [
    { label: "Completar", icon: <Check size={16} />, hidden: (t) => !estaAbierta(t), onSelect: (t) => mover(t, "COMPLETADA") },
    { label: "Marcar en curso", icon: <CircleDashed size={16} />, hidden: (t) => t.estado !== "PENDIENTE", onSelect: (t) => mover(t, "EN_CURSO") },
    { label: "Reabrir", icon: <RotateCcw size={16} />, hidden: (t) => estaAbierta(t), onSelect: (t) => mover(t, "PENDIENTE") },
    { label: "Reprogramar…", icon: <CalendarClock size={16} />, onSelect: (t) => setCambio({ tipo: "fecha", tareas: [t] }) },
    { label: "Eliminar", icon: <Trash2 size={16} />, tone: "danger", separated: true, onSelect: (t) => setEliminar([t]) },
  ];

  const resumen = lista?.resumen;
  const vacia = !cargando && (lista?.total ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title="Tareas"
        description="Lo que el equipo tiene por hacer, por proceso y fecha límite."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<LayoutTemplate size={16} />} onClick={() => setConPlantilla(true)}>Usar plantilla</Button>
            <Button icon={<Plus size={16} />} onClick={() => setNueva(true)}>Nueva tarea</Button>
          </div>
        }
      />

      <SummaryStrip
        active={vista === "lista" ? grupo : null}
        onSelect={(clave) => { setVista("lista"); setGrupo((clave as Grupo | null) ?? "abiertas"); }}
        items={[
          { key: "abiertas", label: "Abiertas", value: resumen?.abiertas ?? "—" },
          { key: "vencidas", label: "Vencidas", value: resumen?.vencidas ?? "—", tone: resumen?.vencidas ? "danger" : "default" },
          { key: "semana", label: "Vencen en 7 días", value: resumen?.semana ?? "—", tone: resumen?.semana ? "warning" : "default" },
          { key: "completadas", label: "Completadas en 30 días", value: resumen?.completadas ?? "—", tone: "success" },
        ]}
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <SegmentedControl<Vista>
          label="Vista de tareas"
          value={vista}
          onChange={setVista}
          options={[{ value: "lista", label: "Lista" }, { value: "tablero", label: "Tablero" }, { value: "calendario", label: "Calendario" }]}
        />
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por tarea, proceso o cliente" aria-label="Buscar tareas" className={CAMPO_BUSQUEDA} />
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[14px] text-ink-2">
          <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} className="size-4 accent-[var(--navy)]" />
          Solo las mías
        </label>
        <Link href="/gestion-procesos/abogado/tareas/plantillas" className="inline-flex min-h-10 items-center gap-1.5 text-[14px] font-semibold text-navy-ink underline-offset-2 hover:underline">
          <LayoutTemplate aria-hidden="true" size={16} />
          Plantillas
        </Link>
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : vista === "tablero" ? (
          vacia ? <SinTareas onNueva={() => setNueva(true)} /> : <TableroTareas tareas={delTablero} onMover={mover} />
        ) : vista === "calendario" ? (
          <CalendarioMes elementos={delCalendario} mes={mes} onMes={setMes} vacio="Nada vence este día." />
        ) : (
          <DataTable
            caption="Tareas"
            rows={filtradas}
            columns={columnas}
            rowKey={(t) => t.id}
            rowHref={(t) => RUTA_TAREA(t.id)}
            rowActions={acciones}
            rowTone={(t) => (t.vencida ? "danger" : undefined)}
            bulkActions={[
              { label: "Completar", icon: <Check size={16} />, onRun: async (rows) => { await enLote(rows.map((t) => t.id), { estado: "COMPLETADA" }); } },
              { label: "Reprogramar", icon: <CalendarClock size={16} />, onRun: (rows) => setCambio({ tipo: "fecha", tareas: rows }) },
              { label: "Prioridad", icon: <Flag size={16} />, onRun: (rows) => setCambio({ tipo: "prioridad", tareas: rows }) },
              { label: "Eliminar", icon: <Trash2 size={16} />, tone: "danger", onRun: (rows) => setEliminar(rows) },
            ]}
            searchable={false}
            initialSort={{ key: "fecha_limite", direction: "asc" }}
            exportFilename="tareas"
            storageKey="abogado-tareas-v2"
            loading={cargando && !lista}
            emptyTitle={grupo === "abiertas" && !busqueda ? "No hay tareas abiertas" : "Ninguna tarea coincide"}
            emptyDescription={grupo === "abiertas" && !busqueda ? "Crea una tarea o usa una plantilla cuando llegue una actuación." : "Prueba con otra búsqueda o grupo."}
            emptyAction={grupo === "abiertas" && !busqueda ? <Button icon={<Plus size={16} />} onClick={() => setNueva(true)}>Nueva tarea</Button> : undefined}
          />
        )}
        {lista && lista.total > lista.items.length && (
          <p className="mt-3 text-[13px] text-ink-3">Se muestran las primeras {lista.items.length} de {lista.total}. Filtra por grupo o busca para ver las demás.</p>
        )}
      </div>

      <NuevaTareaModal open={nueva} onClose={() => setNueva(false)} onCreada={() => void cargar()} />
      <AplicarPlantillaModal open={conPlantilla} onClose={() => setConPlantilla(false)} onCreadas={() => void cargar()} />
      <CambioLoteModal
        tipo={cambio?.tipo ?? null}
        tareas={cambio?.tareas ?? []}
        onClose={() => setCambio(null)}
        onAplicar={(c: CambioLote) => enLote((cambio?.tareas ?? []).map((t) => t.id), c)}
      />
      <ConfirmDialog
        open={eliminar !== null}
        onClose={() => setEliminar(null)}
        destructive
        title={eliminar?.length === 1 ? "¿Eliminar la tarea?" : `¿Eliminar ${eliminar?.length ?? 0} tareas?`}
        description={eliminar?.length === 1 ? `«${eliminar[0].titulo}» y sus recordatorios se borran. No se puede deshacer.` : "Se borran con sus recordatorios. No se puede deshacer."}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const ids = (eliminar ?? []).map((t) => t.id);
          const fallo = await enLote(ids, { eliminar: true });
          if (fallo) throw new Error(fallo);
          setEliminar(null);
        }}
      />
    </div>
  );
}

function SinTareas({ onNueva }: { onNueva: () => void }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-sheet px-6 py-12 text-center shadow-[0_0_0_1px_var(--line)]">
      <p className="font-display text-[19px] text-ink">No hay tareas</p>
      <p className="mx-auto mt-1 max-w-sm text-[14px] text-ink-3">Crea una tarea o usa una plantilla cuando llegue una actuación.</p>
      <Button className="mt-4" icon={<Plus size={16} />} onClick={onNueva}>Nueva tarea</Button>
    </div>
  );
}
