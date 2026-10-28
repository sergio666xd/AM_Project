"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowRight, Check, FileText, RefreshCw, ScrollText } from "lucide-react";

import { ICONO_FOLIO, fechaDeFolio } from "@/components/expediente/FoliosExpediente";
import { Button } from "@/components/ui/Button";
import { Folio } from "@/components/ui/Folio";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

type FolioNuevo = Esquemas["FolioNuevo"];

const LIMITE = 6;

function enlaceAlFolio(folio: FolioNuevo) {
  return `/gestion-procesos/abogado/procesos/${folio.proceso.id}/folios?folio=${folio.numero}`;
}

/** Lo que llegó de fuera (Rama Judicial, el cliente) y nadie de la firma ha revisado. */
export function FoliosNuevosHoy() {
  const { toast } = useToast();
  const [items, setItems] = useState<FolioNuevo[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/folios/nuevos", { params: { query: { limite: LIMITE } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else {
      setItems(data.items);
      setTotal(data.total);
    }
    setCargando(false);
  }, []);
  useLoadEffect(cargar);

  async function revisar(folio: FolioNuevo) {
    const clave = `${folio.proceso.id}-${folio.numero}`;
    setRevisando(clave);
    const { error: fallo } = await api.POST("/api/v2/procesos/{proceso_id}/folios/revisar", {
      params: { path: { proceso_id: folio.proceso.id } },
      body: { numeros: [folio.numero] },
    });
    setRevisando(null);
    if (fallo) {
      toast({ title: "No se pudo marcar como revisado", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    setItems((actuales) => actuales.filter((f) => f !== folio));
    setTotal((n) => Math.max(0, n - 1));
  }

  return (
    <section aria-labelledby="folios-nuevos-titulo" className="mb-7">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="folios-nuevos-titulo" className="text-[17px] font-semibold text-foreground">
            Folios nuevos
            {total > 0 && <span className="ml-2 align-[2px] text-[13px] font-semibold tabular-nums text-gold-ink">{total}</span>}
          </h2>
          <p className="text-sm text-foreground-muted">Llegaron de la Rama Judicial o de tus clientes</p>
        </div>
        {total > items.length && !cargando && (
          <span className="text-[13px] tabular-nums text-foreground-muted">Mostrando {items.length} de {total}</span>
        )}
      </div>

      {cargando ? (
        <LoadingState label="Cargando folios nuevos" rows={2} />
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-sm text-foreground-secondary">
          <ScrollText aria-hidden="true" className="size-4 shrink-0 text-foreground-muted" />
          No hay folios nuevos por revisar.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {items.map((folio) => {
            const Icono = ICONO_FOLIO[folio.tipo] ?? FileText;
            const clave = `${folio.proceso.id}-${folio.numero}`;
            return (
              <li key={clave} className="flex gap-3.5 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-3">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Icono aria-hidden="true" size={14} strokeWidth={2} />
                      {folio.etiqueta}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{fechaDeFolio(folio)}</span>
                  </p>
                  <p className="mt-0.5 font-semibold text-pretty text-ink">{folio.titulo}</p>
                  <p className="truncate text-sm text-ink-2">{folio.proceso.nombre}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Link
                      href={enlaceAlFolio(folio)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-brand-900 px-3 text-[13px] font-semibold !text-white transition-colors hover:bg-brand-800"
                    >
                      Abrir en el expediente
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                    <Button size="sm" variant="secondary" icon={<Check size={14} />} loading={revisando === clave} onClick={() => void revisar(folio)}>
                      Marcar revisado
                    </Button>
                  </div>
                </div>
                <Folio n={folio.numero} nuevo className="mt-0.5" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
