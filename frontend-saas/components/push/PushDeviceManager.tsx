"use client";

import { useState } from "react";
import { BellRing, Monitor, Smartphone, Trash2 } from "lucide-react";

import type { Cuenta } from "@/components/cuenta/MiCuenta";
import type { Trato } from "@/components/cuenta/CambioSeguro";
import { useDispositivosPush } from "@/components/push/useDispositivosPush";
import { Button } from "@/components/ui/Button";
import { Interruptor } from "@/components/ui/Interruptor";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { fechaConHora } from "@/lib/fechas";

const TEXTOS = {
  tu: {
    bloqueados: "Permítelos desde la configuración del navegador para este sitio.",
    reintentar: "Inténtalo de nuevo en un momento.",
    ninguno: "Aún no los tienes activos en ningún dispositivo.",
    mientras: "Mientras tengas avisos al instante activos:",
    correo: "No enviarme esos avisos por correo",
    whatsapp: "No enviarme esos avisos por WhatsApp",
  },
  usted: {
    bloqueados: "Permítalos desde la configuración del navegador para este sitio.",
    reintentar: "Inténtelo de nuevo en un momento.",
    ninguno: "Aún no los tiene activos en ningún dispositivo.",
    mientras: "Mientras tenga avisos al instante activos:",
    correo: "No enviarme esos avisos por correo",
    whatsapp: "No enviarme esos avisos por WhatsApp",
  },
} as const;

/** Dispositivos con avisos del navegador, y si silenciar correo o WhatsApp mientras los haya. */
export default function PushDeviceManager({ cuenta, onCambio, trato }: { cuenta: Cuenta; onCambio: (c: Cuenta) => void; trato: Trato }) {
  const t = TEXTOS[trato];
  const { toast } = useToast();
  const { dispositivos, configurado, error, quitando, activando, navegador, quitar, activarAqui } = useDispositivosPush();
  const [guardando, setGuardando] = useState(false);

  async function activar() {
    const resultado = await activarAqui();
    if (resultado === "denied") toast({ title: "Avisos bloqueados", description: t.bloqueados, tone: "warning" });
    else if (resultado === "error") toast({ title: "No se pudieron activar", description: t.reintentar, tone: "error" });
  }

  async function silenciar(canal: "correo" | "whatsapp", valor: boolean) {
    const campo = canal === "correo" ? "silenciar_correo_si_push" : "silenciar_whatsapp_si_push";
    const anterior = cuenta;
    onCambio({ ...cuenta, [campo]: valor });
    setGuardando(true);
    const { data, error: fallo } = await api.PUT("/api/v2/cuenta/avisos", { body: { [campo]: valor } });
    setGuardando(false);
    if (!data) {
      onCambio(anterior);
      toast({ title: "No se guardó el cambio", description: mensajeDeError(fallo), tone: "error" });
      return;
    }
    onCambio(data);
  }

  const hay = (dispositivos?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error}</p>}

      {dispositivos === null ? (
        <div aria-busy="true" className="skeleton h-14 rounded-lg" />
      ) : !hay ? (
        <p className="rounded-lg bg-sheet-2 px-4 py-3 text-[14px] text-ink-2">
          {configurado ? t.ninguno : "El servidor aún no tiene configurados los avisos del navegador."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg shadow-[0_0_0_1px_var(--line)]">
          {dispositivos.map((d) => {
            const Icono = /iphone|ipad|android/i.test(d.nombre) ? Smartphone : Monitor;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Icono aria-hidden size={19} className="shrink-0 text-ink-2" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{d.nombre || "Dispositivo"}</p>
                  {d.activado_en && <p className="text-[13px] text-ink-3">Activo desde el {fechaConHora(d.activado_en)}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={quitando === d.id}
                  icon={<Trash2 aria-hidden size={15} />}
                  onClick={() => void quitar(d.id)}
                  aria-label={`Quitar ${d.nombre || "el dispositivo"}`}
                >
                  Quitar
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {configurado && navegador === "default" && (
        <Button variant="secondary" icon={<BellRing size={16} />} loading={activando} onClick={() => void activar()}>
          Activar en este dispositivo
        </Button>
      )}

      {hay && (
        <div className="rounded-lg bg-sheet-2 px-4 py-3">
          <p className="text-[14px] font-semibold text-ink">{t.mientras}</p>
          <div className="mt-1 divide-y divide-line">
            <div className="flex items-center gap-3 py-1">
              <span className="flex-1 text-[14px] text-ink-2">{t.correo}</span>
              <Interruptor activo={cuenta.silenciar_correo_si_push} etiqueta={t.correo} deshabilitado={guardando} onCambio={(v) => void silenciar("correo", v)} />
            </div>
            <div className="flex items-center gap-3 py-1">
              <span className="flex-1 text-[14px] text-ink-2">{t.whatsapp}</span>
              <Interruptor activo={cuenta.silenciar_whatsapp_si_push} etiqueta={t.whatsapp} deshabilitado={guardando || !cuenta.whatsapp} onCambio={(v) => void silenciar("whatsapp", v)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
