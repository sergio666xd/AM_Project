"use client";

import { useCallback, useState, type InputHTMLAttributes } from "react";

import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { api, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { campoPesos, leerPesos } from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type ClienteCobro = Esquemas["ClienteResumen"];

/** Campo de pesos enteros que se agrupa por miles mientras se escribe. */
export function CampoPesos({ valor, onValor, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  valor: number;
  onValor: (valor: number) => void;
}) {
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] text-ink-3">$</span>
      <input
        {...props}
        inputMode="numeric"
        autoComplete="off"
        value={campoPesos(valor)}
        onChange={(e) => onValor(leerPesos(e.target.value))}
        className={cx(CAMPO, "pl-7 text-right tabular-nums", className)}
      />
    </div>
  );
}

/** Los clientes que el abogado ve, con sus procesos, para los formularios de cobro. */
export function useClientesCobro(activo: boolean) {
  const [clientes, setClientes] = useState<ClienteCobro[] | null>(null);
  const cargar = useCallback(async () => {
    if (!activo || clientes) return;
    const { data } = await api.GET("/api/v2/clientes", { params: { query: { grupo: "todos" } } });
    setClientes([...(data?.items ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
  }, [activo, clientes]);
  useLoadEffect(cargar);
  return clientes;
}
