"use client";

import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Alert } from "./Alert";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  function close() {
    setFailed(null);
    onClose();
  }
  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      close();
    } catch (error) {
      // Quien llama puede lanzar un Error con el mensaje para la persona.
      setFailed(error instanceof Error && error.message ? error.message : "No se pudo completar la acción. Inténtelo de nuevo.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal open={open} onClose={close} title={title} description={description} size="sm">
      {failed && <Alert kind="error" className="mb-4">{failed}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={close} disabled={pending}>{cancelLabel}</Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={() => void confirm()} disabled={pending}>{pending ? "Procesando…" : confirmLabel}</Button>
      </div>
    </Modal>
  );
}
