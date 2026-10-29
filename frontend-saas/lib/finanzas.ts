import type { TonoTag } from "@/components/ui/Tag";
import type { Esquemas } from "@/lib/api-v2/cliente";

export type Cuenta = Esquemas["CuentaBreve"];
export type DetalleCuenta = Esquemas["DetalleCuenta"];
export type Pago = Esquemas["PagoVista"];
export type EstadoCobro = Cuenta["estado"];
export type FiltroCobros = "por_cobrar" | "vencidas" | "pagadas" | "borradores" | "anuladas" | "todas";
export type MetodoPago = Pago["metodo"];

const miles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** "$1.250.000", igual que los PDF y los correos. */
export function pesos(valor: number): string {
  return `${valor < 0 ? "−" : ""}$${miles.format(Math.abs(valor))}`;
}

/** Lo que escribe la persona en un campo de dinero, como entero de pesos. */
export function leerPesos(texto: string): number {
  const digitos = texto.replace(/\D/g, "").slice(0, 12);
  return digitos ? Number(digitos) : 0;
}

/** El valor de un campo de dinero tal como se muestra mientras se escribe. */
export function campoPesos(valor: number): string {
  return valor ? miles.format(valor) : "";
}

export const ESTADO_COBRO: Record<EstadoCobro, { nombre: string; tono: TonoTag }> = {
  borrador: { nombre: "Borrador", tono: "neutral" },
  pendiente: { nombre: "Por pagar", tono: "navy" },
  parcial: { nombre: "Con abonos", tono: "gold" },
  pagada: { nombre: "Pagada", tono: "ok" },
  anulada: { nombre: "Anulada", tono: "neutral" },
};

/** El estado que se muestra: una cuenta por pagar con la fecha pasada se ve vencida. */
export function estadoVisible(c: Pick<Cuenta, "estado" | "vencida">): { nombre: string; tono: TonoTag } {
  if (c.vencida && (c.estado === "pendiente" || c.estado === "parcial")) return { nombre: "Vencida", tono: "bad" };
  return ESTADO_COBRO[c.estado];
}

export const METODO_PAGO: Record<MetodoPago, string> = {
  transferencia: "Transferencia",
  consignacion: "Consignación",
  efectivo: "Efectivo",
  otro: "Otro",
};

export const FILTROS_COBRO: { value: FiltroCobros; label: string }[] = [
  { value: "por_cobrar", label: "Por cobrar" },
  { value: "vencidas", label: "Vencidas" },
  { value: "pagadas", label: "Pagadas" },
  { value: "borradores", label: "Borradores" },
  { value: "anuladas", label: "Anuladas" },
  { value: "todas", label: "Todas" },
];

export function abrirPdfCuenta(id: number, descargar = false) {
  window.open(`/api/v2/cuentas-cobro/${id}/pdf?descargar=${descargar}`, "_blank", "noopener");
}

export function abrirRecibo(id: number, descargar = false) {
  window.open(`/api/v2/pagos/${id}/recibo?descargar=${descargar}`, "_blank", "noopener");
}

export function abrirEstadoDeCuenta(clienteId: number, descargar = false) {
  window.open(`/api/v2/estado-cuenta/pdf?cliente_id=${clienteId}&descargar=${descargar}`, "_blank", "noopener");
}

/**
 * Reparte un pago entre las cuentas abiertas, de la más antigua a la más
 * nueva, sin pasar del saldo de cada una. Lo que sobra queda a favor.
 */
export function repartir(importe: number, cuentas: Pick<Cuenta, "id" | "saldo" | "vence_el" | "emitida_en" | "creada_en">[]): Record<number, number> {
  const orden = [...cuentas].sort((a, b) =>
    (a.vence_el ?? a.emitida_en ?? a.creada_en).localeCompare(b.vence_el ?? b.emitida_en ?? b.creada_en),
  );
  const reparto: Record<number, number> = {};
  let queda = importe;
  for (const c of orden) {
    const abono = Math.min(queda, Math.max(c.saldo, 0));
    reparto[c.id] = abono;
    queda -= abono;
  }
  return reparto;
}
