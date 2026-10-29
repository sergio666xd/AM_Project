"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import type { UsuarioFila } from "@/lib/usuariosAdmin";

export type AccionCuenta = "acceso" | "enlace" | "suspender" | "reactivar" | "cerrar" | "eliminar";

type Cuenta = Pick<UsuarioFila, "id" | "nombre" | "email">;

const TEXTOS: Record<AccionCuenta, { titulo: string; descripcion: (c: Cuenta) => string; confirmar: string; peligro?: boolean }> = {
  acceso: {
    titulo: "¿Reenviar el acceso?",
    descripcion: (c) => `${c.nombre} recibe en ${c.email} una contraseña temporal nueva; la anterior deja de servir.`,
    confirmar: "Reenviar acceso",
  },
  enlace: {
    titulo: "¿Enviar enlace para cambiar la contraseña?",
    descripcion: (c) => `Le llega a ${c.email} un enlace para crear una contraseña nueva. Su contraseña actual sigue sirviendo hasta que la cambie.`,
    confirmar: "Enviar enlace",
  },
  suspender: {
    titulo: "¿Suspender la cuenta?",
    descripcion: (c) => `${c.nombre} no podrá entrar y se cierran sus sesiones abiertas. Su información se conserva y puede reactivarla cuando quiera.`,
    confirmar: "Suspender",
    peligro: true,
  },
  reactivar: {
    titulo: "¿Reactivar la cuenta?",
    descripcion: (c) => `${c.nombre} podrá volver a entrar con su contraseña. Le llegan los avisos de agenda que se perdió.`,
    confirmar: "Reactivar",
  },
  cerrar: {
    titulo: "¿Cerrar sus sesiones?",
    descripcion: (c) => `${c.nombre} tendrá que volver a entrar en todos sus dispositivos. Úselo si perdió un teléfono o un computador.`,
    confirmar: "Cerrar sesiones",
  },
  eliminar: {
    titulo: "¿Eliminar la cuenta?",
    descripcion: (c) => `La cuenta de ${c.nombre} se borra del todo. Solo se permite porque no tiene procesos, tareas, documentos, cobros ni mensajes.`,
    confirmar: "Eliminar cuenta",
    peligro: true,
  },
};

/** Confirma una acción sobre el acceso de una cuenta y la ejecuta. */
export function ConfirmarAccionCuenta({ accion, cuenta, onClose, onHecho }: {
  accion: AccionCuenta | null;
  cuenta: Cuenta | null;
  onClose: () => void;
  onHecho: (accion: AccionCuenta) => void;
}) {
  const { toast } = useToast();
  const texto = accion ? TEXTOS[accion] : null;

  async function ejecutar() {
    if (!accion || !cuenta) return;
    const path = { usuario_id: cuenta.id };
    let fallo: unknown = null;
    let aviso: { title: string; description?: string } = { title: "" };
    if (accion === "acceso" || accion === "enlace") {
      const ruta = accion === "acceso" ? "/api/v2/admin/usuarios/{usuario_id}/acceso" : "/api/v2/admin/usuarios/{usuario_id}/enlace-contrasena";
      const { data, error } = await api.POST(ruta, { params: { path } });
      fallo = error;
      aviso = { title: accion === "acceso" ? "Acceso reenviado" : "Enlace enviado", description: data ? `Le llegó a ${data.destino}.` : undefined };
    } else if (accion === "suspender" || accion === "reactivar") {
      const { error } = await api.POST("/api/v2/admin/usuarios/{usuario_id}/estado", {
        params: { path },
        body: { estado: accion === "suspender" ? "suspendido" : "activo" },
      });
      fallo = error;
      aviso = { title: accion === "suspender" ? "Cuenta suspendida" : "Cuenta reactivada" };
    } else if (accion === "cerrar") {
      const { error } = await api.POST("/api/v2/admin/usuarios/{usuario_id}/cerrar-sesiones", { params: { path } });
      fallo = error;
      aviso = { title: "Sesiones cerradas", description: "Tendrá que volver a entrar." };
    } else {
      const { error } = await api.DELETE("/api/v2/admin/usuarios/{usuario_id}", { params: { path } });
      fallo = error;
      aviso = { title: "Cuenta eliminada" };
    }
    if (fallo) throw new Error(mensajeDeError(fallo));
    toast({ ...aviso, tone: "success" });
    onHecho(accion);
  }

  return (
    <ConfirmDialog
      open={Boolean(accion && cuenta)}
      onClose={onClose}
      title={texto?.titulo ?? ""}
      description={texto && cuenta ? texto.descripcion(cuenta) : ""}
      confirmLabel={texto?.confirmar}
      destructive={texto?.peligro}
      onConfirm={ejecutar}
    />
  );
}
