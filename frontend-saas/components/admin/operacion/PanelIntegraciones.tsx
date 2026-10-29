"use client";

import Link from "next/link";
import { useCallback, useId, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, PlugZap, RefreshCw, Send, XCircle } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Panel = Esquemas["PanelIntegraciones"];
type Clave = "rama_judicial" | "correo" | "whatsapp" | "tareas_programadas";
type Resultado = Esquemas["ResultadoPrueba"];

const SALUD: Record<Esquemas["EstadoIntegracion"]["estado"], { tono: TonoTag; texto: string }> = {
  ok: { tono: "ok", texto: "Al día" },
  aviso: { tono: "warn", texto: "Revisar" },
  falla: { tono: "bad", texto: "Falla" },
  sin_configurar: { tono: "neutral", texto: "Sin configurar" },
};
const PROBABLES = new Set(["rama_judicial", "correo", "whatsapp"]);

function MensajePrueba({ resultado }: { resultado: Resultado }) {
  const Icono = resultado.estado === "ok" ? CheckCircle2 : resultado.estado === "falla" ? XCircle : CircleAlert;
  return (
    <p role="status" className={cx("mt-2 flex items-start gap-1.5 text-[13px]", resultado.estado === "ok" ? "text-ok" : resultado.estado === "falla" ? "text-bad" : "text-ink-2")}>
      <Icono aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {resultado.mensaje}
    </p>
  );
}

function Formulario({ titulo, id, descripcion, children, onGuardar, guardando, error }: {
  titulo: string;
  id: string;
  descripcion: string;
  children: ReactNode;
  onGuardar: (e: FormEvent) => void;
  guardando: boolean;
  error?: string;
}) {
  return (
    <Sheet aria-labelledby={id}>
      <SheetHeader title={<span id={id}>{titulo}</span>} />
      <form onSubmit={onGuardar} noValidate className="px-4 py-4">
        <p className="mb-4 text-[13px] text-ink-2">{descripcion}</p>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        {error && <p role="alert" className="mt-4 text-[13px] text-bad">{error}</p>}
        <Button type="submit" size="sm" className="mt-4" loading={guardando}>Guardar</Button>
      </form>
    </Sheet>
  );
}

function FormularioCorreo({ panel, onGuardado }: { panel: Panel; onGuardado: (p: Panel) => void }) {
  const id = useId();
  const { toast } = useToast();
  const c = panel.correo;
  const [form, setForm] = useState({ servidor: c.servidor, puerto: String(c.puerto ?? 587), remitente: c.remitente, usuario: c.usuario, clave: "", starttls: c.starttls });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent, borrarClave = false) {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    const { data, error } = await api.PUT("/api/v2/admin/integraciones/correo", {
      body: { servidor: form.servidor, puerto: Number(form.puerto) || 587, remitente: form.remitente, usuario: form.usuario, starttls: form.starttls, clave: form.clave || null, borrar_clave: borrarClave },
    });
    setGuardando(false);
    if (error || !data) {
      const campos = error?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "" : mensajeDeError(error) });
      return;
    }
    toast({ title: "Servidor de correo guardado", description: "Pruebe la conexión para confirmar que funciona.", tone: "success" });
    setForm((f) => ({ ...f, clave: "" }));
    onGuardado(data);
  }

  return (
    <Formulario titulo="Servidor de correo" id={`${id}-t`} descripcion="Los datos del proveedor de correo (SMTP) desde el que salen los avisos." onGuardar={guardar} guardando={guardando} error={errores.general}>
      <Campo id={`${id}-s`} etiqueta="Servidor" error={errores.servidor}>
        <input id={`${id}-s`} value={form.servidor} placeholder="smtp.proveedor.com" onChange={(e) => setForm({ ...form, servidor: e.target.value })} className={CAMPO} />
      </Campo>
      <Campo id={`${id}-p`} etiqueta="Puerto" error={errores.puerto}>
        <input id={`${id}-p`} inputMode="numeric" value={form.puerto} onChange={(e) => setForm({ ...form, puerto: e.target.value.replace(/\D/g, "") })} className={CAMPO} />
      </Campo>
      <Campo id={`${id}-r`} etiqueta="Remitente" error={errores.remitente} ayuda="El correo que ven las personas como «De»." className="sm:col-span-2">
        <input id={`${id}-r`} type="email" value={form.remitente} onChange={(e) => setForm({ ...form, remitente: e.target.value })} className={CAMPO} />
      </Campo>
      <Campo id={`${id}-u`} etiqueta="Usuario" opcional error={errores.usuario}>
        <input id={`${id}-u`} value={form.usuario} autoComplete="off" onChange={(e) => setForm({ ...form, usuario: e.target.value })} className={CAMPO} />
      </Campo>
      <Campo id={`${id}-c`} etiqueta="Clave" opcional error={errores.clave} ayuda={c.tiene_clave ? "Hay una guardada. Escriba otra solo si cambió." : undefined}>
        <input id={`${id}-c`} type="password" value={form.clave} autoComplete="new-password" placeholder={c.tiene_clave ? "••••••••" : ""} onChange={(e) => setForm({ ...form, clave: e.target.value })} className={CAMPO} />
      </Campo>
      <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-ink sm:col-span-2">
        <input type="checkbox" checked={form.starttls} onChange={(e) => setForm({ ...form, starttls: e.target.checked })} className="size-4 accent-[var(--navy)]" />
        Usar conexión cifrada (STARTTLS)
      </label>
      {c.tiene_clave && (
        <button type="button" onClick={(e) => void guardar(e, true)} className="justify-self-start text-[13px] font-semibold text-bad hover:underline sm:col-span-2">
          Borrar la clave guardada
        </button>
      )}
    </Formulario>
  );
}

