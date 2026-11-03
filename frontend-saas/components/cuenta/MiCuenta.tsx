"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { Mail, MessageCircle, RefreshCw } from "lucide-react";

import { CambioSeguro, type Trato } from "@/components/cuenta/CambioSeguro";
import { Button } from "@/components/ui/Button";
import { Interruptor } from "@/components/ui/Interruptor";
import { useToast } from "@/components/ui/ToastProvider";
import { useSession } from "@/context/SessionContext";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type Cuenta = Esquemas["MiCuenta"];

/** Carga la cuenta propia y la mantiene al día con la sesión. */
export function useMiCuenta() {
  const { refreshUser } = useSession();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await api.GET("/api/v2/cuenta");
    if (data) {
      setCuenta(data);
      setError(null);
    } else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  const actualizar = useCallback(async (nueva?: Cuenta) => {
    if (nueva) setCuenta(nueva);
    else await cargar();
    await refreshUser();
  }, [cargar, refreshUser]);

  /** Cambia la cuenta mostrada sin recargar la sesión (los avisos no la afectan). */
  return { cuenta, error, cargar, actualizar, reemplazar: setCuenta };
}

export function Seccion({ id, titulo, descripcion, children, pie }: { id?: string; titulo: string; descripcion?: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `titulo-${id}` : undefined} className="scroll-mt-24 overflow-hidden rounded-xl bg-sheet shadow-sheet">
      <div className="px-5 pt-5 sm:px-6">
        <h2 id={id ? `titulo-${id}` : undefined} className="font-display text-[20px] leading-snug text-ink">{titulo}</h2>
        {descripcion && <p className="mt-1 text-pretty text-[14px] text-ink-2">{descripcion}</p>}
      </div>
      <div className="px-5 pb-5 pt-4 sm:px-6">{children}</div>
      {pie && <div className="border-t border-line bg-sheet-2 px-5 py-3.5 text-[13.5px] text-ink-2 sm:px-6">{pie}</div>}
    </section>
  );
}

export function CargaCuenta({ error, onReintentar }: { error: string | null; onReintentar: () => void }) {
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
        <p className="flex-1 text-[14px]">{error}</p>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={onReintentar}>Reintentar</Button>
      </div>
    );
  }
  return (
    <div aria-busy="true" className="space-y-6">
      {[0, 1].map((i) => <div key={i} className="skeleton h-44 rounded-xl" />)}
    </div>
  );
}

const CAMPO = "block min-h-11 w-full rounded-lg bg-sheet px-3.5 text-[15px] text-ink shadow-[0_0_0_1px_var(--line-strong)] placeholder:text-ink-3 focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)]";

/** Nombre y datos que salen en los contratos y poderes. */
export function DatosCuenta({ cuenta, trato, onGuardado }: { cuenta: Cuenta; trato: Trato; onGuardado: (c: Cuenta) => void | Promise<void> }) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState(cuenta.nombre);
  const [genero, setGenero] = useState(cuenta.genero ?? "");
  const [documento, setDocumento] = useState(cuenta.numero_documento ?? "");
  const [domicilio, setDomicilio] = useState(cuenta.domicilio ?? "");
  const [tarjeta, setTarjeta] = useState(cuenta.tarjeta_profesional ?? "");
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const cambiado = nombre !== cuenta.nombre || genero !== (cuenta.genero ?? "") || documento !== (cuenta.numero_documento ?? "")
    || domicilio !== (cuenta.domicilio ?? "") || tarjeta !== (cuenta.tarjeta_profesional ?? "");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    const { data, error } = await api.PATCH("/api/v2/cuenta", {
      body: {
        nombre,
        genero: genero as "MASCULINO" | "FEMENINO" | "",
        numero_documento: documento,
        domicilio,
        tarjeta_profesional: tarjeta,
      },
    });
    setGuardando(false);
    if (!data) {
      if (error && "campos" in error && error.campos) setErrores(error.campos);
      toast({ title: "No se guardaron los datos", description: mensajeDeError(error), tone: "error" });
      return;
    }
    setNombre(data.nombre);
    setDocumento(data.numero_documento ?? "");
    setDomicilio(data.domicilio ?? "");
    setTarjeta(data.tarjeta_profesional ?? "");
    toast({ title: "Datos guardados", tone: "success", duration: 2500 });
    await onGuardado(data);
  }

  return (
    <Seccion
      id="datos"
      titulo="Datos personales"
      descripcion={trato === "tu" ? "Así apareces en los contratos y poderes que genera la firma." : "Así aparece en los contratos y documentos que genera la firma."}
    >
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Nombre completo</span>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" className={CAMPO} />
          {errores.nombre && <span className="mt-1 block text-[13.5px] text-bad">{errores.nombre}</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Documento de identidad</span>
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" placeholder="Sin puntos" className={cx(CAMPO, "tabular-nums")} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Ciudad de domicilio</span>
          <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="Ej.: Medellín" className={CAMPO} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Género</span>
          <select value={genero} onChange={(e) => setGenero(e.target.value as typeof genero)} className={CAMPO}>
            <option value="">Sin indicar</option>
            <option value="FEMENINO">Femenino</option>
            <option value="MASCULINO">Masculino</option>
          </select>
          <span className="mt-1 block text-[13px] text-ink-3">Para escribir «la abogada» o «el abogado» en los documentos.</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Tarjeta profesional</span>
          <input value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} placeholder="Número, sin puntos" className={cx(CAMPO, "tabular-nums")} />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={guardando} disabled={!cambiado || !nombre.trim()}>Guardar los datos</Button>
        </div>
      </form>
    </Seccion>
  );
}

