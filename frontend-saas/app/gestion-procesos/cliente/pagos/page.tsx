"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Download, FileText, MessageSquare, ReceiptText, RefreshCw } from "lucide-react";

import { FilasCargando, TituloCliente } from "@/components/portal-cliente/piezas";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaLargo } from "@/lib/fechas";
import { METODO_PAGO, abrirEstadoDeCuenta, abrirPdfCuenta, abrirRecibo, pesos, type Cuenta, type Pago } from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Estado = Esquemas["EstadoDeCuenta"];

/** Cómo se le dice al cliente en qué va cada cuenta. */
function estadoCliente(c: Cuenta): { nombre: string; tono: TonoTag } {
  if (c.estado === "pagada") return { nombre: "Pagada", tono: "ok" };
  if (c.estado === "anulada") return { nombre: "Anulada", tono: "neutral" };
  if (c.vencida) return { nombre: "Vencida", tono: "bad" };
  if (c.estado === "parcial") return { nombre: "Pagada en parte", tono: "gold" };
  return { nombre: "Por pagar", tono: "navy" };
}

function abierta(c: Cuenta): boolean {
  return c.estado === "pendiente" || c.estado === "parcial";
}

function TarjetaCuenta({ cuenta, resaltada }: { cuenta: Cuenta; resaltada: boolean }) {
  const estado = estadoCliente(cuenta);
  return (
    <li
      id={`cuenta-${cuenta.id}`}
      className={cx("scroll-mt-24 rounded-2xl bg-sheet px-5 py-5 shadow-sheet transition-shadow duration-500 sm:px-7", resaltada && "ring-2 ring-gold")}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[15px] text-ink-3">
            Cuenta de cobro {cuenta.numero}{cuenta.proceso ? ` · ${cuenta.proceso.nombre}` : ""}
          </p>
          <h3 className="font-display text-[22px] leading-snug text-ink [text-wrap:balance]">{cuenta.concepto}</h3>
        </div>
        <Tag tone={estado.tono}>{estado.nombre}</Tag>
      </div>
      <p className="mt-4 text-[15px] text-ink-2">Valor a pagar</p>
      <p className="font-display text-[34px] leading-tight tabular-nums text-ink">{pesos(cuenta.saldo)}</p>
      {cuenta.pagado > 0 && (
        <p className="text-[15px] tabular-nums text-ink-2">Ya abonó {pesos(cuenta.pagado)} de {pesos(cuenta.total + cuenta.ajustes)}.</p>
      )}
      <p className={cx("mt-1 text-[16px]", cuenta.vencida ? "font-semibold text-bad" : "text-ink-2")}>
        {cuenta.vence_el
          ? cuenta.vencida ? `La fecha de pago era el ${diaLargo(cuenta.vence_el)}.` : `Por favor, páguela a más tardar el ${diaLargo(cuenta.vence_el)}.`
          : "Esta cuenta no tiene fecha límite."}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" variant="secondary" icon={<FileText aria-hidden="true" size={18} />} onClick={() => abrirPdfCuenta(cuenta.id)}>
          Ver la cuenta
        </Button>
        <Button size="lg" variant="ghost" icon={<Download aria-hidden="true" size={18} />} onClick={() => abrirPdfCuenta(cuenta.id, true)}>
          Descargar el PDF
        </Button>
      </div>
    </li>
  );
}

