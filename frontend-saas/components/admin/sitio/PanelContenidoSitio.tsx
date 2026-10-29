"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button, clasesBoton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { Interruptor } from "@/components/ui/Interruptor";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { fechaConHora } from "@/lib/fechas";
import { mezclarContenido } from "@/lib/mezclarContenido";
import { urlSitioPublico } from "@/lib/portalHosts";
import { SITE_PAGE_DEFAULTS, SITE_PAGE_LABELS, type PublicPageSlug } from "@/lib/sitePageDefaults";
import { useValorDeUrl } from "@/lib/useAccionDeUrl";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { GRUPOS, TEMAS, prepararContenido, primerFaltante, type Campo } from "./camposContenido";

type Objeto = Record<string, unknown>;
type PaginaSitio = Esquemas["PaginaSitio"];

const SLUGS = Object.keys(SITE_PAGE_DEFAULTS) as PublicPageSlug[];
const esSlug = (valor: string): valor is PublicPageSlug => (SLUGS as string[]).includes(valor);

/** El contenido tal como lo ve el formulario: texto base con lo guardado encima. */
function contenidoDe(slug: PublicPageSlug, guardado: unknown): Objeto {
  return prepararContenido(slug, mezclarContenido(SITE_PAGE_DEFAULTS[slug] as unknown as Objeto, guardado ?? null));
}

/** Quita líneas vacías de las listas de una línea por elemento antes de guardar. */
function limpiar(campos: Campo[], valor: Objeto): Objeto {
  const salida: Objeto = { ...valor };
  for (const campo of campos) {
    const actual = salida[campo.clave];
    if (campo.tipo === "lineas" && Array.isArray(actual)) {
      salida[campo.clave] = actual.map((l) => String(l).trim()).filter(Boolean);
    } else if (campo.tipo === "lista" && Array.isArray(actual)) {
      salida[campo.clave] = actual.map((item) => limpiar(campo.campos, item as Objeto));
    }
  }
  return salida;
}

function limpiarPagina(slug: PublicPageSlug, contenido: Objeto): Objeto {
  let salida = contenido;
  for (const grupo of GRUPOS[slug]) {
    if (grupo.dentroDe) salida = { ...salida, [grupo.dentroDe]: limpiar(grupo.campos, (salida[grupo.dentroDe] as Objeto) ?? {}) };
    else salida = limpiar(grupo.campos, salida);
  }
  return salida;
}

const idDeRuta = (ruta: string) => `contenido-${ruta.replaceAll(".", "-")}`;

// Los elementos de una lista se reconocen por objeto, no por posición, para
// que al moverlos cada uno conserve si estaba abierto.
const ids = new WeakMap<object, string>();
let siguienteId = 0;
function idDe(objeto: object) {
  let id = ids.get(objeto);
  if (!id) ids.set(objeto, (id = `e${++siguienteId}`));
  return id;
}

