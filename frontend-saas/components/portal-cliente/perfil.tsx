"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { BellRing, Clock3, Mail, MessageCircle, Monitor, PencilLine, Smartphone, Trash2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Interruptor } from "@/components/ui/Interruptor";
import { useToast } from "@/components/ui/ToastProvider";
import { useSession } from "@/context/SessionContext";
import { apiRequest, fetchApi } from "@/lib/api";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaLarga } from "@/lib/fechas";
import type { GrupoAvisos, PerfilCliente, SolicitudCambio } from "@/lib/portalCliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

export const CAMPO_CLIENTE =
  "block min-h-12 w-full rounded-lg border border-line-strong bg-sheet px-3.5 text-[17px] text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/25";

/** Correo y WhatsApp por grupo de avisos. Cada cambio se guarda al momento. */
export function AvisosCliente({ perfil, onCambio }: { perfil: PerfilCliente; onCambio: (avisos: GrupoAvisos[]) => void }) {
  const { toast } = useToast();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hayWhatsapp = Boolean(perfil.whatsapp);

  async function cambiar(grupo: GrupoAvisos, canal: "correo" | "whatsapp", valor: boolean) {
    const nuevo = { ...grupo, [canal]: valor };
    setGuardando(`${grupo.clave}:${canal}`);
    setError(null);
    onCambio(perfil.avisos.map((g) => (g.clave === grupo.clave ? nuevo : g)));
    const { data, error: fallo } = await api.PUT("/api/v2/cliente/avisos", {
      body: [{ clave: nuevo.clave, correo: nuevo.correo, whatsapp: nuevo.whatsapp }],
    });
    setGuardando(null);
    if (!data) {
      onCambio(perfil.avisos);
      setError(mensajeDeError(fallo));
      return;
    }
    onCambio(data);
    toast({ title: "Guardado", description: `${grupo.titulo}: ${textoCanales(nuevo)}.`, tone: "success", duration: 2500 });
  }

  return (
    <section id="avisos" aria-labelledby="titulo-avisos" className="scroll-mt-24 overflow-hidden rounded-2xl bg-sheet shadow-sheet">
      <div className="px-5 pb-2 pt-5 sm:px-7">
        <h2 id="titulo-avisos" className="font-display text-[24px] leading-snug text-ink">Cómo le avisamos</h2>
        <p className="mt-1 text-[16px] text-ink-2">En el portal y en la campana verá todos los avisos. Aquí elige cuáles le llegan también al correo o al WhatsApp.</p>
      </div>
      <div role="table" aria-label="Avisos por correo y WhatsApp" className="px-5 pb-2 sm:px-7">
        <div role="row" className="flex items-end gap-2 border-b border-line pb-2 text-[14px] font-semibold text-ink-3">
          <span role="columnheader" className="flex-1"><span className="sr-only">Aviso</span></span>
          <span role="columnheader" className="flex w-14 flex-col items-center gap-0.5"><Mail aria-hidden="true" size={18} />Correo</span>
          <span role="columnheader" className="flex w-14 flex-col items-center gap-0.5"><MessageCircle aria-hidden="true" size={18} />WhatsApp</span>
        </div>
        {perfil.avisos.map((grupo) => (
          <div role="row" key={grupo.clave} className="flex items-center gap-2 border-b border-line py-4 last:border-b-0">
            <div role="rowheader" className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{grupo.titulo}</p>
              <p className="text-[15px] text-ink-2 [text-wrap:pretty]">{grupo.descripcion}</p>
            </div>
            <span role="cell" className="flex w-14 justify-center">
              <Interruptor
                activo={grupo.correo}
                etiqueta={`${grupo.titulo} por correo`}
                deshabilitado={guardando !== null}
                onCambio={(v) => void cambiar(grupo, "correo", v)}
              />
            </span>
            <span role="cell" className="flex w-14 justify-center">
              <Interruptor
                activo={grupo.whatsapp}
                etiqueta={`${grupo.titulo} por WhatsApp`}
                deshabilitado={!hayWhatsapp || guardando !== null}
                onCambio={(v) => void cambiar(grupo, "whatsapp", v)}
              />
            </span>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="px-5 pb-3 text-[15px] text-bad sm:px-7">{error}</p>}
      <p className="border-t border-line bg-sheet-2 px-5 py-4 text-[15px] text-ink-2 sm:px-7">
        {hayWhatsapp
          ? "Los avisos de seguridad de su cuenta, como los códigos de verificación, siempre llegan a su correo."
          : "Para recibir avisos por WhatsApp, registre su número en «Sus datos». Los avisos de seguridad siempre llegan a su correo."}
      </p>
    </section>
  );
}

function textoCanales(grupo: GrupoAvisos): string {
  if (grupo.correo && grupo.whatsapp) return "por correo y WhatsApp";
  if (grupo.correo) return "solo por correo";
  if (grupo.whatsapp) return "solo por WhatsApp";
  return "solo en el portal";
}

const GENEROS = { MASCULINO: "Masculino", FEMENINO: "Femenino" } as const;

/** Los datos que salen en el contrato. El cliente los pide cambiar y la firma aprueba. */
export function DatosCliente({ perfil, onSolicitud, seguridad }: {
  perfil: PerfilCliente;
  onSolicitud: (solicitud: SolicitudCambio) => void;
  /** Botones para cambiar correo, WhatsApp y contraseña con código de verificación. */
  seguridad: ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const solicitud = perfil.solicitud;
  const pendiente = solicitud?.estado === "pendiente";
  const filas: [string, string | null][] = [
    ["Nombre completo", perfil.nombre],
    ["Documento de identidad", perfil.documento],
    ["Ciudad de domicilio", perfil.domicilio],
    ["Dirección", perfil.direccion],
    ["Correo", perfil.correo],
    ["WhatsApp", perfil.whatsapp],
  ];

  return (
    <section aria-labelledby="titulo-datos" className="overflow-hidden rounded-2xl bg-sheet shadow-sheet">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-7">
        <div>
          <h2 id="titulo-datos" className="font-display text-[24px] leading-snug text-ink">Sus datos</h2>
          <p className="mt-1 text-[16px] text-ink-2">Así aparecen en su contrato con la firma.</p>
        </div>
        {!editando && !pendiente && (
          <Button variant="secondary" size="lg" icon={<PencilLine aria-hidden="true" size={18} />} onClick={() => setEditando(true)}>
            Pedir un cambio
          </Button>
        )}
      </div>

      {solicitud && solicitud.estado !== "aprobada" && (
        <div
          role="status"
          className={cx(
            "mx-5 mt-4 flex gap-3 rounded-xl px-4 py-3 sm:mx-7",
            pendiente ? "bg-manila text-ink" : "bg-bad-soft text-ink",
          )}
        >
          {pendiente
            ? <Clock3 aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-ink-2" />
            : <XCircle aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-bad" />}
          <p className="text-[16px]">
            {pendiente
              ? <>Pidió un cambio el {fechaLarga(solicitud.solicitada_en)}. La firma lo está revisando y le avisará.</>
              : <>La firma no aprobó el cambio que pidió{solicitud.comentario ? <>: «{solicitud.comentario}»</> : "."} Puede pedir otro.</>}
          </p>
        </div>
      )}

      {editando ? (
        <FormularioCambio perfil={perfil} onCancelar={() => setEditando(false)} onEnviado={(s) => { setEditando(false); onSolicitud(s); }} />
      ) : (
        <dl className="mt-3 divide-y divide-line px-5 sm:px-7">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex flex-col gap-0.5 py-3.5 sm:flex-row sm:gap-6">
              <dt className="text-[15px] text-ink-3 sm:w-56 sm:shrink-0">{etiqueta}</dt>
              <dd className={cx("min-w-0 [overflow-wrap:anywhere]", valor ? "text-ink" : "text-ink-3")}>{valor ?? "Sin registrar"}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-2 border-t border-line bg-sheet-2 px-5 py-4 sm:px-7">
        <p className="text-[15px] text-ink-2">El correo, el WhatsApp y la contraseña se cambian con un código que le enviamos para confirmar que es usted.</p>
        <div className="mt-3 flex flex-wrap gap-2">{seguridad}</div>
      </div>
    </section>
  );
}

function FormularioCambio({ perfil, onCancelar, onEnviado }: {
  perfil: PerfilCliente;
  onCancelar: () => void;
  onEnviado: (solicitud: SolicitudCambio) => void;
}) {
  const { toast } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(datos.get(campo) ?? "").trim() || null;
    const genero = texto("genero");
    setEnviando(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/cliente/perfil/solicitud", {
      body: {
        nombre: texto("nombre") ?? "",
        documento: texto("documento"),
        genero: genero === "MASCULINO" || genero === "FEMENINO" ? genero : null,
        domicilio: texto("domicilio"),
        direccion: texto("direccion"),
      },
    });
    setEnviando(false);
    if (!data) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: "Cambio enviado", description: "La firma lo revisará y le avisaremos.", tone: "success" });
    onEnviado(data);
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="motion-fade-in mt-4 grid gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-7">
      <label className="block sm:col-span-2">
        <span className="mb-1.5 block text-[15px] font-semibold text-ink">Nombre completo</span>
        <input name="nombre" required minLength={3} maxLength={150} defaultValue={perfil.nombre} autoComplete="name" className={CAMPO_CLIENTE} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold text-ink">Documento de identidad</span>
        <input name="documento" maxLength={40} defaultValue={perfil.documento ?? ""} inputMode="numeric" className={CAMPO_CLIENTE} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold text-ink">Género para el contrato</span>
        <select name="genero" defaultValue={perfil.genero ?? ""} className={CAMPO_CLIENTE}>
          <option value="">Sin indicar</option>
          {Object.entries(GENEROS).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold text-ink">Ciudad de domicilio</span>
        <input name="domicilio" maxLength={120} defaultValue={perfil.domicilio ?? ""} autoComplete="address-level2" className={CAMPO_CLIENTE} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold text-ink">Dirección</span>
        <input name="direccion" maxLength={300} defaultValue={perfil.direccion ?? ""} autoComplete="street-address" className={CAMPO_CLIENTE} />
      </label>
      {error && <p role="alert" className="text-[15px] text-bad sm:col-span-2">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="lg" onClick={onCancelar} disabled={enviando}>Cancelar</Button>
        <Button type="submit" size="lg" loading={enviando}>Enviar a la firma</Button>
      </div>
    </form>
  );
}

type Dispositivo = { id: number; device_label: string; user_agent: string; updated_at: string | null };

/** Teléfonos y computadores donde el navegador le muestra los avisos al instante. */
export function DispositivosCliente() {
  const { token } = useSession();
  const [dispositivos, setDispositivos] = useState<Dispositivo[] | null>(null);
  const [quitando, setQuitando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      setDispositivos(await fetchApi("/api/chat/push/dispositivos", { token }));
    } catch {
      setDispositivos([]);
      setError("No pudimos cargar sus dispositivos.");
    }
  }, [token]);
  useLoadEffect(cargar);

  async function quitar(id: number) {
    setQuitando(id);
    setError(null);
    try {
      await apiRequest(`/api/chat/push/dispositivos/${id}`, { method: "DELETE", token });
      setDispositivos((actual) => actual?.filter((d) => d.id !== id) ?? null);
    } catch {
      setError("No pudimos quitar ese dispositivo. Intente de nuevo.");
    } finally {
      setQuitando(null);
    }
  }

  return (
    <section aria-labelledby="titulo-dispositivos" className="rounded-2xl bg-sheet px-5 py-5 shadow-sheet sm:px-7">
      <h2 id="titulo-dispositivos" className="flex items-center gap-2 font-display text-[24px] leading-snug text-ink">
        <BellRing aria-hidden="true" size={22} className="text-ink-2" /> Avisos al instante
      </h2>
      <p className="mt-1 text-[16px] text-ink-2 [text-wrap:pretty]">
        En estos dispositivos el navegador le muestra cada aviso apenas llega, aunque no tenga el portal abierto.
      </p>
      {error && <p role="alert" className="mt-3 text-[15px] text-bad">{error}</p>}
      {dispositivos === null ? (
        <div aria-busy="true" className="mt-4 h-16 animate-pulse rounded-xl bg-sheet-2" />
      ) : dispositivos.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sheet-2 px-4 py-3 text-[16px] text-ink-2">
          Todavía no los tiene en ningún dispositivo. Cuando el portal le pregunte si quiere recibir avisos, elija «Permitir».
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {dispositivos.map((d) => {
            const Icono = /iphone|ipad|android|mobile/i.test(d.user_agent) ? Smartphone : Monitor;
            return (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <Icono aria-hidden="true" size={22} className="shrink-0 text-ink-2" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{d.device_label || "Dispositivo"}</p>
                  {d.updated_at && <p className="text-[15px] text-ink-3">Último aviso el {fechaLarga(d.updated_at)}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="lg"
                  loading={quitando === d.id}
                  icon={<Trash2 aria-hidden="true" size={18} />}
                  onClick={() => void quitar(d.id)}
                  aria-label={`Dejar de avisar en ${d.device_label || "este dispositivo"}`}
                >
                  Quitar
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
