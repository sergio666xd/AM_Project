"use client";

import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Interruptor } from "@/components/ui/Interruptor";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { fechaConHora } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Datos = Esquemas["DatosFirma"];
type Textos = Esquemas["TextosFirma"];
type Formulario = { [K in keyof Textos]-?: Textos[K] extends boolean | undefined ? boolean : string };

const VACIO: Formulario = {
  nombre: "", correo_contacto: "", correo_pqr: "", telefono: "", whatsapp: "", direccion: "", ciudad: "", pais: "",
  sitio_web: "", logo_url: "", logo_correo_url: "", mostrar_contacto_publico: true,
};

function desde(d: Datos): Formulario {
  return {
    nombre: d.nombre, correo_contacto: d.correo_contacto ?? "", correo_pqr: d.correo_pqr ?? "", telefono: d.telefono ?? "",
    whatsapp: d.whatsapp ?? "", direccion: d.direccion ?? "", ciudad: d.ciudad ?? "", pais: d.pais ?? "",
    sitio_web: d.sitio_web ?? "", logo_url: d.logo_url ?? "", logo_correo_url: d.logo_correo_url ?? "",
    mostrar_contacto_publico: d.mostrar_contacto_publico ?? true,
  };
}

function Grupo({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <Sheet aria-label={titulo}>
      <SheetHeader title={titulo} />
      <div className="px-4 py-4">
        <p className="mb-4 text-[13px] text-ink-2">{descripcion}</p>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </div>
    </Sheet>
  );
}

function Logo({ url, fondo }: { url: string; fondo: "claro" | "navy" }) {
  const [fallo, setFallo] = useState<string | null>(null);
  if (!url) return null;
  return (
    <div className={fondo === "navy" ? "mt-2 rounded-lg bg-navy p-3" : "mt-2 rounded-lg bg-sheet-2 p-3 shadow-[inset_0_0_0_1px_var(--line)]"}>
      {fallo === url ? (
        <p className="text-[13px] text-bad">No se pudo cargar la imagen de esa dirección.</p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Vista del logo" onError={() => setFallo(url)} className="h-12 w-auto max-w-full object-contain" />
      )}
    </div>
  );
}

export function PanelFirma() {
  const id = useId();
  const { toast } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/firma");
    if (data) { setDatos(data); setForm(desde(data)); }
    else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  const cambios = datos ? JSON.stringify(form) !== JSON.stringify(desde(datos)) : false;
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => { if (cambios) e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cambios]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    const { data, error: fallo } = await api.PUT("/api/v2/admin/firma", {
      body: { ...form, correo_contacto: form.correo_contacto || null, correo_pqr: form.correo_pqr || null },
    });
    setGuardando(false);
    if (fallo || !data) {
      const campos = fallo?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "Revise los campos marcados." : mensajeDeError(fallo) });
      return;
    }
    setDatos(data);
    setForm(desde(data));
    toast({ title: "Datos de la firma guardados", description: "El sitio y los próximos correos ya los usan.", tone: "success" });
  }

  const texto = (clave: Exclude<keyof Formulario, "mostrar_contacto_publico">, etiqueta: string, opciones: {
    tipo?: string; ayuda?: string; opcional?: boolean; ancho?: boolean; placeholder?: string; inputMode?: "tel" | "url" | "email";
  } = {}) => (
    <Campo id={`${id}-${clave}`} etiqueta={etiqueta} opcional={opciones.opcional} ayuda={opciones.ayuda} error={errores[clave]}
      className={opciones.ancho ? "sm:col-span-2" : undefined}>
      <input id={`${id}-${clave}`} type={opciones.tipo ?? "text"} inputMode={opciones.inputMode} value={form[clave]}
        placeholder={opciones.placeholder} onChange={(e) => setForm({ ...form, [clave]: e.target.value })} className={CAMPO} />
    </Campo>
  );

  return (
    <div>
      <PageHeader title="Datos de la firma" description="El nombre, el contacto y los logos que se ven en el sitio público, el pie de los correos y los PDF de cobro." />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !datos ? (
        <LoadingState label="Cargando los datos de la firma" rows={6} />
      ) : (
        <form onSubmit={guardar} noValidate className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <Grupo titulo="Nombre y contacto" descripcion="Así aparece la firma ante los clientes. El WhatsApp abre el chat desde el sitio y los correos.">
              {texto("nombre", "Nombre de la firma", { ancho: true })}
              {texto("correo_contacto", "Correo de contacto", { tipo: "email", inputMode: "email", opcional: true })}
              {texto("correo_pqr", "Correo de peticiones, quejas y reclamos", { tipo: "email", inputMode: "email", opcional: true })}
              {texto("telefono", "Teléfono", { tipo: "tel", inputMode: "tel", opcional: true })}
              {texto("whatsapp", "WhatsApp", { tipo: "tel", inputMode: "tel", opcional: true, placeholder: "350 880 9878" })}
            </Grupo>
            <Grupo titulo="Dirección" descripcion="La oficina donde atiende la firma. Sale en el pie de los correos y en el sitio.">
              {texto("direccion", "Dirección", { ancho: true, opcional: true })}
              {texto("ciudad", "Ciudad", { opcional: true })}
              {texto("pais", "País", { opcional: true })}
            </Grupo>
            <Grupo titulo="Sitio y logos" descripcion="Direcciones completas, empezando por https://. Use imágenes PNG o SVG con fondo transparente.">
              {texto("sitio_web", "Sitio web", { inputMode: "url", ancho: true, opcional: true, placeholder: "https://" })}
              <div className="sm:col-span-2">
                {texto("logo_url", "Logo", { inputMode: "url", ayuda: "Se ve sobre fondo azul en el panel y en el sitio." })}
                <Logo url={form.logo_url} fondo="navy" />
              </div>
              <div className="sm:col-span-2">
                {texto("logo_correo_url", "Logo de los correos", { inputMode: "url", opcional: true, ayuda: "Va sobre fondo blanco. Si lo deja vacío, se usa el logo general." })}
                <Logo url={form.logo_correo_url} fondo="claro" />
              </div>
            </Grupo>
          </div>

          <div className="space-y-4 lg:sticky lg:top-4">
            <Sheet aria-label="Sitio público" className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-ink">Mostrar el contacto en el sitio</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">Correo, teléfono, WhatsApp y dirección en el pie y en la página de contacto.</p>
                </div>
                <Interruptor etiqueta="Mostrar el contacto en el sitio" activo={form.mostrar_contacto_publico}
                  onCambio={(v) => setForm({ ...form, mostrar_contacto_publico: v })} />
              </div>
            </Sheet>
            <Sheet aria-label="Guardar" className="px-4 py-4">
              {errores.general && <p role="alert" className="mb-3 text-[13px] text-bad">{errores.general}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" loading={guardando} disabled={!cambios}>Guardar</Button>
                {cambios && <Button type="button" variant="ghost" onClick={() => { setForm(desde(datos)); setErrores({}); }}>Descartar cambios</Button>}
              </div>
              <p className="mt-3 text-[12.5px] text-ink-3">
                {cambios ? "Hay cambios sin guardar." : datos.actualizado_en
                  ? `Guardado el ${fechaConHora(datos.actualizado_en)}${datos.actualizado_por ? ` por ${datos.actualizado_por}` : ""}`
                  : "Aún no se ha guardado ningún cambio."}
              </p>
            </Sheet>
          </div>
        </form>
      )}
    </div>
  );
}
