import type { TonoTag } from "@/components/ui/Tag";
import type { Esquemas } from "@/lib/api-v2/cliente";

export type UsuarioFila = Esquemas["UsuarioFila"];
export type FichaUsuario = Esquemas["FichaUsuario"];
export type GrupoUsuarios = "equipo" | "clientes" | "administradores";

export const RUTA_USUARIOS = "/gestion-procesos/admin/usuarios";

export const ROL: Record<UsuarioFila["rol"], string> = {
  ADMIN: "Administración",
  ABOGADO_ADMIN: "Abogado de la firma",
  ABOGADO: "Abogado asociado",
  CLIENTE: "Cliente",
};

/** El estado que importa al administrar: si la persona entra, si aún no ha entrado o si está suspendida. */
export const ACCESO_CUENTA: Record<UsuarioFila["acceso"], { nombre: string; tono: TonoTag }> = {
  activo: { nombre: "Activa", tono: "ok" },
  sin_ingreso: { nombre: "No ha entrado", tono: "warn" },
  suspendido: { nombre: "Suspendida", tono: "bad" },
};

export const PAPEL: Record<Esquemas["ProcesoDelUsuario"]["papel"], string> = {
  responsable: "Responsable",
  colaborador: "Colabora",
  cliente: "Cliente",
};

/** Estado visible: las cuentas pendientes o rechazadas vienen del registro del portal anterior. */
export function estadoCuenta(u: Pick<UsuarioFila, "estado" | "acceso">): { nombre: string; tono: TonoTag } {
  if (u.estado === "pendiente") return { nombre: "Por aprobar", tono: "gold" };
  if (u.estado === "rechazado") return { nombre: "Rechazada", tono: "neutral" };
  return ACCESO_CUENTA[u.acceso];
}

export function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}
