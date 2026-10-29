import type { Esquemas } from "@/lib/api-v2/cliente";

export type AreaActividad = Esquemas["RegistroActividad"]["area"];
export type Registro = Esquemas["RegistroActividad"];

export const AREAS: Record<AreaActividad, string> = {
  cuentas: "Cuentas",
  procesos: "Procesos",
  tareas: "Tareas y agenda",
  documentos: "Documentos y contratos",
  cobros: "Cobros",
  mensajes: "Mensajes y avisos",
  configuracion: "Configuración",
  otros: "Otros",
};

export const TIPO_CHAT: Record<Esquemas["ChatParaLimpiar"]["tipo"], string> = {
  cliente: "Con el cliente",
  equipo_proceso: "Entre abogados del proceso",
  colaboradores: "Equipo del proceso",
  equipo: "Entre abogados",
};

/** 1.2 MB, 830 KB, 12 bytes. */
export function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const unidades = ["KB", "MB", "GB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toLocaleString("es-CO", { maximumFractionDigits: valor < 10 ? 1 : 0 })} ${unidades[i]}`;
}
