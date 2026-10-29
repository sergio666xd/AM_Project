"use client";

import { ArrowRight, Wallet } from "lucide-react";

import { EnlaceBoton } from "@/components/ui/Button";
import type { Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaLargo } from "@/lib/fechas";
import { pesos } from "@/lib/finanzas";

/** En el inicio, solo si hay algo por pagar: cuánto y para cuándo, con un botón a Pagos. */
export function AvisoPagos({ estado }: { estado: Esquemas["EstadoDeCuenta"] | null }) {
  if (!estado || estado.totales.saldo <= 0) return null;
  const abiertas = estado.cuentas.filter((c) => c.estado === "pendiente" || c.estado === "parcial");
  const proxima = abiertas.map((c) => c.vence_el).filter((v): v is string => Boolean(v)).sort()[0];
  const vencido = estado.totales.vencido > 0;
  return (
    <section
      aria-labelledby="aviso-pagos"
      className={cx("flex flex-col gap-4 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:px-6", vencido ? "bg-bad-soft" : "bg-sheet shadow-sheet")}
    >
      <Wallet aria-hidden="true" size={24} strokeWidth={1.75} className={cx("hidden shrink-0 sm:block", vencido ? "text-bad" : "text-navy-ink")} />
      <div className="min-w-0 flex-1">
        <h2 id="aviso-pagos" className="font-semibold text-ink">
          {abiertas.length === 1 ? "Tiene una cuenta de cobro por pagar" : `Tiene ${abiertas.length} cuentas de cobro por pagar`}
        </h2>
        <p className={cx("text-[16px]", vencido ? "text-bad" : "text-ink-2")}>
          <span className="tabular-nums">{pesos(estado.totales.saldo)}</span>
          {vencido ? " · ya pasó la fecha de pago" : proxima ? ` · a más tardar el ${diaLargo(proxima)}` : ""}
        </p>
      </div>
      <EnlaceBoton size="lg" variant={vencido ? "primary" : "secondary"} href="/gestion-procesos/cliente/pagos" icon={<ArrowRight aria-hidden="true" size={18} />}>
        Ver mis pagos
      </EnlaceBoton>
    </section>
  );
}
