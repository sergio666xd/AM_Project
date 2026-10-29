"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import type { Cliente } from "@/lib/clientes";

/** Confirmar y reenviar el acceso al portal a un cliente que aún no ha entrado. */
export function ReenviarAccesoDialog({ cliente, onClose, onEnviado }: {
  cliente: Pick<Cliente, "id" | "nombre"> | null;
  onClose: () => void;
  onEnviado?: () => void;
}) {
  const { toast } = useToast();
  return (
    <ConfirmDialog
      open={cliente !== null}
      onClose={onClose}
      title="¿Reenviar el acceso?"
      description={cliente ? `${cliente.nombre} recibe una contraseña temporal nueva; la anterior deja de servir.` : ""}
      confirmLabel="Reenviar acceso"
      onConfirm={async () => {
        if (!cliente) return;
        const { data, error } = await api.POST("/api/v2/clientes/{cliente_id}/acceso", { params: { path: { cliente_id: cliente.id } } });
        if (error || !data) throw new Error(mensajeDeError(error));
        toast({ title: "Acceso reenviado", description: `Le llegó a ${data.destino}.`, tone: "success" });
        onClose();
        onEnviado?.();
      }}
    />
  );
}