function FormularioWhatsapp({ panel, onGuardado }: { panel: Panel; onGuardado: (p: Panel) => void }) {
  const id = useId();
  const { toast } = useToast();
  const w = panel.whatsapp;
  const [url, setUrl] = useState(w.url);
  const [token, setToken] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent, borrarToken = false) {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    const { data, error } = await api.PUT("/api/v2/admin/integraciones/whatsapp", { body: { url, token: token || null, borrar_token: borrarToken } });
    setGuardando(false);
    if (error || !data) {
      const campos = error?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "" : mensajeDeError(error) });
      return;
    }
    toast({ title: "WhatsApp guardado", tone: "success" });
    setToken("");
    onGuardado(data);
  }

  return (
    <Formulario titulo="WhatsApp" id={`${id}-t`} descripcion="La dirección y el token que entrega el proveedor de mensajes de WhatsApp." onGuardar={guardar} guardando={guardando} error={errores.general}>
      <Campo id={`${id}-u`} etiqueta="Dirección del proveedor" error={errores.url} className="sm:col-span-2">
        <input id={`${id}-u`} type="url" value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} className={CAMPO} />
      </Campo>
      <Campo id={`${id}-k`} etiqueta="Token" opcional error={errores.token} ayuda={w.tiene_token ? "Hay uno guardado. Escriba otro solo si cambió." : undefined} className="sm:col-span-2">
        <input id={`${id}-k`} type="password" value={token} autoComplete="new-password" placeholder={w.tiene_token ? "••••••••" : ""} onChange={(e) => setToken(e.target.value)} className={CAMPO} />
      </Campo>
      {w.tiene_token && (
        <button type="button" onClick={(e) => void guardar(e, true)} className="justify-self-start text-[13px] font-semibold text-bad hover:underline sm:col-span-2">
          Borrar el token guardado
        </button>
      )}
    </Formulario>
  );
}

function EnvioPrueba() {
  const id = useId();
  const { toast } = useToast();
  const [canal, setCanal] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [destinatario, setDestinatario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!destinatario.trim()) {
      setError(canal === "EMAIL" ? "Escriba el correo." : "Escriba el número.");
      return;
    }
    setEnviando(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/admin/integraciones/envio-prueba", { body: { canal, destinatario } });
    setEnviando(false);
    if (fallo || !data) {
      setError(fallo?.campos?.destinatario ?? mensajeDeError(fallo));
      return;
    }
    toast({ title: "Mensaje de prueba enviado", description: `Revise ${data.destino}.`, tone: "success" });
  }

  return (
    <Sheet aria-labelledby={`${id}-t`}>
      <SheetHeader title={<span id={`${id}-t`}>Enviar un mensaje de prueba</span>} />
      <form onSubmit={enviar} noValidate className="space-y-4 px-4 py-4">
        <p className="text-[13px] text-ink-2">Llega de verdad. Úselo para confirmar que los avisos salen.</p>
        <fieldset>
          <legend className={ETIQUETA}>Por</legend>
          <div className="flex gap-2">
            {(["EMAIL", "WHATSAPP"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={canal === c} onClick={() => { setCanal(c); setError(null); }}
                className={cx("inline-flex min-h-10 flex-1 items-center justify-center rounded-lg px-3 text-[14px] font-semibold transition-colors",
                  canal === c ? "bg-navy text-on-navy" : "bg-sheet text-ink-2 shadow-[0_0_0_1px_var(--line-strong)] hover:text-ink")}>
                {c === "EMAIL" ? "Correo" : "WhatsApp"}
              </button>
            ))}
          </div>
        </fieldset>
        <Campo id={`${id}-d`} etiqueta={canal === "EMAIL" ? "Correo" : "Número de WhatsApp"} error={error ?? undefined}>
          <input id={`${id}-d`} type={canal === "EMAIL" ? "email" : "tel"} value={destinatario} placeholder={canal === "EMAIL" ? "usted@correo.com" : "300 123 4567"}
            onChange={(e) => setDestinatario(e.target.value)} aria-invalid={error ? true : undefined} className={CAMPO} />
        </Campo>
        <Button type="submit" size="sm" variant="secondary" icon={<Send size={14} />} loading={enviando}>Enviar prueba</Button>
      </form>
    </Sheet>
  );
}

