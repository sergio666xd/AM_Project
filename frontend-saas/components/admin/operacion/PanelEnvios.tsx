"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, RotateCw, Search } from "lucide-react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaConHora, fechaRelativa } from "@/lib/fechas";
import { CANAL_ENVIO, ESTADO_ENVIO, type Envio } from "@/lib/operacion";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { RUTA_USUARIOS } from "@/lib/usuariosAdmin";

type Filtro = "fallidos" | "pendientes" | "enviados" | "todos";
type Canal = "EMAIL" | "WHATSAPP" | "PUSH";

const CAMPO_FILTRO =
  "h-10 min-w-0 rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";
const VACIOS: Record<Filtro, string> = {
  fallidos: "Ningún aviso ha fallado.",
  pendientes: "No hay avisos esperando salir.",
  enviados: "Aún no se ha enviado ningún aviso.",
  todos: "Aún no hay avisos.",
};

const reintentable = (e: Envio) => (e.estado === "fallido" || e.estado === "agotado") && (e.canal === "EMAIL" || e.canal === "WHATSAPP");

function destino(e: Envio) {
  return [e.canal ? CANAL_ENVIO[e.canal] : "Sin canal", e.contacto].filter(Boolean).join(" · ");
}

export function PanelEnvios() {
  const { toast } = useToast();
  const [filtro, setFiltro] = useState<Filtro>("fallidos");
  const [canal, setCanal] = useState<Canal | "">("");
  const [q, setQ] = useState("");
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState<Esquemas["PaginaEnvios"] | null>(null);
  const [items, setItems] = useState<Envio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Esquemas["DetalleEnvio"] | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const ultima = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscar(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const cargar = useCallback(async (cursor?: string) => {
    const esta = ++ultima.current;
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/envios", {
      params: { query: { filtro, canal: canal || undefined, q: buscar || undefined, limite: 30, cursor } },
    });
    if (esta !== ultima.current) return;
    if (fallo || !data) setError(mensajeDeError(fallo));
    else {
      setPagina(data);
      setItems((actuales) => (cursor ? [...actuales, ...data.items] : data.items));
    }
    setCargando(false);
  }, [filtro, canal, buscar]);

  useLoadEffect(cargar);

  const cargarDetalle = useCallback(async () => {
    if (abierto === null) return;
    const { data } = await api.GET("/api/v2/admin/envios/{envio_id}", { params: { path: { envio_id: abierto } } });
    setDetalle(data ?? null);
  }, [abierto]);
  useLoadEffect(cargarDetalle);

  async function reintentar(ids: number[]) {
    setReintentando(true);
    const { data, error: fallo } = await api.POST("/api/v2/admin/envios/reintentar", { body: { ids } });
    setReintentando(false);
    if (fallo || !data) {
      toast({ title: "No se pudo reintentar", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    toast({
      title: data.reintentados === 1 ? "El aviso volvió a la cola" : `${data.reintentados} avisos volvieron a la cola`,
      description: "Salen en unos minutos. Si vuelven a fallar, revise la integración.",
      tone: "success",
    });
    setAbierto(null);
    setDetalle(null);
    void cargar();
  }

  const visiblesReintentables = items.filter(reintentable).map((e) => e.id);
  const conteo = pagina?.conteo;

  return (
    <div>
      <PageHeader
        title="Envíos de avisos"
        description="Lo que la plataforma envió por correo, WhatsApp y el navegador. Cada aviso se intenta hasta tres veces."
        action={filtro === "fallidos" && visiblesReintentables.length > 0 ? (
          <Button icon={<RotateCw size={16} />} loading={reintentando} onClick={() => void reintentar(visiblesReintentables)}>
            Reintentar {visiblesReintentables.length === 1 ? "el aviso" : `los ${visiblesReintentables.length}`}
          </Button>
        ) : undefined}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SegmentedControl<Filtro>
          label="Qué avisos ver"
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "fallidos", label: "Fallidos", count: conteo?.fallidos || undefined },
            { value: "pendientes", label: "En cola", count: conteo?.pendientes || undefined },
            { value: "enviados", label: "Enviados" },
            { value: "todos", label: "Todos" },
          ]}
        />
        <div className="flex gap-2 lg:ml-auto">
          <select value={canal} onChange={(e) => setCanal(e.target.value as Canal | "")} aria-label="Canal" className={CAMPO_FILTRO}>
            <option value="">Todos los canales</option>
            <option value="EMAIL">Correo</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="PUSH">Navegador</option>
          </select>
          <label className="relative min-w-0 flex-1 lg:w-72 lg:flex-none">
            <span className="sr-only">Buscar por destinatario o asunto</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Destinatario o asunto" className={cx(CAMPO, "h-10 pl-9 sm:min-h-10")} />
          </label>
        </div>
      </div>
      {filtro === "fallidos" && conteo?.fallidos ? (
        <p className="mt-3 text-[13px] text-ink-2">
          Los que dicen «No se pudo enviar» agotaron sus tres intentos. Corrija la causa en <Link href="/gestion-procesos/admin/operacion/integraciones" className="font-semibold text-navy underline dark:text-navy-ink">Integraciones</Link> y luego reintente.
        </p>
      ) : null}

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !pagina && cargando ? (
          <LoadingState label="Cargando los avisos" rows={5} />
        ) : (
          <Sheet aria-label="Avisos">
            {items.length ? (
              <ul className="divide-y divide-line">
                {items.map((e) => {
                  const estado = ESTADO_ENVIO[e.estado];
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => setAbierto(e.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-sheet-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-ink">{e.asunto}</span>
                          <span className="block text-[13px] text-ink-2">
                            Para {e.destinatario.nombre} · {destino(e)}
                          </span>
                          {e.error && (e.estado === "agotado" || e.estado === "fallido") && (
                            <span className="mt-0.5 block truncate text-[13px] text-bad">{e.error}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Tag tone={estado.tono}>{estado.nombre}</Tag>
                          <span className="text-[12.5px] tabular-nums text-ink-3">{fechaRelativa(e.enviado_en ?? e.creado_en)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[14px] text-ink-2">{buscar || canal ? "Ningún aviso coincide con la búsqueda." : VACIOS[filtro]}</p>
            )}
            {pagina?.siguiente && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[13px] text-ink-2">
                <span className="tabular-nums">{items.length} de {pagina.total}</span>
                <Button size="sm" variant="ghost" loading={cargando} onClick={() => void cargar(pagina.siguiente ?? undefined)}>Ver más</Button>
              </div>
            )}
          </Sheet>
        )}
      </div>

      <Drawer
        open={abierto !== null}
        onClose={() => { setAbierto(null); setDetalle(null); }}
        title={detalle?.asunto ?? "Aviso"}
        subtitle={detalle ? `${detalle.tipo} · ${destino(detalle)}` : undefined}
        footer={detalle && reintentable(detalle) ? (
          <Button icon={<RotateCw size={16} />} loading={reintentando} onClick={() => void reintentar([detalle.id])}>Reintentar el envío</Button>
        ) : undefined}
      >
        {!detalle ? <LoadingState label="Cargando el aviso" rows={3} /> : (
          <div className="space-y-4">
            <Tag tone={ESTADO_ENVIO[detalle.estado].tono}>{ESTADO_ENVIO[detalle.estado].nombre}</Tag>
            {detalle.error && (
              <div className="rounded-lg bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">
                <p className="font-semibold">Qué respondió el proveedor</p>
                <p className="mt-0.5 break-words">{detalle.error}</p>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-ink-2">Para</dt>
              <dd><Link href={`${RUTA_USUARIOS}/${detalle.destinatario.id}`} className="font-semibold text-ink hover:underline">{detalle.destinatario.nombre}</Link></dd>
              <dt className="text-ink-2">Creado</dt>
              <dd className="tabular-nums text-ink">{fechaConHora(detalle.creado_en)}</dd>
              {detalle.enviado_en && (<><dt className="text-ink-2">Enviado</dt><dd className="tabular-nums text-ink">{fechaConHora(detalle.enviado_en)}</dd></>)}
              <dt className="text-ink-2">Intentos</dt>
              <dd className="tabular-nums text-ink">{detalle.intentos} de 3</dd>
            </dl>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Mensaje</p>
              <p className="whitespace-pre-wrap rounded-lg bg-sheet-2 px-3 py-2.5 text-[14px] text-ink shadow-[inset_0_0_0_1px_var(--line)]">{detalle.cuerpo}</p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
