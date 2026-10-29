"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import type { AreaConsulta } from "@/lib/sitio";
import { telefonoLegible } from "@/lib/sitio";
import { enlaceWhatsapp } from "@/lib/whatsapp";

/** Cómo lo dice quien escribe; en la bandeja de la firma se lee con AREA_CONSULTA. */
const AREAS: { id: AreaConsulta; label: string }[] = [
  { id: "familia", label: "Familia o herencia" },
  { id: "empresas", label: "Empresa o contrato" },
  { id: "propiedad_horizontal", label: "Propiedad horizontal" },
  { id: "publico", label: "Entidad pública" },
  { id: "poliza", label: "Póliza jurídica" },
  { id: "otro", label: "Otro asunto" },
];

const CAMPO =
  "block min-h-12 w-full rounded-lg border border-line-strong bg-sheet px-3.5 text-[17px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 focus:border-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/25 aria-[invalid=true]:border-bad";
const ETIQUETA = "mb-2 block text-[15px] font-semibold text-ink";

type Campo = "area" | "nombre" | "contacto" | "mensaje" | "autorizacion";
type Errores = Partial<Record<Campo, string>>;
type Enviado = { primerNombre: string; medio: string };

const ORDEN: Campo[] = ["area", "nombre", "contacto", "mensaje", "autorizacion"];

function separarContacto(valor: string): { telefono: string | null; correo: string | null } {
  const limpio = valor.trim();
  if (!limpio) return { telefono: null, correo: null };
  return limpio.includes("@") ? { telefono: null, correo: limpio.toLowerCase() } : { telefono: limpio, correo: null };
}

function validar(datos: { area: AreaConsulta | null; nombre: string; contacto: string; mensaje: string; autorizacion: boolean }): Errores {
  const errores: Errores = {};
  if (!datos.area) errores.area = "Elija el tema que más se parece a su caso.";
  if (!datos.nombre.trim()) errores.nombre = "Escriba su nombre.";
  const { telefono, correo } = separarContacto(datos.contacto);
  if (!telefono && !correo) errores.contacto = "Deje un WhatsApp, un teléfono o un correo para responderle.";
  else if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errores.contacto = "Revise el correo: debe tener la forma nombre@dominio.com.";
  else if (telefono) {
    const digitos = telefono.replace(/\D/g, "").length;
    if (digitos < 7 || digitos > 15) errores.contacto = "Revise el número: debe tener entre 7 y 15 dígitos.";
  }
  if (datos.mensaje.trim().length < 10) errores.mensaje = "Cuéntenos en una o dos frases qué necesita.";
  if (!datos.autorizacion) errores.autorizacion = "Para responderle necesitamos su autorización para tratar estos datos.";
  return errores;
}

/**
 * Formulario de consulta del sitio. Guarda el mensaje en la bandeja de la
 * firma (Administración › Sitio público) y la firma recibe un aviso por correo.
 * Al enviarlo, la misma hoja muestra la confirmación.
 */