function FilaPago({ pago, resaltada }: { pago: Pago; resaltada: boolean }) {
  return (
    <li id={`pago-${pago.id}`} className={cx("scroll-mt-24 px-5 py-4 transition-colors duration-500 sm:px-7", resaltada && "bg-gold-soft")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className={cx("text-[20px] font-semibold tabular-nums", pago.revertido ? "text-ink-3 line-through" : "text-ink")}>{pesos(pago.importe)}</p>
          <p className="text-[15px] text-ink-2">
            {diaLargo(pago.pagado_el)} · {METODO_PAGO[pago.metodo]}
          </p>
          {pago.revertido ? (
            <p className="mt-1 text-[15px] text-ink-3">Este pago se anuló y no cuenta en su saldo. Si tiene dudas, escríbanos.</p>
          ) : (
            pago.aplicaciones.length > 0 && (
              <p className="mt-1 text-[15px] text-ink-3">
                Abonado a {pago.aplicaciones.map((a) => a.numero ?? a.concepto).join(", ")}
                {pago.disponible > 0 ? `; ${pesos(pago.disponible)} quedan a su favor` : ""}.
              </p>
            )
          )}
          {!pago.revertido && pago.aplicaciones.length === 0 && pago.disponible > 0 && (
            <p className="mt-1 text-[15px] text-ink-3">Queda a su favor para su próxima cuenta.</p>
          )}
        </div>
        {pago.revertido ? (
          <Tag tone="neutral">Anulado</Tag>
        ) : (
          <Button variant="secondary" icon={<ReceiptText aria-hidden="true" size={17} />} onClick={() => abrirRecibo(pago.id)} className="w-full sm:w-auto">
            Ver el recibo {pago.numero_recibo}
          </Button>
        )}
      </div>
    </li>
  );
}

export default function PagosClientePage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ancla, setAncla] = useState<string | null>(null);
  const [historial, setHistorial] = useState(false);
  const primeraCarga = useRef(true);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/estado-cuenta");
    if (!data) {
      setError(mensajeDeError(fallo));
      return;
    }
    setEstado(data);
    // Los correos traen el ancla de la cuenta o del recibo: se lleva hasta ella y se resalta un momento.
    const id = window.location.hash.slice(1);
    if (primeraCarga.current && id) {
      const cuenta = data.cuentas.find((c) => `cuenta-${c.id}` === id);
      if (cuenta && !abierta(cuenta)) setHistorial(true);
      if (cuenta || data.pagos.some((p) => `pago-${p.id}` === id)) setAncla(id);
    }
    primeraCarga.current = false;
  }, []);
  useLoadEffect(cargar);

  useEffect(() => {
    if (!ancla) return;
    document.getElementById(ancla)?.scrollIntoView({ block: "start" });
    const temporizador = window.setTimeout(() => setAncla(null), 2400);
    return () => window.clearTimeout(temporizador);
  }, [ancla]);

  const porPagar = (estado?.cuentas ?? []).filter(abierta).sort((a, b) => (a.vence_el ?? "9").localeCompare(b.vence_el ?? "9"));
  const cerradas = (estado?.cuentas ?? []).filter((c) => !abierta(c));
  const t = estado?.totales;

  return (
    <div>
      <TituloCliente sub="Lo que le hemos cobrado, lo que ha pagado y lo que queda pendiente.">Pagos</TituloCliente>

      {error && !estado ? (
        <Sheet className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p role="alert" className="text-bad">{error}</p>
          <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>
            Intentar de nuevo
          </Button>
        </Sheet>
      ) : !estado || !t ? (
        <div aria-busy="true" className="space-y-4">
          <Sheet><FilasCargando filas={1} /></Sheet>
          <Sheet><FilasCargando filas={2} /></Sheet>
        </div>
      ) : estado.cuentas.length === 0 && estado.pagos.length === 0 ? (
        <Sheet className="px-6 py-10 text-center">
          <ReceiptText aria-hidden="true" size={28} strokeWidth={1.5} className="mx-auto text-ink-3" />
          <p className="mt-3 font-semibold text-ink">Aún no tiene cuentas de cobro</p>
          <p className="mx-auto mt-1 max-w-md text-[16px] text-ink-2">Cuando le enviemos una, le llegará a su correo y la verá aquí.</p>
        </Sheet>
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="saldo">
            {t.saldo > 0 ? (
              <Sheet className="px-5 py-6 sm:px-7">
                <h2 id="saldo" className="text-[16px] text-ink-2">Su saldo pendiente</h2>
                <p className="font-display text-[44px] leading-tight tabular-nums text-ink">{pesos(t.saldo)}</p>
                {t.vencido > 0 && (
                  <p className="mt-1 text-[16px] font-semibold text-bad">
                    {t.vencido === t.saldo ? "Ya pasó la fecha de pago." : `De esto, ${pesos(t.vencido)} ya pasaron la fecha de pago.`}
                  </p>
                )}
                {t.a_favor > 0 && <p className="mt-1 text-[16px] text-ink-2">Tiene {pesos(t.a_favor)} a su favor; los abonaremos a sus cuentas.</p>}
                <Button size="lg" variant="ghost" icon={<Download aria-hidden="true" size={18} />} onClick={() => abrirEstadoDeCuenta(estado.cliente.id, true)} className="-ml-3 mt-4">
                  Descargar el estado de cuenta
                </Button>
              </Sheet>
            ) : (
              <div role="status" className="flex flex-col gap-3 rounded-2xl bg-ok-soft px-5 py-4 sm:flex-row sm:items-center">
                <CheckCircle2 aria-hidden="true" size={22} className="shrink-0 text-ok" />
                <div className="flex-1">
                  <h2 id="saldo" className="font-semibold text-ok">Está al día con sus pagos</h2>
                  <p className="text-[16px] text-ink-2">
                    No tiene saldo pendiente{t.a_favor > 0 ? ` y tiene ${pesos(t.a_favor)} a su favor` : ""}.
                  </p>
                </div>
                <Button variant="secondary" icon={<Download aria-hidden="true" size={17} />} onClick={() => abrirEstadoDeCuenta(estado.cliente.id, true)}>
                  Estado de cuenta
                </Button>
              </div>
            )}
          </section>

          {porPagar.length > 0 && (
            <section aria-labelledby="por-pagar">
              <h2 id="por-pagar" className="mb-3 font-display text-[24px] text-ink">Por pagar</h2>
              <ul className="space-y-4">
                {porPagar.map((c) => <TarjetaCuenta key={c.id} cuenta={c} resaltada={ancla === `cuenta-${c.id}`} />)}
              </ul>
              <div className="mt-4 rounded-2xl bg-manila px-5 py-4 sm:px-7">
                <h3 className="font-semibold text-ink">Cómo pagar</h3>
                {estado.datos_pago ? (
                  <p className="mt-1 whitespace-pre-line text-[16px] text-ink [text-wrap:pretty]">{estado.datos_pago}</p>
                ) : (
                  <p className="mt-1 text-[16px] text-ink-2">Los datos para pagar están en el PDF de cada cuenta.</p>
                )}
                <p className="mt-3 text-[16px] text-ink-2">
                  Cuando pague, envíenos el comprobante por{" "}
                  <Link href="/gestion-procesos/cliente/chat" className="inline-flex items-center gap-1 font-semibold text-navy-ink underline underline-offset-2">
                    <MessageSquare aria-hidden="true" size={16} /> Mensajes
                  </Link>
                  . Le enviaremos el recibo a su correo.
                </p>
              </div>
            </section>
          )}

          {estado.pagos.length > 0 && (
            <section aria-labelledby="pagos-recibidos">
              <h2 id="pagos-recibidos" className="mb-3 font-display text-[24px] text-ink">Pagos que recibimos</h2>
              <Sheet>
                <ul className="divide-y divide-line">
                  {estado.pagos.map((p) => <FilaPago key={p.id} pago={p} resaltada={ancla === `pago-${p.id}`} />)}
                </ul>
              </Sheet>
            </section>
          )}

          {cerradas.length > 0 && (
            <section aria-labelledby="cuentas-cerradas">
              <h2 id="cuentas-cerradas" className="font-display text-[24px] text-ink">
                <button
                  type="button"
                  aria-expanded={historial}
                  aria-controls="lista-cerradas"
                  onClick={() => setHistorial((v) => !v)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left"
                >
                  Cuentas pagadas y anuladas
                  <span className="flex items-center gap-1 font-sans text-[15px] text-ink-2">
                    {cerradas.length}
                    <ChevronDown aria-hidden="true" size={18} className={cx("transition-transform", historial && "rotate-180")} />
                  </span>
                </button>
              </h2>
              {historial && (
                <Sheet id="lista-cerradas" className="mt-3">
                  <ul className="divide-y divide-line">
                    {cerradas.map((c) => {
                      const e = estadoCliente(c);
                      return (
                        <li
                          key={c.id}
                          id={`cuenta-${c.id}`}
                          className={cx("flex scroll-mt-24 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors duration-500 sm:px-7", ancla === `cuenta-${c.id}` && "bg-gold-soft")}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-ink">{c.concepto}</span>
                              <Tag tone={e.tono}>{e.nombre}</Tag>
                            </p>
                            <p className="text-[15px] tabular-nums text-ink-3">{c.numero} · {pesos(c.total + c.ajustes)}</p>
                          </div>
                          <Button variant="ghost" icon={<FileText aria-hidden="true" size={17} />} onClick={() => abrirPdfCuenta(c.id)}>
                            Ver la cuenta
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </Sheet>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
