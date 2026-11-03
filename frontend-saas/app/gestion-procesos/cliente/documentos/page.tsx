"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Eye, RefreshCw } from "lucide-react";

import { FilasCargando, TituloCliente } from "@/components/portal-cliente/piezas";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaCorta } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Documento = Esquemas["DocumentoEnProceso"];
type Filtro = "todos" | Documento["origen"];

const ORIGEN: Record<Documento["origen"], string> = {
  firma: "De la firma",
  cliente: "Enviados por usted",
  contrato: "Contratos firmados",
};
const PREVISUALIZABLE = /\.(pdf|png|jpe?g|webp|gif)$/i;

function tono(estado: string): TonoTag {
  if (estado === "aprobado") return "ok";
  if (estado === "recibido" || estado === "en revisión") return "neutral";
  return "warn";
}

/** Lo que la firma le compartió, lo que usted envió y sus contratos firmados, en todos sus procesos. */
export default function DocumentosClientePage() {
  const [datos, setDatos] = useState<Esquemas["DocumentosCliente"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cliente/documentos");
    if (data) setDatos(data);
    else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  const items = useMemo(() => datos?.items ?? [], [datos]);
  const origenes = useMemo(() => (Object.keys(ORIGEN) as Documento["origen"][]).filter((o) => items.some((d) => d.origen === o)), [items]);
  const visibles = filtro === "todos" ? items : items.filter((d) => d.origen === filtro);
  const conProceso = new Set(items.map((d) => d.proceso.id)).size > 1;

  return (
    <div>
      <TituloCliente sub="Lo que la firma le compartió, lo que usted envió y sus contratos firmados.">Documentos</TituloCliente>

      {error && !datos ? (
        <Sheet className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p role="alert" className="text-bad">{error}</p>
          <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>
            Intentar de nuevo
          </Button>
        </Sheet>
      ) : !datos ? (
        <Sheet aria-busy="true"><FilasCargando filas={3} /></Sheet>
      ) : items.length === 0 ? (
        <Sheet className="px-6 py-12 text-center">
          <p className="font-display text-[22px] text-ink">Aún no hay documentos</p>
          <p className="mx-auto mt-2 max-w-md text-pretty text-ink-2">
            Cuando la firma le comparta un documento o usted envíe uno que le pidamos, quedará aquí para verlo o descargarlo.
          </p>
        </Sheet>
      ) : (
        <>
          {origenes.length > 1 && (
            <div className="mb-4 overflow-x-auto">
              <SegmentedControl<Filtro>
                label="Qué documentos mostrar"
                value={filtro}
                onChange={setFiltro}
                options={[{ value: "todos", label: "Todos" }, ...origenes.map((o) => ({ value: o, label: ORIGEN[o] }))]}
              />
            </div>
          )}
          <Sheet className="overflow-hidden">
            <ul className="divide-y divide-line">
              {visibles.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-7">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[17px] font-semibold text-ink">{d.nombre}</p>
                    <p className="mt-0.5 text-[15px] text-ink-2">
                      {[ORIGEN[d.origen], conProceso ? d.proceso.nombre : null, fechaCorta(d.fecha)].filter(Boolean).join(" · ")}
                    </p>
                    {d.estado && (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
                        <Tag tone={tono(d.estado)}>{d.estado.charAt(0).toUpperCase() + d.estado.slice(1)}</Tag>
                        {d.nota && <span className="text-pretty">{d.nota}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {PREVISUALIZABLE.test(d.nombre) && (
                      <a
                        href={`${d.url}?descargar=false`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[15px] font-semibold text-navy-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-manila"
                      >
                        <Eye aria-hidden size={17} /> Ver
                      </a>
                    )}
                    <a
                      href={d.url}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[15px] font-semibold text-navy-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-manila"
                      aria-label={`Descargar ${d.nombre}`}
                    >
                      <Download aria-hidden size={17} /> Descargar
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </Sheet>
        </>
      )}
    </div>
  );
}
