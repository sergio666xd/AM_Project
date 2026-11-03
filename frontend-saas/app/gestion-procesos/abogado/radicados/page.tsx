"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus, RefreshCw, ScrollText } from "lucide-react";

import { AgregarRadicadoModal } from "@/components/radicados/AgregarRadicadoModal";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Radicado } from "@/components/ui/Radicado";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { diaCorto } from "@/lib/fechas";
import { RUTA_RADICADOS, TONO_CONSULTA, textoNovedades } from "@/lib/radicados";
import { useAccionDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Fila = Esquemas["RadicadoFila"];
type Filtro = "todos" | "novedades" | "problemas" | "sin_consultar";
const RUTA_PROCESOS = "/gestion-procesos/abogado/procesos";

export default function RadicadosPage() {
  const { toast } = useToast();
  const [lista, setLista] = useState<Esquemas["ListaRadicados"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [agregar, setAgregar] = useState(false);

  useAccionDeUrl("nuevo", useCallback(() => setAgregar(true), []));

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await api.GET("/api/v2/radicados");
    if (data) {
      setLista(data);
      setError(null);
    } else {
      setError(mensajeDeError(fallo));
    }
  }, []);
  useLoadEffect(cargar);

  const filas = lista?.items ?? [];
  const visibles = filas.filter((f) =>
    filtro === "todos"
    || (filtro === "novedades" && f.novedades > 0)
    || (filtro === "problemas" && (f.consulta.estado === "error" || f.consulta.estado === "no_encontrado"))
    || (filtro === "sin_consultar" && f.consulta.estado === "sin_consultar"));
  const resumen = lista?.resumen;

  const columnas: DataTableColumn<Fila>[] = [
    {
      key: "numero",
      header: "Radicado",
      mobile: "title",
      sortValue: (f) => f.numero,
      exportValue: (f) => f.numero,
      searchValue: (f) => [f.numero, f.despacho, f.demandante, f.demandado, f.ultima_actuacion?.texto, ...f.procesos.map((p) => p.nombre)].filter(Boolean).join(" "),
      render: (f) => (
        <span className="block min-w-0">
          <Radicado numero={f.numero} copiable={false} className="text-[13px] font-medium text-ink" />
          {f.despacho && <span className="mt-0.5 block max-w-64 truncate text-[12.5px] text-ink-3">{f.despacho}</span>}
        </span>
      ),
    },
    {
      key: "proceso",
      header: "Proceso",
      mobile: "subtitle",
      sortValue: (f) => f.procesos[0]?.nombre ?? "",
      exportValue: (f) => f.procesos.map((p) => p.nombre).join(", "),
      render: (f) => f.procesos.length ? (
        <span className="block max-w-60">
          <span className="line-clamp-2">{f.procesos.map((p) => p.nombre).join(", ")}</span>
          {f.procesos.every((p) => p.archivado) && <span className="block text-[12.5px] text-ink-3">Archivado</span>}
        </span>
      ) : <span className="text-ink-3">Sin proceso</span>,
    },
    {
      key: "partes",
      header: "Partes",
      mobile: "hidden",
      wideOnly: true,
      sortValue: (f) => f.demandante ?? "",
      exportValue: (f) => [f.demandante, f.demandado].filter(Boolean).join(" contra "),
      render: (f) => (f.demandante || f.demandado)
        ? <span className="line-clamp-2 block max-w-56">{[f.demandante, f.demandado].filter(Boolean).join(" contra ")}</span>
        : <span className="text-ink-3">—</span>,
    },
    {
      key: "actuacion",
      header: "Última actuación",
      mobile: "meta",
      mobileLabel: "Última actuación",
      sortValue: (f) => f.ultima_actuacion?.fecha ?? "",
      exportValue: (f) => [f.ultima_actuacion?.fecha, f.ultima_actuacion?.texto].filter(Boolean).join(" · "),
      render: (f) => f.ultima_actuacion ? (
        <span className="block max-w-72">
          <span className="line-clamp-2 text-ink">{f.ultima_actuacion.texto}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-3">
            {f.ultima_actuacion.fecha ? diaCorto(f.ultima_actuacion.fecha) : "Sin fecha"}
            {f.novedades > 0 && <Tag tone="gold" className="h-5">{textoNovedades(f.novedades)}</Tag>}
          </span>
        </span>
      ) : <span className="text-ink-3">Sin actuaciones</span>,
    },
    {
      key: "consulta",
      header: "Consulta",
      mobile: "badge",
      sortValue: (f) => f.consulta.etiqueta,
      exportValue: (f) => f.consulta.etiqueta,
      render: (f) => f.consulta.estado === "consultado"
        ? <span className="whitespace-nowrap text-[13px] text-ink-2">Al día</span>
        : <Tag tone={TONO_CONSULTA[f.consulta.estado]}>{f.consulta.etiqueta}</Tag>,
    },
  ];

  const acciones: RowAction<Fila>[] = [
    { label: "Ver las actuaciones", icon: <ScrollText size={16} />, href: (f) => `${RUTA_RADICADOS}/${f.id}` },
    { label: "Abrir el proceso", icon: <FolderOpen size={16} />, hidden: (f) => f.procesos.length === 0, href: (f) => `${RUTA_PROCESOS}/${f.procesos[0]?.id}/relaciones` },
  ];

  const vacio = filas.length === 0
    ? ["La firma aún no sigue radicados", "Agregue el número de 23 dígitos a un proceso y lo consultamos en la Rama Judicial todos los días."]
    : ["Ningún radicado coincide", "Toque el filtro otra vez para ver todos."];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Radicados"
        description="Lo que la firma sigue en la Rama Judicial: la última actuación de cada radicado y cómo terminó su consulta."
        action={<Button icon={<Plus size={16} />} onClick={() => setAgregar(true)}>Agregar radicado</Button>}
      />

      <SummaryStrip
        active={filtro}
        onSelect={(clave) => setFiltro(!clave || clave === filtro ? "todos" : (clave as Filtro))}
        items={[
          { key: "todos", label: "Radicados", value: resumen ? resumen.total : "—" },
          { key: "novedades", label: "Con actuaciones nuevas", value: resumen ? resumen.con_novedades : "—", tone: resumen?.con_novedades ? "warning" : "default" },
          { key: "problemas", label: "Con problemas de consulta", value: resumen ? resumen.con_problemas : "—", tone: resumen?.con_problemas ? "danger" : "default" },
          { key: "sin_consultar", label: "Sin consultar", value: resumen ? resumen.sin_consultar : "—" },
        ]}
      />

      <div className="mt-5">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : (
          <DataTable
            caption="Radicados de la firma"
            rows={visibles}
            columns={columnas}
            rowKey={(f) => f.id}
            rowHref={(f) => `${RUTA_RADICADOS}/${f.id}`}
            rowActions={acciones}
            rowTone={(f) => (f.consulta.estado === "error" || f.consulta.estado === "no_encontrado" ? "danger" : undefined)}
            searchPlaceholder="Buscar por número, proceso, partes o actuación"
            initialSort={{ key: "actuacion", direction: "desc" }}
            exportFilename="radicados"
            storageKey="abogado-radicados-v2"
            loading={!lista}
            onRefresh={() => void cargar()}
            emptyTitle={vacio[0]}
            emptyDescription={vacio[1]}
            emptyAction={filas.length === 0 ? <Button icon={<Plus size={16} />} onClick={() => setAgregar(true)}>Agregar radicado</Button> : undefined}
          />
        )}
      </div>

      {filas.some((f) => f.procesos.length === 0) && (
        <p className="mt-3 text-[13px] text-ink-3">
          Los radicados sin proceso vienen de la cuenta anterior. Para que el cliente los vea, agréguelos a su proceso desde{" "}
          <Link href={RUTA_PROCESOS} className="text-navy-ink underline underline-offset-2">Procesos</Link>.
        </p>
      )}

      {agregar && (
        <AgregarRadicadoModal
          onClose={() => setAgregar(false)}
          onListo={(_, aviso) => { toast({ title: "Radicado agregado", description: aviso, tone: "success" }); void cargar(); }}
        />
      )}
    </div>
  );
}
