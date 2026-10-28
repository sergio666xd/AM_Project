"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Image as ImageIcon, RefreshCw, Search, Send } from "lucide-react";

import { ListaSolicitudes } from "@/components/documentos/ListaSolicitudes";
import { SolicitarDocumentosModal } from "@/components/documentos/SolicitarDocumentosModal";
import { VisorDocumento } from "@/components/documentos/VisorDocumento";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { descargarArchivo, estadoDocumento, porRevisar, tipoDeArchivo, type Archivo, type Solicitud } from "@/lib/documentos";
import { fechaRelativa } from "@/lib/fechas";
import { useAccionDeUrl, useAnclaDeUrl, useValorDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Vista = "archivos" | "solicitudes";
type GrupoArchivos = "por_revisar" | "por_corregir" | "aprobados" | "todos";
type GrupoSolicitudes = "abiertas" | "vencidas" | "completas" | "todas";

const GRUPOS_ARCHIVOS: { value: GrupoArchivos; label: string }[] = [
  { value: "por_revisar", label: "Por revisar" },
  { value: "por_corregir", label: "Devueltos al cliente" },
  { value: "aprobados", label: "Aprobados" },
  { value: "todos", label: "Todos los archivos" },
];
const GRUPOS_SOLICITUDES: { value: GrupoSolicitudes; label: string }[] = [
  { value: "abiertas", label: "Abiertas" },
  { value: "vencidas", label: "Vencidas" },
  { value: "completas", label: "Completas" },
  { value: "todas", label: "Todas" },
];
const VACIOS: Record<GrupoArchivos | GrupoSolicitudes, [string, string]> = {
  por_revisar: ["Nada por revisar", "Cuando un cliente entregue un documento, aparece aquí para que lo apruebes o lo devuelvas."],
  por_corregir: ["Nada devuelto", "Los documentos que devuelvas para corregir esperan aquí la nueva versión del cliente."],
  aprobados: ["Aún no hay documentos aprobados", "Lo que apruebes queda aquí, con sus versiones anteriores."],
  todos: ["No hay documentos", "Pide documentos a un cliente para empezar."],
  abiertas: ["No hay solicitudes abiertas", "Pide documentos a un cliente; le avisamos y le recordamos antes de la fecha límite."],
  vencidas: ["Ninguna solicitud vencida", "Todas las solicitudes con fecha están al día."],
  completas: ["Ninguna solicitud completa", "Cuando apruebes todo lo pedido en una solicitud, aparece aquí."],
  todas: ["No hay solicitudes", "Pide documentos a un cliente para empezar."],
};
const CAMPO_FILTRO =
  "h-10 rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export default function DocumentosPage() {
  const { toast } = useToast();
  const [vista, setVista] = useState<Vista>("archivos");
  const [grupoArchivos, setGrupoArchivos] = useState<GrupoArchivos>("por_revisar");
  const [grupoSolicitudes, setGrupoSolicitudes] = useState<GrupoSolicitudes>("abiertas");
  const [procesoId, setProcesoId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [archivos, setArchivos] = useState<Esquemas["ListaArchivos"] | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [procesos, setProcesos] = useState<{ id: number; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  useAccionDeUrl("nuevo", useCallback(() => setPidiendo(true), []));
  useValorDeUrl("documento", useCallback((valor: string) => { if (Number(valor) > 0) setViendo(Number(valor)); }, []));
  useValorDeUrl("proceso", useCallback((valor: string) => { if (Number(valor) > 0) setProcesoId(Number(valor)); }, []));

  // Enlaces antiguos del expediente: #solicitud-12 y #documento-34.
  useAnclaDeUrl(useCallback((ancla: string) => {
    const [tipo, numero] = ancla.split("-");
    if (!Number(numero)) return;
    if (tipo === "documento") setViendo(Number(numero));
    if (tipo === "solicitud") {
      setVista("solicitudes");
      setGrupoSolicitudes("todas");
    }
  }, []));

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const filtro = procesoId ?? undefined;
    const [respuestaArchivos, respuestaSolicitudes] = await Promise.all([
      api.GET("/api/v2/documentos", { params: { query: { grupo: grupoArchivos, proceso_id: filtro } } }),
      api.GET("/api/v2/documentos/solicitudes", { params: { query: { grupo: grupoSolicitudes, proceso_id: filtro } } }),
    ]);
    const fallo = respuestaArchivos.error ?? respuestaSolicitudes.error;
    if (fallo || !respuestaArchivos.data || !respuestaSolicitudes.data) setError(mensajeDeError(fallo));
    else {
      setArchivos(respuestaArchivos.data);
      setSolicitudes(respuestaSolicitudes.data.items);
    }
    setCargando(false);
  }, [grupoArchivos, grupoSolicitudes, procesoId]);
  useLoadEffect(cargar);

  const cargarProcesos = useCallback(async () => {
    const { data } = await api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } });
    setProcesos(data?.items.map((p) => ({ id: p.id, nombre: p.nombre })) ?? []);
  }, []);
  useLoadEffect(cargarProcesos);

  // Al llegar con #solicitud-12, la tarjeta se trae a la vista cuando ya está dibujada.
  useEffect(() => {
    if (vista !== "solicitudes" || !solicitudes) return;
    const destino = window.location.hash.startsWith("#solicitud-") ? document.querySelector(window.location.hash) : null;
    destino?.scrollIntoView({ block: "start" });
  }, [vista, solicitudes]);

  const q = normalizar(busqueda.trim());
  const archivosFiltrados = useMemo(
    () => (archivos?.items ?? []).filter((a) => !q || normalizar([a.nombre, a.nombre_archivo, a.cliente?.nombre, a.proceso.nombre].filter(Boolean).join(" ")).includes(q)),
    [archivos, q],
  );
  const solicitudesFiltradas = useMemo(
    () => (solicitudes ?? []).filter((s) => !q || normalizar([s.titulo, s.cliente.nombre, s.proceso.nombre, ...s.pedidos.map((p) => p.nombre)].join(" ")).includes(q)),
    [solicitudes, q],
  );

  async function descargar(archivo: Archivo) {
    try {
      await descargarArchivo(archivo);
    } catch (causa) {
      toast({ title: "No se pudo descargar", description: causa instanceof Error ? causa.message : undefined, tone: "error" });
    }
  }

  const columnas: DataTableColumn<Archivo>[] = [
    {
      key: "nombre",
      header: "Documento",
      mobile: "title",
      sortValue: (a) => a.nombre,
      exportValue: (a) => a.nombre,
      render: (a) => {
        const Icono = a.tipo_archivo.startsWith("image/") ? ImageIcon : FileText;
        return (
          <div className="flex min-w-0 items-start gap-2.5">
            <Icono aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <div className="min-w-0">
              <span className="font-semibold text-pretty text-ink">{a.nombre}</span>
              {a.versiones.length > 1 && <span className="ml-2 text-[12.5px] tabular-nums text-ink-3">versión {a.versiones[0].numero}</span>}
              <span className="block truncate text-[12.5px] text-ink-3">{a.nombre_archivo}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "estado",
      header: "Estado",
      mobile: "badge",
      sortValue: (a) => a.estado_revision,
      exportValue: (a) => (a.entregado_por_cliente ? estadoDocumento(a.estado_revision).nombre : "De la firma"),
      render: (a) => (a.entregado_por_cliente
        ? <Tag tone={estadoDocumento(a.estado_revision).tono}>{estadoDocumento(a.estado_revision).nombre}</Tag>
        : <span className="text-[13px] text-ink-3">De la firma</span>),
    },
    {
      key: "proceso",
      header: "Proceso",
      mobile: "subtitle",
      sortValue: (a) => a.proceso.nombre,
      exportValue: (a) => a.proceso.nombre,
      render: (a) => (
        <div className="min-w-0">
          <span className="text-ink-2">{a.proceso.nombre}</span>
          {a.cliente && <span className="block text-[12.5px] text-ink-3">{a.cliente.nombre}</span>}
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      wideOnly: true,
      sortValue: (a) => tipoDeArchivo(a.tipo_archivo),
      exportValue: (a) => tipoDeArchivo(a.tipo_archivo),
      render: (a) => <span className="text-ink-2">{tipoDeArchivo(a.tipo_archivo)}</span>,
    },
    {
      key: "recibido",
      header: "Recibido",
      mobile: "meta",
      sortValue: (a) => a.recibido_en,
      exportValue: (a) => a.recibido_en,
      render: (a) => <span className="tabular-nums text-ink-2">{fechaRelativa(a.recibido_en)}</span>,
    },
  ];

  const acciones: RowAction<Archivo>[] = [
    { label: "Ver y revisar", icon: <Eye size={16} />, hidden: (a) => !a.entregado_por_cliente || !porRevisar(a.estado_revision), onSelect: (a) => setViendo(a.id) },
    { label: "Ver", icon: <Eye size={16} />, hidden: (a) => a.entregado_por_cliente && porRevisar(a.estado_revision), onSelect: (a) => setViendo(a.id) },
    { label: "Descargar", icon: <Download size={16} />, onSelect: (a) => void descargar(a) },
  ];

  const resumen = archivos?.resumen;
  const activo = vista === "archivos"
    ? (grupoArchivos === "por_revisar" || grupoArchivos === "por_corregir" ? grupoArchivos : null)
    : (grupoSolicitudes === "abiertas" ? "solicitudes_abiertas" : grupoSolicitudes === "vencidas" ? "solicitudes_vencidas" : null);
  const filtrando = Boolean(q) || procesoId !== null;
  const [tituloVacio, textoVacio] = filtrando
    ? ["Nada coincide", "Prueba con otra búsqueda o quita el filtro de proceso."]
    : VACIOS[vista === "archivos" ? grupoArchivos : grupoSolicitudes];

  return (
    <div>
      <PageHeader
        title="Documentos"
        description="Lo que entregan tus clientes, lo que les falta y sus versiones."
        action={<Button icon={<Send size={16} />} onClick={() => setPidiendo(true)}>Pedir documentos</Button>}
      />

      <SummaryStrip
        active={activo}
        onSelect={(clave) => {
          if (clave === "por_revisar" || clave === "por_corregir") {
            setVista("archivos");
            setGrupoArchivos(clave);
          } else if (clave === "solicitudes_abiertas" || clave === "solicitudes_vencidas") {
            setVista("solicitudes");
            setGrupoSolicitudes(clave === "solicitudes_abiertas" ? "abiertas" : "vencidas");
          } else if (vista === "archivos") setGrupoArchivos("por_revisar");
          else setGrupoSolicitudes("abiertas");
        }}
        items={[
          { key: "por_revisar", label: "Por revisar", value: resumen?.por_revisar ?? "—", tone: resumen?.por_revisar ? "warning" : "default" },
          { key: "por_corregir", label: "Devueltos al cliente", value: resumen?.por_corregir ?? "—" },
          { key: "solicitudes_abiertas", label: "Solicitudes abiertas", value: resumen?.solicitudes_abiertas ?? "—" },
          { key: "solicitudes_vencidas", label: "Solicitudes vencidas", value: resumen?.solicitudes_vencidas ?? "—", tone: resumen?.solicitudes_vencidas ? "danger" : "default" },
        ]}
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SegmentedControl<Vista>
          label="Qué ver"
          value={vista}
          onChange={setVista}
          options={[{ value: "archivos", label: "Archivos" }, { value: "solicitudes", label: "Solicitudes" }]}
        />
        <div className="grid grid-cols-2 gap-3 lg:flex lg:shrink-0">
          {vista === "archivos" ? (
            <select value={grupoArchivos} onChange={(e) => setGrupoArchivos(e.target.value as GrupoArchivos)} aria-label="Qué archivos mostrar" className={cx(CAMPO_FILTRO, "min-w-0")}>
              {GRUPOS_ARCHIVOS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          ) : (
            <select value={grupoSolicitudes} onChange={(e) => setGrupoSolicitudes(e.target.value as GrupoSolicitudes)} aria-label="Qué solicitudes mostrar" className={cx(CAMPO_FILTRO, "min-w-0")}>
              {GRUPOS_SOLICITUDES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          )}
          <select
            value={procesoId ?? ""}
            onChange={(e) => setProcesoId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Filtrar por proceso"
            className={cx(CAMPO_FILTRO, "min-w-0 lg:w-52")}
          >
            <option value="">Todos los procesos</option>
            {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por documento, cliente o proceso"
            aria-label="Buscar documentos"
            className={cx(CAMPO_FILTRO, "w-full pl-9 placeholder:text-ink-3")}
          />
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : vista === "archivos" ? (
          <DataTable
            caption="Documentos"
            rows={archivosFiltrados}
            columns={columnas}
            rowKey={(a) => a.id}
            onRowClick={(a) => setViendo(a.id)}
            rowActions={acciones}
            searchable={false}
            initialSort={{ key: "recibido", direction: "desc" }}
            exportFilename="documentos"
            storageKey="abogado-documentos-v2"
            loading={cargando && !archivos}
            emptyTitle={tituloVacio}
            emptyDescription={textoVacio}
            emptyAction={!filtrando && grupoArchivos === "todos" ? <Button icon={<Send size={16} />} onClick={() => setPidiendo(true)}>Pedir documentos</Button> : undefined}
          />
        ) : cargando && !solicitudes ? (
          <div className="grid gap-3 lg:grid-cols-2" aria-label="Cargando solicitudes">
            {[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-[var(--radius-lg)] bg-manila" />)}
          </div>
        ) : solicitudesFiltradas.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] bg-sheet px-6 py-12 text-center shadow-[0_0_0_1px_var(--line)]">
            <p className="font-display text-[19px] text-ink">{tituloVacio}</p>
            <p className="mx-auto mt-1 max-w-sm text-[14px] text-pretty text-ink-3">{textoVacio}</p>
            {!filtrando && grupoSolicitudes === "abiertas" && (
              <Button className="mt-4" icon={<Send size={16} />} onClick={() => setPidiendo(true)}>Pedir documentos</Button>
            )}
          </div>
        ) : (
          <ListaSolicitudes solicitudes={solicitudesFiltradas} onVer={setViendo} onCambio={() => void cargar()} />
        )}
        {vista === "archivos" && archivos && archivos.total > archivos.items.length && (
          <p className="mt-3 text-[13px] text-ink-3">Se muestran los primeros {archivos.items.length} de {archivos.total}. Filtra por proceso para ver los demás.</p>
        )}
      </div>

      <VisorDocumento documentoId={viendo} onClose={() => setViendo(null)} onRevisado={() => void cargar()} />
      <SolicitarDocumentosModal
        key={procesoId ?? "todos"}
        open={pidiendo}
        onClose={() => setPidiendo(false)}
        procesoInicial={procesoId ?? undefined}
        onCreada={() => { setVista("solicitudes"); setGrupoSolicitudes("abiertas"); void cargar(); }}
      />
    </div>
  );
}
