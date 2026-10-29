"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { useValorDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Fila = Esquemas["PlantillaAvisoFila"];
type Plantilla = Esquemas["PlantillaAviso"];
type Textos = Esquemas["TextosPlantillaAviso"];
type CampoTexto = keyof Textos;
type Vista = "correo" | "whatsapp" | "navegador";

const AREA = cx(CAMPO, "min-h-0 py-2.5 font-mono text-[13.5px] leading-relaxed sm:text-[13px]");
const MARCAS: [string, string][] = [
  ["# Título", "El título del correo."],
  ["> Texto", "Explicación en palabras sencillas (caja manila)."],
  ["! Texto", "Lo que la persona debe hacer, con fecha (caja dorada)."],
  ["Etiqueta: valor", "Líneas seguidas forman la ficha de datos."],
  ["? Texto", "A quién escribir si tiene dudas."],
];

function textos(p: Plantilla): Textos {
  return { asunto: p.asunto, cuerpo_email: p.cuerpo_email, cuerpo_whatsapp: p.cuerpo_whatsapp, titulo_push: p.titulo_push, cuerpo_push: p.cuerpo_push };
}

function iguales(a: Textos, b: Textos) {
  return (Object.keys(a) as CampoTexto[]).every((k) => (a[k] ?? "") === (b[k] ?? ""));
}

function Lista({ filas, actual, onElegir }: { filas: Fila[]; actual: string | null; onElegir: (clave: string) => void }) {
  const [q, setQ] = useState("");
  const termino = q.trim().toLowerCase();
  const visibles = filas.filter((f) => !termino || f.nombre.toLowerCase().includes(termino));
  return (
    <Sheet aria-label="Avisos" className="lg:sticky lg:top-4">
      <div className="border-b border-line p-2">
        <label className="relative block">
          <span className="sr-only">Buscar un aviso</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un aviso" className={cx(CAMPO, "h-10 pl-9 sm:min-h-10")} />
        </label>
      </div>
      <ul className="max-h-[40vh] overflow-y-auto p-1 lg:max-h-[calc(100dvh-12rem)]">
        {visibles.map((f) => (
          <li key={f.clave}>
            <button
              type="button"
              aria-current={f.clave === actual ? "true" : undefined}
              onClick={() => onElegir(f.clave)}
              className={cx(
                "flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left transition-colors",
                f.clave === actual ? "bg-manila text-ink" : "text-ink-2 hover:bg-sheet-2 hover:text-ink",
              )}
            >
              <span className={cx("text-[14px]", f.clave === actual && "font-semibold")}>{f.nombre}</span>
            </button>
          </li>
        ))}
        {!visibles.length && <li className="px-3 py-4 text-[13.5px] text-ink-2">Ningún aviso se llama así.</li>}
      </ul>
    </Sheet>
  );
}

// WhatsApp pone en negrita lo que va entre asteriscos.
function conNegritas(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    /^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte,
  );
}

