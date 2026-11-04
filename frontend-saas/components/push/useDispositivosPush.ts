"use client";

import { useCallback, useState } from "react";

import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { activarNotificaciones, estadoDelNavegador, type EstadoNavegador } from "@/lib/push";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type DispositivoPush = Esquemas["Dispositivo"];

/** Los dispositivos con avisos del navegador de la cuenta, y activar este. */
export function useDispositivosPush() {
  const [dispositivos, setDispositivos] = useState<DispositivoPush[] | null>(null);
  const [configurado, setConfigurado] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<number | null>(null);
  const [activando, setActivando] = useState(false);
  const [navegador, setNavegador] = useState<EstadoNavegador>("default");

  const cargar = useCallback(async () => {
    setNavegador(estadoDelNavegador());
    const { data, error: fallo } = await api.GET("/api/v2/push/dispositivos");
    if (data) {
      setDispositivos(data.items);
      setConfigurado(data.configurado);
      setError(null);
    } else {
      setDispositivos((actual) => actual ?? []);
      setError(mensajeDeError(fallo));
    }
  }, []);
  useLoadEffect(cargar);

  async function quitar(id: number): Promise<boolean> {
    setQuitando(id);
    setError(null);
    const { error: fallo } = await api.DELETE("/api/v2/push/dispositivos/{dispositivo_id}", { params: { path: { dispositivo_id: id } } });
    setQuitando(null);
    if (fallo) {
      setError(mensajeDeError(fallo));
      return false;
    }
    setDispositivos((actual) => actual?.filter((d) => d.id !== id) ?? null);
    return true;
  }

  /** Pide el permiso y suscribe este navegador. Devuelve el permiso final o "error". */
  async function activarAqui(): Promise<NotificationPermission | "error"> {
    setActivando(true);
    setError(null);
    try {
      const permiso = await activarNotificaciones();
      setNavegador(permiso);
      if (permiso === "granted") await cargar();
      return permiso;
    } catch {
      return "error";
    } finally {
      setActivando(false);
    }
  }

  return { dispositivos, configurado, error, quitando, activando, navegador, quitar, activarAqui, recargar: cargar };
}