export function FormularioConsulta({
  titulo,
  intro,
  areaInicial,
  whatsapp,
}: {
  titulo: string;
  intro: string;
  areaInicial?: AreaConsulta | null;
  whatsapp?: string | null;
}) {
  const id = useId();
  const tituloId = `${id}-titulo`;
  const formulario = useRef<HTMLFormElement>(null);
  const confirmacion = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<AreaConsulta | null>(areaInicial ?? null);
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [autorizacion, setAutorizacion] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);

  const enfocarPrimerError = (lista: Errores) => {
    const primero = ORDEN.find((campo) => lista[campo]);
    if (!primero) return;
    formulario.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus();
  };

  const limpiarError = (campo: Campo) => setErrores((actual) => (actual[campo] ? { ...actual, [campo]: undefined } : actual));

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrorGeneral(null);
    const lista = validar({ area, nombre, contacto, mensaje, autorizacion });
    setErrores(lista);
    if (Object.keys(lista).length) return enfocarPrimerError(lista);

    const trampa = new FormData(evento.currentTarget).get("website");
    const { telefono, correo } = separarContacto(contacto);
    setEnviando(true);
    try {
      const { error, response } = await api.POST("/api/v2/sitio/mensajes", {
        body: { nombre, telefono, correo, area: area!, mensaje, autorizacion, website: typeof trampa === "string" ? trampa : "" },
      });
      if (error) {
        const campos = (error as { campos?: Record<string, string> }).campos ?? {};
        const delServidor: Errores = {
          ...(campos.nombre && { nombre: campos.nombre }),
          ...((campos.telefono || campos.correo) && {
            contacto: campos.telefono ?? "Revise el correo: debe tener la forma nombre@dominio.com.",
          }),
          ...(campos.mensaje && { mensaje: campos.mensaje }),
          ...(campos.autorizacion && { autorizacion: campos.autorizacion }),
        };
        if (Object.keys(delServidor).length) {
          setErrores(delServidor);
          enfocarPrimerError(delServidor);
        } else {
          setErrorGeneral(
            response.status === 429 && error.mensaje
              ? error.mensaje
              : "No pudimos enviar su mensaje. Revise su conexión e intente de nuevo, o escríbanos por WhatsApp.",
          );
        }
        return;
      }
      const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
      setEnviado({
        primerNombre,
        medio: telefono ? `por WhatsApp o llamada al ${telefonoLegible(telefono)}` : `por correo a ${correo}`,
      });
      requestAnimationFrame(() => confirmacion.current?.focus());
    } catch {
      setErrorGeneral("No pudimos enviar su mensaje. Revise su conexión e intente de nuevo, o escríbanos por WhatsApp.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div ref={confirmacion} tabIndex={-1} role="status" className="sitio-aparece space-y-5 outline-none">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-ok-soft text-ok" aria-hidden="true">
          <Check size={22} strokeWidth={2.25} />
        </span>
        <h2 className="font-display text-[26px] leading-[1.2] text-ink sm:text-[30px]">
          Recibimos su mensaje{enviado.primerNombre ? `, ${enviado.primerNombre}` : ""}.
        </h2>
        <div className="max-w-[56ch] space-y-3 text-[17px] leading-[1.6] text-ink-2">
          <p>Ya le llegó a la firma, que lo lee y le responde {enviado.medio}.</p>
          <p>No tiene que hacer nada más.{whatsapp ? ` Si quiere agregar algo, escríbanos por WhatsApp al ${telefonoLegible(whatsapp)}.` : ""}</p>
        </div>
        <Button variant="secondary" size="lg" onClick={() => {
          setEnviado(null);
          setNombre(""); setContacto(""); setMensaje(""); setAutorizacion(false); setArea(areaInicial ?? null);
        }}>
          Escribir otro mensaje
        </Button>
      </div>
    );
  }

  const error = (campo: Campo) => errores[campo] && (
    <p id={`${id}-${campo}-error`} className="mt-2 flex items-start gap-1.5 text-[15px] text-bad">
      <CircleAlert aria-hidden="true" size={16} strokeWidth={2} className="mt-[3px] shrink-0" />
      {errores[campo]}
    </p>
  );
  const describir = (campo: Campo, ayuda?: string) => cx(errores[campo] && `${id}-${campo}-error`, ayuda) || undefined;

  return (
    <form ref={formulario} noValidate onSubmit={enviar} aria-labelledby={tituloId} className="space-y-5 sm:space-y-6">
      <div>
        <h2 id={tituloId} className="max-w-[30ch] font-display text-[26px] font-normal leading-[1.2] text-ink sm:text-[30px]">{titulo}</h2>
        <p className="mt-3 max-w-[56ch] text-[17px] leading-[1.6] text-ink-2">{intro}</p>
      </div>
      <fieldset aria-describedby={describir("area")}>
        <legend className={ETIQUETA}>¿Sobre qué es su consulta?</legend>
        <div className="flex flex-wrap gap-2">
          {AREAS.map((opcion, i) => {
            const elegida = area === opcion.id;
            return (
              <label
                key={opcion.id}
                className={cx(
                  "relative inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-lg px-3.5 text-[16px] font-semibold transition-[background-color,box-shadow,color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy has-[:focus-visible]:ring-offset-2",
                  elegida
                    ? "bg-navy-soft text-navy-ink shadow-[0_0_0_1.5px_var(--navy)]"
                    : "bg-sheet text-ink-2 shadow-[0_0_0_1px_var(--line-strong)] hover:bg-sheet-2 hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name="area"
                  value={opcion.id}
                  checked={elegida}
                  onChange={() => { setArea(opcion.id); limpiarError("area"); }}
                  data-campo={i === 0 ? "area" : undefined}
                  className="sr-only"
                />
                {elegida && <Check aria-hidden="true" size={16} strokeWidth={2.5} />}
                {opcion.label}
              </label>
            );
          })}
        </div>
        {error("area")}
      </fieldset>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 sm:gap-5">
        <div>
          <label htmlFor={`${id}-nombre`} className={ETIQUETA}>Su nombre</label>
          <input
            id={`${id}-nombre`} data-campo="nombre" name="nombre" autoComplete="name" maxLength={150}
            value={nombre} onChange={(e) => { setNombre(e.target.value); limpiarError("nombre"); }}
            aria-invalid={Boolean(errores.nombre)} aria-describedby={describir("nombre")} className={CAMPO}
          />
          {error("nombre")}
        </div>
        <div>
          <label htmlFor={`${id}-contacto`} className={ETIQUETA}>WhatsApp o correo</label>
          <input
            id={`${id}-contacto`} data-campo="contacto" name="contacto" autoComplete="on" inputMode="text" maxLength={320}
            value={contacto} onChange={(e) => { setContacto(e.target.value); limpiarError("contacto"); }}
            aria-invalid={Boolean(errores.contacto)} aria-describedby={describir("contacto", errores.contacto ? undefined : `${id}-contacto-ayuda`)}
            className={CAMPO}
          />
          {error("contacto") || <p id={`${id}-contacto-ayuda`} className="mt-2 text-[15px] text-ink-3">Le respondemos por ese medio.</p>}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-mensaje`} className={ETIQUETA}>Cuéntenos su caso en pocas palabras</label>
        <textarea
          id={`${id}-mensaje`} data-campo="mensaje" name="mensaje" rows={3} maxLength={3000}
          value={mensaje} onChange={(e) => { setMensaje(e.target.value); limpiarError("mensaje"); }}
          aria-invalid={Boolean(errores.mensaje)} aria-describedby={describir("mensaje", errores.mensaje ? undefined : `${id}-mensaje-ayuda`)}
          className={cx(CAMPO, "min-h-28 resize-y py-3 leading-[1.55]")}
        />
        {error("mensaje") || (
          <p id={`${id}-mensaje-ayuda`} className="mt-2 text-[15px] text-ink-3">No adjunte documentos aquí. Si hacen falta, se los pedimos al responderle.</p>
        )}
      </div>

      {/* Campo trampa: las personas no lo ven; si llega con texto, el mensaje no se guarda. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Sitio web</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-[16px] leading-[1.55] text-ink-2">
          <input
            type="checkbox" data-campo="autorizacion" checked={autorizacion}
            onChange={(e) => { setAutorizacion(e.target.checked); limpiarError("autorizacion"); }}
            aria-invalid={Boolean(errores.autorizacion)} aria-describedby={describir("autorizacion")}
            className="mt-[3px] size-5 shrink-0 accent-navy"
          />
          <span>
            Autorizo a la firma a usar estos datos para responder mi consulta, según la{" "}
            <Link href="/tratamiento-de-datos" className="text-navy underline">política de tratamiento de datos</Link>.
          </span>
        </label>
        {error("autorizacion")}
      </div>

      {errorGeneral && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad-soft px-4 py-3 text-[16px] text-bad">
          <CircleAlert aria-hidden="true" size={18} strokeWidth={2} className="mt-[3px] shrink-0" />
          {errorGeneral}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Button type="submit" size="lg" loading={enviando} className="w-full sm:w-auto">
          Enviar mi consulta
        </Button>
        {whatsapp && (
          <p className="text-[16px] text-ink-2">
            ¿Prefiere escribirnos directamente?{" "}
            <a href={enlaceWhatsapp(whatsapp)} target="_blank" rel="noreferrer" className="whitespace-nowrap font-semibold text-navy underline underline-offset-4">
              WhatsApp {telefonoLegible(whatsapp)}
            </a>
          </p>
        )}
      </div>
    </form>
  );
}
