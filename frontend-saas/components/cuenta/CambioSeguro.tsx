"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";

type Accion = Esquemas["NuevoCodigo"]["accion"];
type Canal = Esquemas["NuevoCodigo"]["canal"];
type Codigo = Esquemas["CodigoSeguridad"];
export type Trato = "usted" | "tu";

const ICONO: Record<Accion, ReactNode> = {
  email: <Mail aria-hidden size={16} />,
  whatsapp: <MessageCircle aria-hidden size={16} />,
  password: <KeyRound aria-hidden size={16} />,
};

const T = {
  usted: {
    intro: "Para proteger su cuenta, primero le enviamos un código de 6 dígitos.",
    enviarA: "¿Dónde quiere recibirlo?",
    escribimos: (d: string) => `Le enviamos el código a ${d}.`,
    escriba: "Escriba el código",
    nuevoCorreo: "Su correo nuevo",
    nuevoNumero: "Su número nuevo, con el indicativo del país",
    actual: "Su contraseña actual",
    nueva: "Su contraseña nueva",
    listo: "Le enviamos una confirmación a su correo y a su WhatsApp.",
    reenviarEn: (n: number) => `Puede reenviarlo en ${n} s`,
  },
  tu: {
    intro: "Para proteger tu cuenta, primero te enviamos un código de 6 dígitos.",
    enviarA: "¿Dónde quieres recibirlo?",
    escribimos: (d: string) => `Te enviamos el código a ${d}.`,
    escriba: "Escribe el código",
    nuevoCorreo: "Tu correo nuevo",
    nuevoNumero: "Tu número nuevo, con el indicativo del país",
    actual: "Tu contraseña actual",
    nueva: "Tu contraseña nueva",
    listo: "Enviamos una confirmación a tu correo y a tu WhatsApp.",
    reenviarEn: (n: number) => `Puedes reenviarlo en ${n} s`,
  },
};

const HECHO: Record<Accion, string> = {
  email: "Correo actualizado",
  whatsapp: "WhatsApp actualizado",
  password: "Contraseña actualizada",
};

function restante(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));
}