function enmascararNumero(numero: string): string {
  const d = numero.replace(/\D/g, "");
  if (d.length < 10) return numero;
  const local = d.slice(-10);
  const pais = d.slice(0, -10);
  return `${pais ? `+${pais} ` : ""}${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Correo, WhatsApp y contraseña, que solo cambian con un código. */
export function SeguridadCuenta({ cuenta, trato, onCambio }: { cuenta: Cuenta; trato: Trato; onCambio: () => void | Promise<void> }) {
  const tieneWhatsapp = Boolean(cuenta.whatsapp);
  const filas: { accion: "email" | "whatsapp" | "password"; etiqueta: string; valor: string; boton: string }[] = [
    { accion: "email", etiqueta: "Correo de acceso", valor: cuenta.email, boton: "Cambiar" },
    { accion: "whatsapp", etiqueta: "WhatsApp", valor: tieneWhatsapp ? enmascararNumero(cuenta.whatsapp) : "Sin registrar", boton: tieneWhatsapp ? "Cambiar" : "Registrar" },
    { accion: "password", etiqueta: "Contraseña", valor: "••••••••", boton: "Cambiar" },
  ];
  return (
    <Seccion
      id="seguridad"
      titulo="Acceso y seguridad"
      descripcion={trato === "tu"
        ? "Para cambiar estos datos te pediremos un código que llega a tu correo o a tu WhatsApp."
        : "Para cambiar estos datos le pediremos un código que llega a su correo o a su WhatsApp."}
    >
      <ul className="divide-y divide-line">
        {filas.map((f) => (
          <li key={f.accion} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-[13px] font-semibold text-ink-3">{f.etiqueta}</p>
              <p className={cx("truncate text-[15px] text-ink", f.accion === "whatsapp" && "tabular-nums", f.valor === "Sin registrar" && "text-ink-3")}>{f.valor}</p>
            </div>
            <CambioSeguro accion={f.accion} titulo={`${f.boton} ${f.etiqueta.toLowerCase().replace("correo de acceso", "el correo").replace("whatsapp", "el WhatsApp").replace("contraseña", "la contraseña")}`} trato={trato} tieneWhatsapp={tieneWhatsapp} onHecho={onCambio} />
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

/** Qué avisos llegan también por correo o WhatsApp, por tipo. */
export function AvisosCuenta({ cuenta, trato, onCambio }: { cuenta: Cuenta; trato: Trato; onCambio: (c: Cuenta) => void }) {
  const { toast } = useToast();
  const [guardando, setGuardando] = useState<string | null>(null);
  const tieneWhatsapp = Boolean(cuenta.whatsapp);

  async function cambiar(tipo: Esquemas["TipoAviso"], canal: "correo" | "whatsapp", valor: boolean) {
    setGuardando(`${tipo.clave}:${canal}`);
    const anterior = cuenta;
    onCambio({ ...cuenta, avisos: cuenta.avisos.map((a) => (a.clave === tipo.clave ? { ...a, [canal]: valor } : a)) });
    const { data, error } = await api.PUT("/api/v2/cuenta/avisos", {
      body: { tipos: { [tipo.clave]: { correo: canal === "correo" ? valor : tipo.correo, whatsapp: canal === "whatsapp" ? valor : tipo.whatsapp } } },
    });
    setGuardando(null);
    if (!data) {
      onCambio(anterior);
      toast({ title: "No se guardó el cambio", description: mensajeDeError(error), tone: "error" });
      return;
    }
    onCambio(data);
  }

  return (
    <Seccion
      id="avisos"
      titulo="Avisos por correo y WhatsApp"
      descripcion={trato === "tu"
        ? "En el panel y en la campana ves todos los avisos. Aquí eliges cuáles te llegan también por correo o WhatsApp."
        : "En el panel y en la campana verá todos los avisos. Aquí elige cuáles le llegan también por correo o WhatsApp."}
      pie={tieneWhatsapp ? undefined : trato === "tu"
        ? "Para recibir avisos por WhatsApp, registra tu número en Mi perfil."
        : "Para recibir avisos por WhatsApp, registre su número en «Acceso y seguridad»."}
    >
      <div role="table" aria-label="Avisos por correo y WhatsApp">
        <div role="row" className="flex items-end gap-2 border-b border-line pb-2 text-[12.5px] font-semibold text-ink-3">
          <span role="columnheader" className="flex-1"><span className="sr-only">Aviso</span></span>
          <span role="columnheader" className="flex w-14 flex-col items-center gap-0.5"><Mail aria-hidden size={16} />Correo</span>
          <span role="columnheader" className="flex w-14 flex-col items-center gap-0.5"><MessageCircle aria-hidden size={16} />WhatsApp</span>
        </div>
        {cuenta.avisos.map((tipo) => (
          <div role="row" key={tipo.clave} className="flex items-center gap-2 border-b border-line py-2.5 last:border-b-0">
            <div role="rowheader" className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">{tipo.nombre}</p>
              <p className="text-pretty text-[13.5px] text-ink-2">{tipo.descripcion}</p>
            </div>
            <span role="cell" className="flex w-14 justify-center">
              <Interruptor activo={tipo.correo} etiqueta={`${tipo.nombre} por correo`} deshabilitado={guardando !== null} onCambio={(v) => void cambiar(tipo, "correo", v)} />
            </span>
            <span role="cell" className="flex w-14 justify-center">
              <Interruptor activo={tipo.whatsapp} etiqueta={`${tipo.nombre} por WhatsApp`} deshabilitado={!tieneWhatsapp || guardando !== null} onCambio={(v) => void cambiar(tipo, "whatsapp", v)} />
            </span>
          </div>
        ))}
      </div>
    </Seccion>
  );
}