function CampoContenido({ campo, valor, ruta, onCambio, faltante, nuevos, soloEnLista = false }: {
  campo: Campo;
  valor: unknown;
  ruta: string;
  onCambio: (valor: unknown) => void;
  faltante: string | null;
  nuevos: Set<string>;
  /** La lista es lo único del grupo: su título ya lo dice el encabezado. */
  soloEnLista?: boolean;
}) {
  const id = idDeRuta(ruta);
  const error = faltante === ruta;

  if (campo.tipo === "interruptor") {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold text-ink">{campo.etiqueta}</p>
          {campo.ayuda && <p className="mt-0.5 text-[13px] text-ink-3">{campo.ayuda}</p>}
        </div>
        <Interruptor activo={valor === true} onCambio={onCambio} etiqueta={campo.etiqueta} />
      </div>
    );
  }

  if (campo.tipo === "lista") {
    const items = Array.isArray(valor) ? (valor as Objeto[]) : [];
    const mover = (desde: number, hasta: number) => {
      const copia = [...items];
      const [item] = copia.splice(desde, 1);
      copia.splice(hasta, 0, item);
      onCambio(copia);
    };
    const nombre = campo.singular.charAt(0).toUpperCase() + campo.singular.slice(1);
    return (
      <fieldset className="min-w-0">
        <legend className={soloEnLista ? "sr-only" : ETIQUETA}>{campo.etiqueta}</legend>
        {campo.ayuda && <p className="-mt-1 mb-2 text-[13px] text-ink-3">{campo.ayuda}</p>}
        <ol className="space-y-2">
          {items.map((item, i) => {
            const clave = idDe(item);
            const resumen = String(item.title ?? item.question ?? "").trim();
            return (
              <li key={clave}>
                <details open={nuevos.has(clave) || undefined} className="group rounded-lg bg-sheet shadow-[inset_0_0_0_1px_var(--line-strong)] open:bg-sheet-2/60">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-1 pl-3 pr-1 [&::-webkit-details-marker]:hidden">
                    <ChevronRight aria-hidden="true" size={16} strokeWidth={2} className="shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-90" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      <span className="font-semibold text-ink">{nombre} {i + 1}</span>
                      <span className="text-ink-2">{resumen ? ` · ${resumen}` : " · sin nombre"}</span>
                    </span>
                    <span className="flex shrink-0" onClick={(e) => e.preventDefault()}>
                      <IconButton icon={ArrowUp} label={`Subir ${campo.singular} ${i + 1}`} disabled={i === 0} onClick={() => mover(i, i - 1)} className="disabled:opacity-30" />
                      <IconButton icon={ArrowDown} label={`Bajar ${campo.singular} ${i + 1}`} disabled={i === items.length - 1} onClick={() => mover(i, i + 1)} className="disabled:opacity-30" />
                      <IconButton icon={Trash2} label={`Quitar ${campo.singular} ${i + 1}`} onClick={() => onCambio(items.filter((_, j) => j !== i))} className="hover:bg-bad-soft hover:text-bad" />
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t border-line px-3 py-4 sm:px-4">
                    {campo.campos.map((hijo) => (
                      <CampoContenido
                        key={hijo.clave}
                        campo={hijo}
                        valor={item[hijo.clave]}
                        ruta={`${ruta}.${i}.${hijo.clave}`}
                        faltante={faltante}
                        nuevos={nuevos}
                        onCambio={(v) => {
                          const nuevo = { ...item, [hijo.clave]: v };
                          ids.set(nuevo, clave);
                          onCambio(items.map((x, j) => (j === i ? nuevo : x)));
                        }}
                      />
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
        {!items.length && <p className="rounded-lg bg-sheet-2 px-3 py-3 text-[14px] text-ink-2">Esta sección no se muestra mientras no tenga elementos.</p>}
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          className="mt-2"
          onClick={() => {
            const nuevo = campo.nuevo();
            nuevos.add(idDe(nuevo));
            onCambio([...items, nuevo]);
          }}
        >
          Agregar {campo.singular}
        </Button>
      </fieldset>
    );
  }

  const ayuda = campo.ayuda && <p id={`${id}-ayuda`} className="mt-1.5 text-[13px] text-ink-3">{campo.ayuda}</p>;

  if (campo.tipo === "tema") {
    return (
      <div>
        <label htmlFor={id} className={ETIQUETA}>{campo.etiqueta}</label>
        <select id={id} value={typeof valor === "string" ? valor : ""} onChange={(e) => onCambio(e.target.value)} aria-describedby={campo.ayuda ? `${id}-ayuda` : undefined} className={cx(CAMPO, "sm:max-w-xs")}>
          {TEMAS.map((t) => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
        </select>
        {ayuda}
      </div>
    );
  }

  if (campo.tipo === "lineas") {
    const lineas = Array.isArray(valor) ? (valor as unknown[]).map(String) : [];
    return (
      <div>
        <label htmlFor={id} className={ETIQUETA}>{campo.etiqueta}</label>
        <textarea
          id={id}
          value={lineas.join("\n")}
          onChange={(e) => onCambio(e.target.value.split("\n"))}
          rows={Math.min(12, Math.max(3, lineas.length + 1))}
          aria-describedby={campo.ayuda ? `${id}-ayuda` : undefined}
          className={cx(CAMPO, "h-auto py-2.5 leading-[1.55] [field-sizing:content]")}
        />
        {ayuda}
      </div>
    );
  }

  const texto = typeof valor === "string" ? valor : "";
  const describe = [error && `${id}-error`, campo.ayuda && `${id}-ayuda`].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA}>{campo.etiqueta}</label>
      {campo.largo ? (
        <textarea
          id={id}
          value={texto}
          onChange={(e) => onCambio(e.target.value)}
          rows={campo.bloques ? Math.min(18, Math.max(5, Math.ceil(texto.length / 90) + texto.split("\n").length)) : 3}
          aria-invalid={error || undefined}
          aria-describedby={describe}
          className={cx(CAMPO, "h-auto py-2.5 leading-[1.55] [field-sizing:content]", error && "border-bad")}
        />
      ) : (
        <input id={id} value={texto} onChange={(e) => onCambio(e.target.value)} aria-invalid={error || undefined} aria-describedby={describe} className={cx(CAMPO, error && "border-bad")} />
      )}
      {error && <p id={`${id}-error`} className="mt-1.5 text-[13px] text-bad">Este campo no puede quedar vacío.</p>}
      {ayuda}
    </div>
  );
}

function AyudaFormato() {
  return (
    <details className="group rounded-lg bg-sheet-2 text-[14px] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" size={16} strokeWidth={2} className="text-ink-3 transition-transform duration-150 group-open:rotate-90" />
        Cómo dar formato al texto
      </summary>
      <div className="grid gap-x-8 gap-y-1.5 border-t border-line px-3 py-3 sm:grid-cols-2">
        <p><code className="font-mono text-[13px] text-ink">**palabras**</code> se ven en <strong className="font-semibold text-ink">negrita</strong></p>
        <p><code className="font-mono text-[13px] text-ink">*palabras*</code> se ven en <em>cursiva</em></p>
        <p><code className="font-mono text-[13px] text-ink">__palabras__</code> se ven <span className="underline underline-offset-2">subrayadas</span></p>
        <p><code className="font-mono text-[13px] text-ink">[texto](https://…)</code> crea un enlace</p>
        <p className="sm:col-span-2">En los textos largos, una línea vacía separa párrafos, <code className="font-mono text-[13px] text-ink">- </code> al empezar la línea crea una lista y <code className="font-mono text-[13px] text-ink">&gt; </code> una cita destacada.</p>
      </div>
    </details>
  );
}

/** Editor de los textos del sitio público, página por página. */
export function PanelContenidoSitio() {
  const { toast } = useToast();
  const [paginas, setPaginas] = useState<PaginaSitio[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [slug, setSlug] = useState<PublicPageSlug>("inicio");
  const [cargada, setCargada] = useState<PublicPageSlug | null>(null);
  const [errorPagina, setErrorPagina] = useState<string | null>(null);
  const [base, setBase] = useState<Objeto>(() => contenidoDe("inicio", null));
  const [borrador, setBorrador] = useState<Objeto>(base);
  const [guardando, setGuardando] = useState(false);
  const [faltante, setFaltante] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<PublicPageSlug | null>(null);
  const [restaurar, setRestaurar] = useState(false);
  // Elementos agregados en esta edición: se muestran abiertos.
  const [nuevos] = useState(() => new Set<string>());
  const pedida = useRef(0);

  const sucio = cargada === slug && JSON.stringify(borrador) !== JSON.stringify(base);
  const pagina = paginas?.find((p) => p.slug === slug);

  const cargarLista = useCallback(async () => {
    setErrorLista(null);
    const { data, error } = await api.GET("/api/v2/admin/sitio/paginas");
    if (error || !data) setErrorLista(mensajeDeError(error));
    else setPaginas(data);
  }, []);
  useLoadEffect(cargarLista);

  const cargarPagina = useCallback(async (cual: PublicPageSlug) => {
    const esta = ++pedida.current;
    setErrorPagina(null);
    setCargada(null);
    const { data, error } = await api.GET("/api/v2/admin/sitio/paginas/{slug}", { params: { path: { slug: cual } } });
    if (esta !== pedida.current) return;
    if (error || !data) {
      setErrorPagina(mensajeDeError(error));
      return;
    }
    const contenido = contenidoDe(cual, data.contenido);
    nuevos.clear();
    setBase(contenido);
    setBorrador(contenido);
    setFaltante(null);
    setCargada(cual);
  }, [nuevos]);
  useLoadEffect(useCallback(() => cargarPagina(slug), [slug, cargarPagina]));

  // ?pagina=contacto llega desde la actividad.
  useValorDeUrl("pagina", useCallback((valor: string) => { if (esSlug(valor)) setSlug(valor); }, []));

  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  function elegir(cual: PublicPageSlug) {
    if (cual === slug) return;
    if (sucio) setPendiente(cual);
    else setSlug(cual);
  }

  function actualizarLista(detalle: Esquemas["PaginaSitioDetalle"]) {
    const { contenido: _contenido, ...resumen } = detalle;
    void _contenido;
    setPaginas((ps) => ps?.map((p) => (p.slug === detalle.slug ? resumen : p)) ?? ps);
  }

  async function guardar() {
    const limpio = limpiarPagina(slug, borrador);
    const falta = primerFaltante(GRUPOS[slug], limpio);
    if (falta) {
      setFaltante(falta.ruta);
      const campo = document.getElementById(idDeRuta(falta.ruta));
      // Abre las secciones plegadas que lo contienen antes de llevar el foco.
      for (let d = campo?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
      campo?.focus();
      toast({ title: "Falta un dato", description: falta.mensaje, tone: "error" });
      return;
    }
    setFaltante(null);
    setGuardando(true);
    const { data, error } = await api.PUT("/api/v2/admin/sitio/paginas/{slug}", { params: { path: { slug } }, body: { contenido: limpio } });
    setGuardando(false);
    if (error || !data) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(error), tone: "error" });
      return;
    }
    const contenido = contenidoDe(slug, data.contenido);
    setBase(contenido);
    setBorrador(contenido);
    actualizarLista(data);
    toast({ title: "Página publicada", description: "Los cambios ya se ven en el sitio.", tone: "success" });
  }

  async function volverAlBase() {
    const { data, error } = await api.DELETE("/api/v2/admin/sitio/paginas/{slug}", { params: { path: { slug } } });
    if (error || !data) throw new Error(mensajeDeError(error));
    const contenido = contenidoDe(slug, null);
    nuevos.clear();
    setBase(contenido);
    setBorrador(contenido);
    actualizarLista(data);
    toast({ title: "La página volvió a su texto base", tone: "success" });
  }

  const nombre = pagina?.nombre ?? SITE_PAGE_LABELS[slug];

  return (
    // El espacio al final deja libre el último campo del botón de chat.
    <div className="pb-20">
      <PageHeader title="Contenido del sitio" description="Los textos de cada página del sitio web. Lo que guarde se publica de inmediato." />

      {errorLista ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{errorLista}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargarLista()}>Reintentar</Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start">
          <div className="lg:hidden">
            <label htmlFor="contenido-pagina" className={ETIQUETA}>Página</label>
            <select id="contenido-pagina" value={slug} onChange={(e) => elegir(e.target.value as PublicPageSlug)} className={CAMPO}>
              {SLUGS.map((s) => <option key={s} value={s}>{paginas?.find((p) => p.slug === s)?.nombre ?? SITE_PAGE_LABELS[s]}</option>)}
            </select>
          </div>
          <Sheet aria-label="Páginas del sitio" className="max-lg:hidden lg:sticky lg:top-4">
            <ul className="p-1.5">
              {SLUGS.map((s) => {
                const p = paginas?.find((x) => x.slug === s);
                const actual = s === slug;
                return (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => elegir(s)}
                      aria-current={actual ? "page" : undefined}
                      className={cx(
                        "flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors duration-150",
                        actual ? "bg-manila" : "hover:bg-sheet-2",
                      )}
                    >
                      <span className={cx("text-[14px]", actual ? "font-semibold text-ink" : "text-ink")}>{p?.nombre ?? SITE_PAGE_LABELS[s]}</span>
                      <span className="text-[12.5px] text-ink-3">{!p ? " " : p.editada ? "Con cambios propios" : "Texto base"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Sheet>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-[22px] leading-tight text-ink">{nombre}</h2>
                <p className="mt-1 text-[13px] text-ink-3">
                  {!pagina ? " " : pagina.editada && pagina.actualizada_en
                    ? `Guardada el ${fechaConHora(pagina.actualizada_en)}${pagina.actualizada_por ? ` por ${pagina.actualizada_por}` : ""}`
                    : "Usa el texto con que se creó el sitio"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pagina?.editada && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setRestaurar(true)}>Volver al texto base</Button>
                )}
                <a href={urlSitioPublico(pagina?.ruta ?? SITE_PAGE_DEFAULTS[slug].route)} target="_blank" rel="noreferrer" className={clasesBoton("secondary", "sm")}>
                  <ExternalLink aria-hidden="true" size={14} /> Ver la página
                </a>
              </div>
            </div>

            {errorPagina ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
                <p className="flex-1 text-[14px]">{errorPagina}</p>
                <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargarPagina(slug)}>Reintentar</Button>
              </div>
            ) : cargada !== slug ? (
              <LoadingState label="Cargando la página" rows={4} />
            ) : (
              <>
                <AyudaFormato />
                {GRUPOS[slug].map((grupo) => {
                  const valores = grupo.dentroDe ? ((borrador[grupo.dentroDe] as Objeto) ?? {}) : borrador;
                  const cambiar = (clave: string, v: unknown) =>
                    setBorrador((b) => (grupo.dentroDe ? { ...b, [grupo.dentroDe]: { ...((b[grupo.dentroDe] as Objeto) ?? {}), [clave]: v } } : { ...b, [clave]: v }));
                  return (
                    <Sheet key={grupo.titulo} aria-label={grupo.titulo}>
                      <SheetHeader title={grupo.titulo} />
                      <div className="px-4 py-4">
                        {grupo.descripcion && <p className="mb-4 text-[13px] text-ink-2">{grupo.descripcion}</p>}
                        <div className="grid gap-4">
                          {grupo.campos.map((campo) => (
                            <CampoContenido
                              key={campo.clave}
                              campo={campo}
                              valor={valores[campo.clave]}
                              ruta={grupo.dentroDe ? `${grupo.dentroDe}.${campo.clave}` : campo.clave}
                              faltante={faltante}
                              nuevos={nuevos}
                              soloEnLista={grupo.campos.length === 1}
                              onCambio={(v) => cambiar(campo.clave, v)}
                            />
                          ))}
                        </div>
                      </div>
                    </Sheet>
                  );
                })}
              </>
            )}

            {sucio && (
              <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mr-[60px] flex lg:bottom-4 lg:mr-16 flex-wrap items-center justify-between gap-3 rounded-xl bg-sheet px-4 py-3 shadow-[0_0_0_1px_var(--line-strong),0_8px_24px_rgb(24_32_58/0.14)]">
                <p className="text-[14px] font-semibold text-ink">Hay cambios sin publicar en {nombre}</p>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={guardando} onClick={() => { setBorrador(base); setFaltante(null); }}>Descartar</Button>
                  <Button loading={guardando} onClick={() => void guardar()}>Guardar y publicar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendiente !== null}
        onClose={() => setPendiente(null)}
        onConfirm={() => { if (pendiente) setSlug(pendiente); }}
        title="¿Dejar los cambios sin publicar?"
        description={`Los cambios en ${nombre} se pierden si cambia de página sin guardarlos.`}
        confirmLabel="Cambiar de página"
        cancelLabel="Seguir editando"
        destructive
      />
      <ConfirmDialog
        open={restaurar}
        onClose={() => setRestaurar(false)}
        onConfirm={volverAlBase}
        title="¿Volver al texto base?"
        description={`Se borran los cambios guardados en ${nombre} y vuelve el texto con que se creó el sitio. Esto no se puede deshacer.`}
        confirmLabel="Volver al texto base"
        destructive
      />
    </div>
  );
}