function reloj(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

const CAMPO = "block w-full rounded-lg bg-sheet px-3.5 text-ink shadow-[0_0_0_1px_var(--line-strong)] placeholder:text-ink-3 focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";

/**
 * Cambia el correo, el WhatsApp o la contraseña después de verificar un código
 * que llega al correo o al WhatsApp actuales.
 */
export function CambioSeguro({ accion, titulo, trato, tieneWhatsapp, onHecho, grande = false, variante = "secondary" }: {
  accion: Accion;
  titulo: string;
  trato: Trato;
  tieneWhatsapp: boolean;
  onHecho: (resultado: Esquemas["CambioAplicado"]) => void | Promise<void>;
  /** Letra y controles más grandes, para el portal del cliente. */
  grande?: boolean;
  variante?: "secondary" | "ghost";
}) {
  const { toast } = useToast();
  const t = T[trato];
  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState<Canal>("correo");
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [digitos, setDigitos] = useState("");
  const [valor, setValor] = useState("");
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [, setTic] = useState(0);

  useEffect(() => {
    if (!codigo) return;
    const intervalo = window.setInterval(() => setTic((n) => n + 1), 1000);
    return () => window.clearInterval(intervalo);
  }, [codigo]);

  const vence = codigo ? restante(codigo.expira_en) : 0;
  const espera = codigo ? restante(codigo.reenviar_desde) : 0;
  const tamano = grande ? "lg" : "md";
  const altoCampo = grande ? "min-h-12 text-[17px]" : "min-h-11 text-[15px]";

  function limpiar() {
    setCodigo(null);
    setDigitos("");
    setValor("");
    setActual("");
    setNueva("");
    setError(null);
    setErrores({});
  }

  async function abrir() {
    limpiar();
    setCanal("correo");
    setAbierto(true);
    const { data } = await api.GET("/api/v2/cuenta/codigos/activo", { params: { query: { accion } } });
    if (data && restante(data.expira_en) > 0) {
      setCodigo(data);
      setCanal(data.canal);
    }
  }

  function cerrar() {
    if (codigo) void api.DELETE("/api/v2/cuenta/codigos/{codigo_id}", { params: { path: { codigo_id: codigo.id } } });
    setAbierto(false);
    limpiar();
  }

  async function pedir() {
    setOcupado(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/cuenta/codigos", { body: { accion, canal } });
    setOcupado(false);
    if (data) setCodigo(data);
    else setError(mensajeDeError(fallo));
  }

  async function reenviar(otro: Canal) {
    if (!codigo) return;
    setOcupado(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/cuenta/codigos/{codigo_id}/reenviar", {
      params: { path: { codigo_id: codigo.id } },
      body: { canal: otro },
    });
    setOcupado(false);
    if (data) {
      setCodigo(data);
      setCanal(otro);
      setDigitos("");
    } else setError(mensajeDeError(fallo));
  }

  async function verificar(e: FormEvent) {
    e.preventDefault();
    if (!codigo || digitos.length !== 6) return;
    setOcupado(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/cuenta/codigos/{codigo_id}/verificar", {
      params: { path: { codigo_id: codigo.id } },
      body: { codigo: digitos },
    });
    setOcupado(false);
    if (data) setCodigo(data);
    else {
      setError(mensajeDeError(fallo));
      setDigitos("");
    }
  }

  async function aplicar(e: FormEvent) {
    e.preventDefault();
    if (!codigo) return;
    setOcupado(true);
    setError(null);
    setErrores({});
    const { data, error: fallo } = await api.POST("/api/v2/cuenta/codigos/{codigo_id}/aplicar", {
      params: { path: { codigo_id: codigo.id } },
      body: accion === "password" ? { contrasena_actual: actual, contrasena_nueva: nueva } : { valor },
    });
    setOcupado(false);
    if (!data) {
      setError(mensajeDeError(fallo));
      if (fallo && "campos" in fallo && fallo.campos) setErrores(fallo.campos);
      return;
    }
    setAbierto(false);
    limpiar();
    toast({ title: HECHO[accion], description: t.listo, tone: "success" });
    await onHecho(data);
  }

  const otroCanal: Canal = canal === "correo" ? "whatsapp" : "correo";
  const puedeOtro = otroCanal === "correo" || tieneWhatsapp;

  return (
    <>
      <Button variant={variante} size={tamano} icon={ICONO[accion]} onClick={() => void abrir()}>{titulo}</Button>
      <Modal open={abierto} onClose={cerrar} title={titulo} size="sm">
        <div className={cx("space-y-4", grande ? "text-[16px]" : "text-[14.5px]")}>
          {!codigo ? (
            <>
              <p className="text-pretty text-ink-2">{t.intro}</p>
              <fieldset>
                <legend className="mb-2 font-semibold text-ink">{t.enviarA}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["correo", "whatsapp"] as const).map((c) => {
                    const deshabilitado = c === "whatsapp" && !tieneWhatsapp;
                    return (
                      <label
                        key={c}
                        className={cx(
                          "flex items-center gap-2.5 rounded-lg px-3.5 shadow-[0_0_0_1px_var(--line-strong)]",
                          altoCampo,
                          canal === c && "shadow-[0_0_0_2px_var(--navy)]",
                          deshabilitado ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-sheet-2",
                        )}
                      >
                        <input type="radio" name={`canal-${accion}`} value={c} checked={canal === c} disabled={deshabilitado} onChange={() => setCanal(c)} className="size-4 accent-[var(--navy)]" />
                        {c === "correo" ? "Correo" : "WhatsApp"}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <Button size={tamano} className="w-full" loading={ocupado} onClick={() => void pedir()}>Enviar el código</Button>
            </>
          ) : vence === 0 ? (
            <>
              <p className="text-ink-2">El código venció.</p>
              <Button size={tamano} className="w-full" onClick={() => limpiar()}>Pedir otro código</Button>
            </>
          ) : !codigo.verificado ? (
            <form onSubmit={verificar} className="space-y-4">
              <p className="text-pretty text-ink-2">
                {t.escribimos(codigo.destino)} Vence en <span className="font-semibold tabular-nums text-ink">{reloj(vence)}</span>.
              </p>
              <label className="block">
                <span className="mb-1.5 block font-semibold text-ink">{t.escriba}</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={digitos}
                  onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={cx(CAMPO, altoCampo, "text-center font-mono text-[22px] tracking-[0.4em]")}
                />
              </label>
              <Button type="submit" size={tamano} className="w-full" loading={ocupado} disabled={digitos.length !== 6}>Verificar</Button>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[14px]">
                {espera > 0 ? (
                  <span className="tabular-nums text-ink-3">{t.reenviarEn(espera)}</span>
                ) : (
                  <>
                    <button type="button" disabled={ocupado} onClick={() => void reenviar(canal)} className="min-h-10 font-semibold text-navy-ink underline underline-offset-2">Reenviar</button>
                    {puedeOtro && (
                      <button type="button" disabled={ocupado} onClick={() => void reenviar(otroCanal)} className="min-h-10 font-semibold text-navy-ink underline underline-offset-2">
                        Mejor por {otroCanal === "correo" ? "correo" : "WhatsApp"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={aplicar} className="space-y-4">
              <p className="rounded-lg bg-ok-soft px-3.5 py-2.5 text-ok">Código correcto.</p>
              {accion === "password" ? (
                <>
                  <Campo etiqueta={t.actual} error={errores.contrasena_actual}>
                    <input required type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} className={cx(CAMPO, altoCampo)} />
                  </Campo>
                  <Campo etiqueta={t.nueva} ayuda="Al menos 8 caracteres." error={errores.contrasena_nueva}>
                    <input required minLength={8} type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={cx(CAMPO, altoCampo)} />
                  </Campo>
                </>
              ) : (
                <Campo etiqueta={accion === "email" ? t.nuevoCorreo : t.nuevoNumero} error={errores.valor}>
                  <input
                    required
                    autoFocus
                    type={accion === "email" ? "email" : "tel"}
                    autoComplete={accion === "email" ? "email" : "tel"}
                    placeholder={accion === "email" ? "nombre@correo.com" : "57 300 123 4567"}
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className={cx(CAMPO, altoCampo)}
                  />
                </Campo>
              )}
              <Button
                type="submit"
                size={tamano}
                className="w-full"
                loading={ocupado}
                disabled={accion === "password" ? !actual || nueva.length < 8 : !valor.trim()}
              >
                Guardar el cambio
              </Button>
            </form>
          )}
          {error && <p role="alert" className="rounded-lg bg-bad-soft px-3.5 py-2.5 text-bad">{error}</p>}
        </div>
      </Modal>
    </>
  );
}

function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-semibold text-ink">{etiqueta}</span>
      {children}
      {error ? <span className="mt-1 block text-[13.5px] text-bad">{error}</span> : ayuda ? <span className="mt-1 block text-[13.5px] text-ink-3">{ayuda}</span> : null}
    </label>
  );
}