function BurbujaWhatsapp({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
      <p className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[14px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
        {conNegritas(texto)}
      </p>
    </div>
  );
}

function AvisoNavegador({ titulo, cuerpo }: { titulo: string | null; cuerpo: string | null }) {
  return (
    <div className="rounded-lg bg-sheet-2 p-4">
      <div className="max-w-sm rounded-xl bg-sheet px-4 py-3 shadow-pop">
        <p className="text-[14px] font-semibold text-ink">{titulo || "Sin título"}</p>
        <p className="mt-0.5 text-[13.5px] text-ink-2">{cuerpo || "Sin texto"}</p>
      </div>
    </div>
  );
}

function Editor({ plantilla, onGuardada, onCambios }: { plantilla: Plantilla; onGuardada: (p: Plantilla) => void; onCambios: (hay: boolean) => void }) {
  const id = useId();
  const { toast } = useToast();
  const [form, setForm] = useState<Textos>(() => textos(plantilla));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<Vista>("correo");
  const [previa, setPrevia] = useState<Esquemas["VistaPrevia"] | null>(null);
  const [errorPrevia, setErrorPrevia] = useState<string | null>(null);
  const ultimoCampo = useRef<{ campo: CampoTexto; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const tienePush = plantilla.tiene_push;
  const cambios = !iguales(form, textos(plantilla));

  useEffect(() => onCambios(cambios), [cambios, onCambios]);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      const { data, error } = await api.POST("/api/v2/admin/plantillas/{clave}/vista-previa", {
        params: { path: { clave: plantilla.clave } },
        body: { ...form, asunto: form.asunto || " ", cuerpo_email: form.cuerpo_email || " ", cuerpo_whatsapp: form.cuerpo_whatsapp || " " },
      });
      if (data) { setPrevia(data); setErrorPrevia(null); }
      else setErrorPrevia(mensajeDeError(error));
    }, 450);
    return () => window.clearTimeout(t);
  }, [form, plantilla.clave]);

  function cambiar(campo: CampoTexto, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function enfocar(campo: CampoTexto) {
    return (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { ultimoCampo.current = { campo, el: e.currentTarget }; };
  }

  function insertar(variable: string) {
    const destino = ultimoCampo.current;
    const token = `{{${variable}}}`;
    if (!destino) {
      cambiar("cuerpo_email", `${form.cuerpo_email}${token}`);
      return;
    }
    const { campo, el } = destino;
    const actual = form[campo] ?? "";
    const inicio = el.selectionStart ?? actual.length;
    const fin = el.selectionEnd ?? actual.length;
    cambiar(campo, actual.slice(0, inicio) + token + actual.slice(fin));
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicio + token.length, inicio + token.length);
    });
  }

  async function guardar() {
    setGuardando(true);
    setErrores({});
    const { data, error } = await api.PUT("/api/v2/admin/plantillas/{clave}", { params: { path: { clave: plantilla.clave } }, body: form });
    setGuardando(false);
    if (error || !data) {
      const campos = error?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "" : mensajeDeError(error) });
      return;
    }
    toast({ title: "Aviso guardado", description: "Los próximos envíos usan este texto.", tone: "success" });
    onGuardada(data);
  }

  const campo = (clave: CampoTexto, etiqueta: string, filas?: number, ayuda?: string) => (
    <Campo id={`${id}-${clave}`} etiqueta={etiqueta} error={errores[clave]} ayuda={ayuda}>
      {filas ? (
        <textarea id={`${id}-${clave}`} rows={filas} value={form[clave] ?? ""} onFocus={enfocar(clave)} onChange={(e) => cambiar(clave, e.target.value)} className={AREA} spellCheck />
      ) : (
        <input id={`${id}-${clave}`} value={form[clave] ?? ""} onFocus={enfocar(clave)} onChange={(e) => cambiar(clave, e.target.value)} className={CAMPO} spellCheck />
      )}
    </Campo>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Sheet aria-labelledby={`${id}-t`}>
        <SheetHeader title={<span id={`${id}-t`}>Texto del aviso</span>} />
        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="text-[13px] font-semibold text-ink-2">Datos que puede usar</p>
            <p className="mt-0.5 text-[13px] text-ink-3">Toque uno para ponerlo donde está escribiendo. El botón con el enlace lo agrega la plataforma.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plantilla.variables.map((v) => (
                <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertar(v)}
                  className="min-h-8 rounded-md bg-sheet-2 px-2 font-mono text-[12.5px] text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] transition-colors hover:bg-manila">
                  {v}
                </button>
              ))}
              {!plantilla.variables.length && <span className="text-[13px] text-ink-3">Este aviso no lleva datos variables.</span>}
            </div>
          </div>
          {campo("asunto", "Asunto del correo")}
          {campo("cuerpo_email", "Texto del correo", 12)}
          <details className="group rounded-lg bg-sheet-2 px-3 py-2 text-[13px] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <summary className="cursor-pointer select-none font-semibold text-ink">Cómo dar formato al correo</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {MARCAS.map(([marca, que]) => (
                <div key={marca} className="contents">
                  <dt className="font-mono text-[12.5px] text-ink">{marca}</dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
          </details>
          {campo("cuerpo_whatsapp", "Texto de WhatsApp", 7, "Corto: lo esencial y el enlace. Use *texto* para negrita.")}
          {tienePush && (
            <>
              {campo("titulo_push", "Título del aviso en el navegador")}
              {campo("cuerpo_push", "Texto del aviso en el navegador", 3)}
            </>
          )}
          {errores.general && <p role="alert" className="text-[13px] text-bad">{errores.general}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void guardar()} loading={guardando} disabled={!cambios}>Guardar</Button>
            {cambios && (
              <>
                <Button variant="ghost" onClick={() => setForm(textos(plantilla))}>Descartar cambios</Button>
                <span className="text-[13px] text-ink-2">Hay cambios sin guardar.</span>
              </>
            )}
          </div>
        </div>
      </Sheet>

      <Sheet aria-label="Vista previa" className="2xl:sticky 2xl:top-4 2xl:self-start">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
          <h2 className="text-[14px] font-semibold text-ink">Así le llega</h2>
          <SegmentedControl<Vista>
            label="Canal de la vista previa"
            value={vista}
            onChange={setVista}
            options={[
              { value: "correo", label: "Correo" },
              { value: "whatsapp", label: "WhatsApp" },
              ...(tienePush ? [{ value: "navegador" as const, label: "Navegador" }] : []),
            ]}
          />
        </div>
        <div className="p-4">
          {errorPrevia && <p role="status" className="mb-3 text-[13px] text-bad">{errorPrevia}</p>}
          {!previa ? <LoadingState label="Preparando la vista previa" rows={4} /> : vista === "correo" ? (
            <div>
              <p className="mb-2 text-[13px] text-ink-2">Asunto: <span className="font-semibold text-ink">{previa.asunto}</span></p>
              <iframe title="Vista previa del correo" sandbox="" srcDoc={previa.html} className="h-[640px] w-full rounded-lg bg-[#f6f2e8] shadow-[inset_0_0_0_1px_var(--line)]" />
            </div>
          ) : vista === "whatsapp" ? (
            <BurbujaWhatsapp texto={previa.whatsapp} />
          ) : (
            <AvisoNavegador titulo={previa.titulo_push} cuerpo={previa.cuerpo_push} />
          )}
          <p className="mt-3 text-[12.5px] text-ink-3">Con datos de ejemplo. Los reales cambian en cada envío.</p>
        </div>
      </Sheet>
    </div>
  );
}