export function PanelIntegraciones() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState<Clave | null>(null);
  const [resultados, setResultados] = useState<Partial<Record<Clave, Resultado>>>({});

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/integraciones");
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setPanel(data);
  }, []);
  useLoadEffect(cargar);

  async function probar(clave: Clave) {
    setProbando(clave);
    const { data, error: fallo } = await api.POST("/api/v2/admin/integraciones/{clave}/probar", { params: { path: { clave } } });
    setProbando(null);
    setResultados((r) => ({ ...r, [clave]: data ?? { estado: "falla", mensaje: mensajeDeError(fallo) } }));
  }

  if (!panel) {
    return (
      <div>
        <PageHeader title="Integraciones" />
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : <LoadingState label="Cargando las integraciones" rows={4} />}
      </div>
    );
  }

  const filas: { clave: string; nombre: string; estado?: Esquemas["EstadoIntegracion"]; probar: boolean }[] = [
    ...panel.estados.map((e) => ({ clave: e.clave, nombre: e.nombre, estado: e, probar: PROBABLES.has(e.clave) })),
    { clave: "tareas_programadas", nombre: "Tareas programadas", probar: true },
  ];

  return (
    <div>
      <PageHeader title="Integraciones" description="Los servicios con los que la plataforma consulta la Rama Judicial, envía avisos y guarda archivos." />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <Sheet aria-labelledby="integraciones-estado">
            <SheetHeader title={<span id="integraciones-estado">Estado</span>} />
            <ul className="divide-y divide-line">
              {filas.map((fila) => {
                const salud = fila.estado ? SALUD[fila.estado.estado] : null;
                const resultado = resultados[fila.clave as Clave];
                return (
                  <li key={fila.clave} className="px-4 py-3">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                          {fila.nombre}
                          {salud && <Tag tone={salud.tono}>{salud.texto}</Tag>}
                        </p>
                        {fila.estado ? (
                          <p className="mt-0.5 text-[13px] text-ink-2">
                            {fila.estado.resumen}
                            {fila.estado.ultima_vez && <span className="text-ink-3"> · {fechaRelativa(fila.estado.ultima_vez)}</span>}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[13px] text-ink-2">Lanza las consultas y los envíos en segundo plano.</p>
                        )}
                        {fila.estado?.detalle && <p className="mt-0.5 text-[13px] text-ink-2">{fila.estado.detalle}</p>}
                      </div>
                      {fila.probar ? (
                        <Button size="sm" variant="secondary" icon={<PlugZap size={14} />} loading={probando === fila.clave} disabled={probando !== null && probando !== fila.clave} onClick={() => void probar(fila.clave as Clave)}>
                          Probar conexión
                        </Button>
                      ) : fila.estado && fila.estado.enlace && !fila.estado.enlace.endsWith("/integraciones") ? (
                        <Link href={fila.estado.enlace} className="text-[13px] font-semibold text-navy hover:underline dark:text-navy-ink">Ver</Link>
                      ) : null}
                    </div>
                    {resultado && <MensajePrueba resultado={resultado} />}
                  </li>
                );
              })}
            </ul>
          </Sheet>
          <FormularioCorreo key={`c-${panel.correo.servidor}-${panel.correo.tiene_clave}`} panel={panel} onGuardado={setPanel} />
          <FormularioWhatsapp key={`w-${panel.whatsapp.url}-${panel.whatsapp.tiene_token}`} panel={panel} onGuardado={setPanel} />
        </div>
        <aside className="lg:sticky lg:top-20">
          <EnvioPrueba />
        </aside>
      </div>
    </div>
  );
}
