"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Mail, MessageCircle, X } from "lucide-react";
import { apiRequest } from "@/lib/api";

type SecurityAction = "email" | "whatsapp" | "password";
type Channel = "EMAIL" | "WHATSAPP";
type Challenge = {
  id: string;
  accion: SecurityAction;
  canal: Channel;
  expira_en: string;
  reenviar_desde: string;
  verificado?: boolean;
};

export function SecurityChangeButton({ action, title, token, whatsappAvailable, onComplete }: {
  action: SecurityAction;
  title: string;
  token: string | null;
  whatsappAvailable: boolean;
  onComplete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [verified, setVerified] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [value, setValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const openRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void apiRequest(`/api/auth/seguridad/codigos/activo?accion=${action}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      if (!response.ok) return;
      const activeChallenge = await response.json();
      if (active && !cancelledRef.current && activeChallenge) {
        setChallenge(activeChallenge);
        setVerified(Boolean(activeChallenge.verificado));
        setChannel(activeChallenge.canal);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [action, token]);

  useEffect(() => {
    if (!challenge) return;
    const update = () => {
      setRemaining(Math.max(0, Math.ceil((Date.parse(challenge.expira_en) - Date.now()) / 1000)));
      setCooldown(Math.max(0, Math.ceil((Date.parse(challenge.reenviar_desde) - Date.now()) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  async function call(path: string, init: RequestInit = {}) {
    if (!token) throw new Error("Inicia sesión nuevamente para continuar.");
    const response = await apiRequest(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
    });
    return response.status === 204 ? null : response.json();
  }

  async function cancelChallenge(id: string) {
    try {
      await call(`/api/auth/seguridad/codigos/${id}`, { method: "DELETE" });
      return true;
    } catch {
      return false;
    }
  }

  async function cancelActiveChallenge() {
    try {
      await call(`/api/auth/seguridad/codigos?accion=${action}`, { method: "DELETE" });
      return true;
    } catch {
      return false;
    }
  }

  async function closePopup() {
    setError("");
    if (busy && verified) {
      setError("Espera a que termine la solicitud para cerrar y cancelar el código.");
      return;
    }
    openRef.current = false;
    if (!(await cancelActiveChallenge())) {
      openRef.current = true;
      setError("No se pudo invalidar el código. Mantén esta ventana abierta e inténtalo de nuevo.");
      return;
    }
    openRef.current = false;
    cancelledRef.current = true;
    setOpen(false);
    setChallenge(null);
    setVerified(false);
    setCode("");
    setValue("");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function requestCode() {
    setBusy(true); setError("");
    try {
      const next = await call("/api/auth/seguridad/codigos", {
        method: "POST", body: JSON.stringify({ accion: action, canal: channel }),
      });
      if (!openRef.current) {
        await cancelActiveChallenge();
        return;
      }
      setChallenge(next); setVerified(false); setCode("");
    } catch (cause) {
      if (openRef.current) setError(cause instanceof Error ? cause.message : "No fue posible enviar el código.");
    } finally { setBusy(false); }
  }

  async function verifyCode() {
    if (!challenge) return;
    setBusy(true); setError("");
    try {
      await call(`/api/auth/seguridad/codigos/${challenge.id}/verificar`, {
        method: "POST", body: JSON.stringify({ codigo: code }),
      });
      setVerified(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "El código no pudo validarse."); }
    finally { setBusy(false); }
  }

  async function resendCode() {
    if (!challenge || cooldown > 0 || remaining === 0) return;
    const nextChannel: Channel = channel === "EMAIL" ? "WHATSAPP" : "EMAIL";
    setBusy(true); setError("");
    try {
      const next = await call(`/api/auth/seguridad/codigos/${challenge.id}/reenviar`, {
        method: "POST", body: JSON.stringify({ canal: nextChannel }),
      });
      if (!openRef.current) { await cancelChallenge(next.id); return; }
      setChallenge(next); setChannel(nextChannel); setVerified(false); setCode("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible reenviar el código."); }
    finally { setBusy(false); }
  }

  async function applyChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || !verified) return;
    setBusy(true); setError("");
    const body = action === "password"
      ? { password_actual: currentPassword, password_nueva: newPassword }
      : { valor: value };
    try {
      const result = await call(`/api/auth/seguridad/codigos/${challenge.id}/aplicar`, {
        method: "POST", body: JSON.stringify(body),
      });
      openRef.current = false;
      cancelledRef.current = true;
      setOpen(false); setChallenge(null); setVerified(false); setCode("");
      setValue(""); setCurrentPassword(""); setNewPassword("");
      setNotice(result?.mensaje || "El cambio se aplicó y enviamos una confirmación a tus canales registrados.");
      await onComplete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible aplicar el cambio."); }
    finally { setBusy(false); }
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm";

  return <>
    <div className="space-y-2">
      <button type="button" onClick={() => { setError(""); cancelledRef.current = false; setOpen(true); openRef.current = true; }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover">
        {action === "email" ? <Mail className="size-4" /> : action === "whatsapp" ? <MessageCircle className="size-4" /> : <KeyRound className="size-4" />}
        {title}
      </button>
      {notice && <p role="status" className="text-xs text-success">{notice}</p>}
      {error && !open && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
    {open && <div className="motion-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) void closePopup(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={`security-${action}-title`} onKeyDown={(event) => { if (event.key === "Escape") void closePopup(); }} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div><h2 id={`security-${action}-title`} className="font-semibold">{title}</h2><p className="mt-1 text-sm text-foreground-muted">Valida tu identidad primero. El código vence en 3 minutos.</p></div>
          <button type="button" aria-label="Cerrar y cancelar" onClick={() => void closePopup()} className="rounded-md p-1 hover:bg-surface-hover"><X className="size-5" /></button>
        </header>
        {!challenge ? <div className="space-y-3">
          <label className="block text-sm font-medium">Enviar código por<select value={channel} onChange={(event) => setChannel(event.target.value as Channel)} className={`${inputClass} mt-1`}><option value="EMAIL">Correo actual</option><option value="WHATSAPP" disabled={!whatsappAvailable}>WhatsApp actual</option></select></label>
          <button type="button" onClick={() => void requestCode()} disabled={busy} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Enviando código…" : "Enviar código"}</button>
        </div> : <>
          <p className="text-sm text-foreground-muted">Código enviado por {challenge.canal === "EMAIL" ? "correo" : "WhatsApp"}. {remaining > 0 ? <>Vence en <strong className="text-foreground">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>.</> : "El código venció."}</p>
          {remaining === 0 ? <button type="button" onClick={() => { void cancelChallenge(challenge.id).then((ok) => { if (ok) { setChallenge(null); setVerified(false); setCode(""); } else setError("No se pudo cancelar el código anterior."); }); }} className="w-full rounded-lg border border-border px-3 py-2 text-sm">Solicitar un código nuevo</button> : verified ? <form onSubmit={applyChange} className="space-y-3">
            <p className="rounded-lg bg-success-light p-3 text-sm text-success">Código validado. Ahora puedes ingresar el nuevo dato.</p>
            {action === "email" && <label className="block text-sm font-medium">Nuevo correo<input required type="email" autoComplete="email" value={value} onChange={(event) => setValue(event.target.value)} className={`${inputClass} mt-1`} /></label>}
            {action === "whatsapp" && <label className="block text-sm font-medium">Nuevo número con indicativo<input required type="tel" value={value} onChange={(event) => setValue(event.target.value)} className={`${inputClass} mt-1`} /></label>}
            {action === "password" && <><label className="block text-sm font-medium">Contraseña actual<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="block text-sm font-medium">Nueva contraseña<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={`${inputClass} mt-1`} /></label></>}
            <button type="submit" disabled={busy || (action === "password" ? !currentPassword || newPassword.length < 8 : !value)} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Guardando…" : "Confirmar cambio"}</button>
          </form> : <div className="space-y-3">
            <label className="block text-sm font-medium">Código de 6 dígitos<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className={`${inputClass} mt-1 text-center tracking-[0.3em]`} /></label>
            <button type="button" disabled={busy || code.length !== 6} onClick={() => void verifyCode()} className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Validando…" : "Validar código"}</button>
            <button type="button" disabled={busy || cooldown > 0 || (channel === "EMAIL" && !whatsappAvailable)} onClick={() => void resendCode()} className="w-full rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{cooldown > 0 ? `Cambiar canal o reenviar en ${cooldown}s` : `Reenviar por ${channel === "EMAIL" ? "WhatsApp" : "correo"}`}</button>
          </div>}
        </>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <p className="text-xs text-foreground-muted">Al cerrar esta ventana, el código vigente se invalida.</p>
      </section>
    </div>}
  </>;
}