export function PanelPlantillas() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [actual, setActual] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const cambiosPendientes = useRef(false);
  const marcarCambios = useCallback((hay: boolean) => { cambiosPendientes.current = hay; }, []);

  useValorDeUrl("plantilla", setActual);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/plantillas");
    if (fallo || !data) { setError(mensajeDeError(fallo)); return; }
    setFilas(data);
    setActual((a) => a ?? data[0]?.clave ?? null);
  }, []);
  useLoadEffect(cargar);

  const cargarDetalle = useCallback(async () => {
    if (!actual) return;
    setErrorDetalle(null);
    const { data, error: fallo } = await api.GET("/api/v2/admin/plantillas/{clave}", { params: { path: { clave: actual } } });
    if (fallo || !data) setErrorDetalle(mensajeDeError(fallo));
    else setPlantilla(data);
  }, [actual]);
  useLoadEffect(cargarDetalle);

  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => { if (cambiosPendientes.current) e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, []);

  function elegir(clave: string) {
    if (clave === actual) return;
    if (cambiosPendientes.current && !window.confirm("Tiene cambios sin guardar en este aviso. ¿Salir sin guardarlos?")) return;
    cambiosPendientes.current = false;
    setActual(clave);
    setPlantilla(null);
  }

  function guardada(p: Plantilla) {
    setPlantilla(p);
    setFilas((fs) => fs?.map((f) => (f.clave === p.clave ? { ...f, actualizada_en: p.actualizada_en } : f)) ?? fs);
  }

  return (
    <div>
      <PageHeader title="Plantillas de avisos" description="El texto de cada aviso que la plataforma envía por correo, WhatsApp y el navegador." />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !filas ? (
        <LoadingState label="Cargando las plantillas" rows={6} />
      ) : !filas.length ? (
        <Sheet className="px-4 py-6 text-[14px] text-ink-2">No hay plantillas de avisos. Se crean al instalar la plataforma; avise a soporte.</Sheet>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Lista filas={filas} actual={actual} onElegir={elegir} />
          <div className="min-w-0">
            {plantilla && (
              <h2 className="mb-3 font-display text-[22px] leading-tight text-ink [text-wrap:balance]">{plantilla.nombre}</h2>
            )}
            {errorDetalle ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
                <p className="flex-1 text-[14px]">{errorDetalle}</p>
                <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargarDetalle()}>Reintentar</Button>
              </div>
            ) : !plantilla ? (
              <LoadingState label="Cargando el aviso" rows={6} />
            ) : (
              <Editor key={plantilla.clave + plantilla.actualizada_en} plantilla={plantilla} onGuardada={guardada} onCambios={marcarCambios} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
