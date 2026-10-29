"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { RefreshCw, Save } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Configuracion = Esquemas["ConfiguracionFinanzas"];
type Formulario = { remitente_nombre: string; remitente_email: string; reply_to: string; datos_pago: string; nota_documentos: string };

const NOTA_POR_DEFECTO = "Este documento es una cuenta de cobro. No es una factura electrónica ni un título valor.";

function aFormulario(c: Configuracion): Formulario {
  return {
    remitente_nombre: c.remitente_nombre,
    remitente_email: c.remitente_email ?? "",
    reply_to: c.reply_to ?? "",
    datos_pago: c.datos_pago ?? "",
    nota_documentos: c.nota_documentos ?? "",
  };
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <Sheet className="grid gap-x-8 gap-y-4 px-5 py-6 sm:px-7 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="font-display text-[19px] leading-snug text-ink">{titulo}</h2>
        <p className="mt-1 text-[13.5px] text-ink-3 [text-wrap:pretty]">{descripcion}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Sheet>
  );
}

/** Remitente de los correos de cobro, datos para pagar y nota al pie de los PDF financieros. */
export default function AdminFinanzasPage() {
  const id = useId();
  const { toast } = useToast();
  const [guardada, setGuardada] = useState<Formulario | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/finanzas/configuracion");
    if (!data) return setError(mensajeDeError(fallo));
    setGuardada(aFormulario(data));
    setForm(aFormulario(data));
  }, []);
  useLoadEffect(cargar);

  const cambio = Boolean(form && guardada && (Object.keys(form) as (keyof Formulario)[]).some((k) => form[k] !== guardada[k]));
  const campo = (k: keyof Formulario) => ({
    value: form?.[k] ?? "",
    onChange: (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f)),
    "aria-invalid": errores[k] ? true : undefined,
    "aria-describedby": `${id}-${k}-ayuda`,
  });
  const ayuda = (k: keyof Formulario, texto: ReactNode) => (
    <p id={`${id}-${k}-ayuda`} className={cx("mt-1.5 text-[13px]", errores[k] ? "text-bad" : "text-ink-3")}>{errores[k] ?? texto}</p>
  );

  async function guardar(evento: { preventDefault: () => void }) {
    evento.preventDefault();
    if (!form) return;
    if (form.remitente_nombre.trim().length < 2) return setErrores({ remitente_nombre: "Escriba el nombre que verá el cliente." });
    setErrores({});
    setGuardando(true);
    const { data, error: fallo } = await api.PUT("/api/v2/finanzas/configuracion", {
      body: {
        remitente_nombre: form.remitente_nombre,
        remitente_email: form.remitente_email || null,
        reply_to: form.reply_to || null,
        datos_pago: form.datos_pago || null,
        nota_documentos: form.nota_documentos || null,
      },
    });
    setGuardando(false);
    if (!data) {
      setErrores({ general: mensajeDeError(fallo), ...(fallo && "campos" in fallo ? fallo.campos : {}) });
      return;
    }
    setGuardada(aFormulario(data));
    setForm(aFormulario(data));
    toast({ title: "Configuración guardada", description: "Los próximos correos y PDF de cobro ya la usan.", tone: "success" });
  }

  return (
    <div>
      <PageHeader title="Cobros y pagos" description="Lo que ven los clientes en las cuentas de cobro, los recibos y sus correos." />

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !form ? (
        <div aria-busy="true" className="space-y-4">
          <div className="h-48 animate-pulse rounded-2xl bg-sheet-2" />
          <div className="h-40 animate-pulse rounded-2xl bg-sheet-2" />
        </div>
      ) : (
        <form onSubmit={(e) => void guardar(e)} noValidate className="space-y-4">
          <Seccion titulo="Remitente" descripcion="Quién envía las cuentas de cobro y los recibos. Si el cliente responde, la respuesta llega al correo de «Responder a».">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={`${id}-remitente_nombre`} className={ETIQUETA}>Nombre del remitente</label>
                <input id={`${id}-remitente_nombre`} maxLength={180} className={CAMPO} {...campo("remitente_nombre")} />
                {ayuda("remitente_nombre", "Es lo primero que el cliente ve en su bandeja.")}
              </div>
              <div>
                <label htmlFor={`${id}-remitente_email`} className={ETIQUETA}>Correo del remitente <span className="font-normal text-ink-3">(opcional)</span></label>
                <input id={`${id}-remitente_email`} type="email" inputMode="email" maxLength={320} placeholder="cobros@alejandramunozabogada.com" className={CAMPO} {...campo("remitente_email")} />
                {ayuda("remitente_email", "Vacío, sale del correo general del sistema. Debe estar autorizado en el servidor de correo.")}
              </div>
              <div>
                <label htmlFor={`${id}-reply_to`} className={ETIQUETA}>Responder a <span className="font-normal text-ink-3">(opcional)</span></label>
                <input id={`${id}-reply_to`} type="email" inputMode="email" maxLength={320} placeholder="contabilidad@alejandramunozabogada.com" className={CAMPO} {...campo("reply_to")} />
                {ayuda("reply_to", "Vacío, las respuestas van al correo del remitente.")}
              </div>
            </div>
            <div className="mt-5 rounded-xl bg-sheet-2 px-4 py-3 text-[13.5px] shadow-[0_0_0_1px_var(--line)]">
              <p className="text-ink-3">Así lo verá el cliente</p>
              <p className="mt-1 truncate text-ink"><span className="text-ink-3">De: </span><span className="font-semibold">{form.remitente_nombre || "—"}</span>{form.remitente_email ? ` <${form.remitente_email}>` : ""}</p>
              {(form.reply_to || form.remitente_email) && (
                <p className="truncate text-ink"><span className="text-ink-3">Responder a: </span>{form.reply_to || form.remitente_email}</p>
              )}
              <p className="truncate text-ink"><span className="text-ink-3">Asunto: </span>Su cuenta de cobro por $1.250.000</p>
            </div>
          </Seccion>

          <Seccion titulo="Datos para pagar" descripcion="Salen en cada cuenta de cobro (PDF y correo) y en la página Pagos del portal del cliente.">
            <label htmlFor={`${id}-datos_pago`} className={ETIQUETA}>Cuentas y medios de pago</label>
            <textarea
              id={`${id}-datos_pago`}
              rows={5}
              maxLength={2000}
              placeholder={"Bancolombia, cuenta de ahorros 000-000000-00, a nombre de …\nNequi: 300 000 0000"}
              className={cx(CAMPO, "resize-y py-2.5 leading-relaxed")}
              {...campo("datos_pago")}
            />
            {ayuda("datos_pago", <>Una línea por cuenta. Vacío, la cuenta de cobro no dice cómo pagar. <span className="tabular-nums">{form.datos_pago.length}/2000</span></>)}
          </Seccion>

          <Seccion titulo="Nota de los PDF" descripcion="Una línea al pie de las cuentas de cobro, los recibos y los estados de cuenta.">
            <label htmlFor={`${id}-nota_documentos`} className={ETIQUETA}>Nota al pie</label>
            <textarea
              id={`${id}-nota_documentos`}
              rows={2}
              maxLength={1000}
              placeholder={NOTA_POR_DEFECTO}
              className={cx(CAMPO, "resize-y py-2.5")}
              {...campo("nota_documentos")}
            />
            {ayuda("nota_documentos", <>Vacío, se usa: «{NOTA_POR_DEFECTO}»</>)}
          </Seccion>

          {errores.general && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] text-bad">{errores.general}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" icon={<Save size={16} />} loading={guardando} disabled={!cambio}>Guardar</Button>
            <Button type="button" variant="ghost" disabled={!cambio || guardando} onClick={() => { setForm(guardada); setErrores({}); }}>Descartar</Button>
            <p className="text-[13px] text-ink-3" aria-live="polite">{cambio ? "Tiene cambios sin guardar." : "Todo guardado."}</p>
          </div>
        </form>
      )}
    </div>
  );
}
