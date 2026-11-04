"use client";

import { useState } from "react";
import { BellRing, Monitor, Smartphone, Trash2 } from "lucide-react";

import { useDispositivosPush } from "@/components/push/useDispositivosPush";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";
import { fechaConHora } from "@/lib/fechas";

/** Dispositivos del equipo con avisos del navegador, y si silenciar correo o WhatsApp cuando los hay. */
export default function PushDeviceManager({ showSilencingOptions = true }: { showSilencingOptions?: boolean }) {
  const { token, user, refreshUser } = useSession();
  const { toast } = useToast();
  const { dispositivos, configurado, error, quitando, activando, navegador, quitar, activarAqui } = useDispositivosPush();
  const [silenciarCorreo, setSilenciarCorreo] = useState(Boolean(user?.silenciar_email_si_push));
  const [silenciarWhatsapp, setSilenciarWhatsapp] = useState(Boolean(user?.silenciar_whatsapp_si_push));
  const [guardando, setGuardando] = useState(false);

  // Reinicia los interruptores cuando cambian los valores guardados, durante el render.
  const guardado = user ? `${user.id}:${Boolean(user.silenciar_email_si_push)}:${Boolean(user.silenciar_whatsapp_si_push)}` : null;
  const [sincronizado, setSincronizado] = useState(guardado);
  if (guardado !== null && guardado !== sincronizado) {
    setSincronizado(guardado);
    setSilenciarCorreo(Boolean(user?.silenciar_email_si_push));
    setSilenciarWhatsapp(Boolean(user?.silenciar_whatsapp_si_push));
  }

  async function activar() {
    const resultado = await activarAqui();
    if (resultado === "denied") toast({ title: "Avisos bloqueados", description: "Permítelos desde la configuración del navegador para este sitio.", tone: "warning" });
    else if (resultado === "error") toast({ title: "No se pudieron activar", description: "Inténtalo de nuevo en un momento.", tone: "error" });
  }

  async function guardarSilencio() {
    if (!token) return;
    setGuardando(true);
    try {
      await apiRequest("/api/auth/preferencias-notificaciones", {
        method: "PATCH",
        token,
        body: JSON.stringify({ silenciar_email_si_push: silenciarCorreo, silenciar_whatsapp_si_push: silenciarWhatsapp }),
      });
      await refreshUser();
      toast({ title: "Preferencia guardada", tone: "success" });
    } catch (causa) {
      toast({ title: "No se pudo guardar", description: causa instanceof Error ? causa.message : undefined, tone: "error" });
    } finally {
      setGuardando(false);
    }
  }

  const hay = (dispositivos?.length ?? 0) > 0;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <BellRing aria-hidden size={17} className="text-ink-2" /> Avisos del navegador
        </h3>
        <p className="mt-1 text-pretty text-[14px] text-ink-2">
          En estos dispositivos ves al instante los mensajes y las actuaciones nuevas, aunque no tengas el panel abierto.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error}</p>}

      {dispositivos === null ? (
        <div aria-busy="true" className="skeleton h-14 rounded-lg" />
      ) : !hay ? (
        <p className="rounded-lg bg-sheet-2 px-4 py-3 text-[14px] text-ink-2">
          {configurado ? "Aún no los tienes activos en ningún dispositivo." : "El servidor aún no tiene configurados los avisos del navegador."}
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

      {showSilencingOptions && hay && (
        <fieldset className="space-y-2.5 rounded-lg bg-sheet-2 px-4 py-3.5">
          <legend className="sr-only">Silenciar otros canales</legend>
          <p className="text-[14px] font-semibold text-ink">Mientras tengas avisos del navegador activos:</p>
          <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[14px] text-ink-2">
            <input type="checkbox" checked={silenciarCorreo} onChange={(e) => setSilenciarCorreo(e.target.checked)} className="size-4 accent-[var(--navy)]" />
            No enviarme los avisos por correo
          </label>
          <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[14px] text-ink-2">
            <input type="checkbox" checked={silenciarWhatsapp} onChange={(e) => setSilenciarWhatsapp(e.target.checked)} className="size-4 accent-[var(--navy)]" />
            No enviarme los avisos por WhatsApp
          </label>
          <Button size="sm" loading={guardando} onClick={() => void guardarSilencio()}>Guardar</Button>
        </fieldset>
      )}
    </section>
  );
}
