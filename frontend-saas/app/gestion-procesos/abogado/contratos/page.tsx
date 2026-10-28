"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FilePen, FileText, RefreshCw } from "lucide-react";

import { RoleGate } from "@/components/auth/RoleGate";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { ESTADO_CONTRATO, enlaceContratosDelProceso, type Contrato, type GrupoContratos } from "@/lib/contratos";
import { fechaCorta } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Vista = "contratos" | "sin_contrato";
type SinContrato = Esquemas["ProcesoSinContrato"];

const GRUPOS: { value: GrupoContratos; label: string }[] = [
  { value: "en_curso", label: "En curso" },
  { value: "firmados", label: "Firmados" },
  { value: "cerrados", label: "Terminados o anulados" },
  { value: "todos", label: "Todos" },
];
const VACIOS: Record<GrupoContratos, [string, string]> = {
  en_curso: ["Ningún contrato en curso", "Los borradores y los que esperan firma aparecen aquí."],
  firmados: ["Aún no hay contratos firmados", "Cuando subas el escaneado firmado de un contrato, queda aquí."],
  cerrados: ["Ningún contrato terminado o anulado", "Los contratos que termines o anules quedan aquí con su motivo."],
  todos: ["Aún no hay contratos", "Se redactan desde la pestaña Contratos de cada expediente."],
};
const CAMPO_FILTRO =
  "h-10 min-w-0 rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";

/** La fecha que dice en qué va el contrato. */
function momento(c: Contrato): string {
  if (c.estado === "FIRMADO" && c.firmado_en) return `Firmado el ${fechaCorta(c.firmado_en)}`;
  if ((c.estado === "TERMINADO" || c.estado === "ANULADO") && c.cerrado_en) return `${c.estado === "ANULADO" ? "Anulado" : "Terminado"} el ${fechaCorta(c.cerrado_en)}`;
  if ((c.estado === "LISTO_PARA_FIRMA" || c.estado === "EN_FIRMA") && c.emitido_en) return `Listo desde el ${fechaCorta(c.emitido_en)}`;
  return `Creado el ${fechaCorta(c.creado_en)}`;
}

function abrirFirmado(c: Contrato, descargar = false) {
  window.open(`/api/v2/contratos/${c.id}/firmado?descargar=${descargar}`, "_blank", "noopener");
}

function ContratosPage() {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("contratos");
  const [grupo, setGrupo] = useState<GrupoContratos>("en_curso");
  const [lista, setLista] = useState<Esquemas["ListaContratos"] | null>(null);
  const [sinContrato, setSinContrato] = useState<SinContrato[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [contratos, procesos] = await Promise.all([
      api.GET("/api/v2/contratos", { params: { query: { grupo } } }),
      api.GET("/api/v2/contratos/sin-contrato"),
    ]);
    const fallo = contratos.error ?? procesos.error;
    if (fallo || !contratos.data || !procesos.data) setError(mensajeDeError(fallo));
    else {
      setLista(contratos.data);
      setSinContrato(procesos.data.items);
    }
    setCargando(false);
  }, [grupo]);
  useLoadEffect(cargar);

  const columnas: DataTableColumn<Contrato>[] = [
    {
      key: "proceso",
      header: "Proceso",
      mobile: "title",
      sortValue: (c) => c.proceso.nombre,
      searchValue: (c) => `${c.proceso.nombre} ${c.cliente?.nombre ?? ""}`,
      exportValue: (c) => c.proceso.nombre,
      render: (c) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-pretty text-ink">{c.proceso.nombre}</span>
          {c.expediente_archivado && <span className="text-[12.5px] text-ink-3">Expediente archivado</span>}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      mobile: "subtitle",
      sortValue: (c) => c.cliente?.nombre,
      exportValue: (c) => c.cliente?.nombre,
      render: (c) => <span className="text-ink-2">{c.cliente?.nombre ?? "—"}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      mobile: "badge",
      sortValue: (c) => c.estado,
      exportValue: (c) => ESTADO_CONTRATO[c.estado].nombre,
      render: (c) => <Tag tone={ESTADO_CONTRATO[c.estado].tono}>{ESTADO_CONTRATO[c.estado].nombre}</Tag>,
    },
    {
      key: "momento",
      header: "Cuándo",
      mobile: "meta",
      sortValue: (c) => c.firmado_en ?? c.cerrado_en ?? c.emitido_en ?? c.creado_en,
      exportValue: (c) => momento(c),
      render: (c) => (
        <span className="block min-w-0">
          <span className="tabular-nums text-ink-2">{momento(c)}</span>
          {c.motivo_cierre && <span className="block truncate text-[12.5px] text-ink-3" title={c.motivo_cierre}>{c.motivo_cierre}</span>}
        </span>
      ),
    },
    {
      key: "version",
      header: "Versión",
      wideOnly: true,
      align: "right",
      sortValue: (c) => c.version,
      exportValue: (c) => c.version,
      render: (c) => <span className="tabular-nums text-ink-3">v{c.version}</span>,
    },
  ];

  const acciones: RowAction<Contrato>[] = [
    { label: "Abrir en el expediente", icon: <ExternalLink size={16} />, href: (c) => enlaceContratosDelProceso(c.proceso.id) },
    { label: "Ver el firmado", icon: <FileText size={16} />, hidden: (c) => !c.documento_firmado, onSelect: (c) => abrirFirmado(c) },
    { label: "Descargar el firmado", icon: <Download size={16} />, hidden: (c) => !c.documento_firmado, onSelect: (c) => abrirFirmado(c, true) },
  ];

  const columnasSin: DataTableColumn<SinContrato>[] = [
    {
      key: "proceso",
      header: "Proceso",
      mobile: "title",
      sortValue: (p) => p.nombre,
      searchValue: (p) => `${p.nombre} ${p.clientes.map((c) => c.nombre).join(" ")}`,
      exportValue: (p) => p.nombre,
      render: (p) => <span className="font-semibold text-pretty text-ink">{p.nombre}</span>,
    },
    {
      key: "clientes",
      header: "Cliente",
      mobile: "subtitle",
      sortValue: (p) => p.clientes[0]?.nombre,
      exportValue: (p) => p.clientes.map((c) => c.nombre).join("; "),
      render: (p) => <span className="text-ink-2">{p.clientes.map((c) => c.nombre).join(", ")}</span>,
    },
    {
      key: "antes",
      header: "Antes",
      mobile: "badge",
      sortValue: (p) => p.ultimo_contrato ?? "",
      exportValue: (p) => (p.ultimo_contrato ? ESTADO_CONTRATO[p.ultimo_contrato].nombre : "Nunca tuvo"),
      render: (p) => (p.ultimo_contrato
        ? <Tag tone={ESTADO_CONTRATO[p.ultimo_contrato].tono}>{ESTADO_CONTRATO[p.ultimo_contrato].nombre}</Tag>
        : <span className="text-[13px] text-ink-3">Nunca tuvo</span>),
    },
    {
      key: "responsable",
      header: "Responsable",
      wideOnly: true,
      sortValue: (p) => p.responsable,
      exportValue: (p) => p.responsable,
      render: (p) => <span className="text-ink-2">{p.responsable}</span>,
    },
    {
      key: "creado",
      header: "Abierto",
      mobile: "meta",
      sortValue: (p) => p.creado_en,
      exportValue: (p) => p.creado_en,
      render: (p) => <span className="tabular-nums text-ink-2">{fechaCorta(p.creado_en)}</span>,
    },
  ];

  const resumen = lista?.resumen;
  const activo = vista === "sin_contrato" ? "sin_contrato" : grupo === "firmados" ? "firmados" : null;
  const [tituloVacio, textoVacio] = VACIOS[grupo];

  return (
    <div>
      <PageHeader title="Contratos" description="En qué va cada contrato de servicios y qué procesos aún no tienen uno." />

      <SummaryStrip
        active={activo}
        onSelect={(clave) => {
          if (clave === "sin_contrato") setVista("sin_contrato");
          else {
            setVista("contratos");
            setGrupo(clave === "firmados" ? "firmados" : "en_curso");
          }
        }}
        items={[
          { key: "en_preparacion", label: "En borrador", value: resumen?.en_preparacion ?? "—" },
          { key: "por_firmar", label: "Por firmar", value: resumen?.por_firmar ?? "—", tone: resumen?.por_firmar ? "warning" : "default" },
          { key: "firmados", label: "Firmados", value: resumen?.firmados ?? "—" },
          { key: "sin_contrato", label: "Procesos sin contrato", value: resumen?.sin_contrato ?? "—", tone: resumen?.sin_contrato ? "danger" : "default" },
        ]}
      />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<Vista>
          label="Qué ver"
          value={vista}
          onChange={setVista}
          options={[{ value: "contratos", label: "Contratos" }, { value: "sin_contrato", label: "Sin contrato" }]}
        />
        {vista === "contratos" && (
          <select value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoContratos)} aria-label="Qué contratos mostrar" className={CAMPO_FILTRO}>
            {GRUPOS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        )}
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : vista === "contratos" ? (
          <DataTable
            caption="Contratos"
            rows={lista?.items ?? []}
            columns={columnas}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(enlaceContratosDelProceso(c.proceso.id))}
            rowActions={acciones}
            searchPlaceholder="Buscar por proceso o cliente"
            initialSort={{ key: "momento", direction: "desc" }}
            exportFilename="contratos"
            storageKey="abogado-contratos-v2"
            loading={cargando && !lista}
            emptyTitle={tituloVacio}
            emptyDescription={textoVacio}
          />
        ) : (
          <DataTable
            caption="Procesos sin contrato"
            rows={sinContrato ?? []}
            columns={columnasSin}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(enlaceContratosDelProceso(p.id))}
            rowActions={[{ label: "Redactar el contrato", icon: <FilePen size={16} />, href: (p) => enlaceContratosDelProceso(p.id) }]}
            searchPlaceholder="Buscar por proceso o cliente"
            initialSort={{ key: "creado", direction: "desc" }}
            exportFilename="procesos-sin-contrato"
            storageKey="abogado-sin-contrato"
            loading={cargando && !sinContrato}
            emptyTitle="Todos los procesos tienen contrato"
            emptyDescription="Los procesos activos con cliente y sin un contrato vigente aparecen aquí."
          />
        )}
      </div>
    </div>
  );
}

export default function ContratosRuta() {
  return <RoleGate roles={["ABOGADO_ADMIN"]}><ContratosPage /></RoleGate>;
}
