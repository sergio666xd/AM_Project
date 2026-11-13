"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bold, Braces, CalendarDays, CheckCircle2, Copy, FileSignature, FileText, Heading1, Heading2, Info, Italic, List, ListOrdered,
  Minus, PanelRightClose, PanelRightOpen, Pencil, Plus, Scale, Trash2, UserRound, ZoomIn, ZoomOut,
} from "lucide-react";

import { Hoja } from "@/components/contratos/Hoja";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import {
  CAMPOS_FIJOS, ETIQUETA_FIJA, PREFIJOS_RESERVADOS, TIPOS, camposUsados, firmantes, revisar, usaCodigo, type Campo, type TipoCampo,
} from "@/lib/contratos/motor";
import { cx } from "@/lib/cx";
import { fechaCorta } from "@/lib/fechas";

export type Plantilla = Esquemas["PlantillaDeContrato"];
type Borrador = { id: number | null; nombre: string; descripcion: string; cuerpo: string; campos: Campo[]; firmas: { abogado: string } };

const ICONOS_FIJOS = { Notificaciones: UserRound, Proceso: Scale, "Abogado responsable": FileSignature, "Fecha y lugar": CalendarDays } as const;
const LISTA_INICIAL: Campo = { clave: "contratantes", etiqueta: "Contratantes", tipo: "lista", obligatorio: true, singular: "CONTRATANTE", rotulo: "EL CONTRATANTE", firma: true, opciones: [] };
const NUEVA: Borrador = {
  id: null, nombre: "", descripcion: "", campos: [LISTA_INICIAL], firmas: { abogado: "EL ABOGADO" },
  cuerpo: "# Título del contrato\n\nEntre {{#contratantes}}{{.nombre}}, {{.: identificado | identificada}} con cédula de ciudadanía No. {{.cedula}}{{/contratantes}}, {{contratantes: quien | quienes}} en adelante se {{contratantes: denominará | denominarán}} EL CONTRATANTE, y {{abogado.nombre}}, quien en adelante se denominará EL ABOGADO, se celebra el presente contrato:\n\n## Primera. Objeto\n\n",
};
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_PASO = 10;
const ABOGADO_EJEMPLO = { nombre: "«Nombre del abogado»", documento: "«Cédula»", tarjeta: "«Tarjeta»" };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").replace(/^(\d)/, "c_$1").slice(0, 40);
const deApi = (p: Plantilla): Borrador => ({
  id: p.id, nombre: p.nombre, descripcion: p.descripcion ?? "", cuerpo: p.cuerpo, campos: p.campos ?? [], firmas: { abogado: p.firmas?.abogado ?? "EL ABOGADO" },
});

/** Vista previa sin datos: códigos como etiquetas de colores sobre el documento base. */
export function PreviaPlantilla({ plantilla, guias = false }: { plantilla: Pick<Borrador, "cuerpo" | "campos" | "firmas">; guias?: boolean }) {
  const { bloques } = useMemo(() => revisar(plantilla), [plantilla]);
  const grupos = firmantes(plantilla.campos, {}).map((g) => ({ ...g, nombres: [] }));
  return <Hoja bloques={bloques} firmantes={grupos} rotuloAbogado={plantilla.firmas.abogado} abogado={ABOGADO_EJEMPLO} guias={guias} previa />;
}

/** Las plantillas de la firma: crearlas, editarlas, duplicarlas y eliminarlas. */
export function PlantillasContrato({ plantillas, onCambio }: { plantillas: Plantilla[] | null; onCambio: () => void }) {
  const { toast } = useToast();
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [borrar, setBorrar] = useState<Plantilla | null>(null);

  if (editando) {
    return (
      <EditorPlantilla
        key={editando.id ?? "nueva"}
        inicial={editando}
        onCancelar={() => setEditando(null)}
        onGuardada={(nombre, nueva) => {
          toast({ title: nueva ? "Plantilla creada" : "Plantilla guardada", description: nombre, tone: "success" });
          setEditando(null);
          onCambio();
        }}
      />
    );
  }

  async function duplicar(p: Plantilla) {
    const { data, error } = await api.POST("/api/v2/contratos/plantillas/{plantilla_id}/duplicar", { params: { path: { plantilla_id: p.id } } });
    if (!data) return toast({ title: mensajeDeError(error), tone: "error" });
    toast({ title: "Plantilla duplicada", description: data.nombre, tone: "success" });
    onCambio();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[14px] text-pretty text-ink-2">Cada contrato sale de una de estas plantillas, sobre el documento base. Cambiar una plantilla no cambia los contratos ya hechos.</p>
        <Button icon={<Plus size={16} />} onClick={() => setEditando(NUEVA)}>Nueva plantilla</Button>
      </div>
      <Sheet className="overflow-hidden">
        {plantillas === null ? (
          <div className="space-y-2 p-4" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-manila" />)}</div>
        ) : plantillas.length === 0 ? (
          <EmptyState icon={FileText} title="Aún no hay plantillas" description="Cree la primera para poder redactar contratos." action={<Button icon={<Plus size={16} />} onClick={() => setEditando(NUEVA)}>Nueva plantilla</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {plantillas.map((p) => {
              const propios = (p.campos ?? []).filter((c) => c.tipo !== "lista").length;
              const listas = (p.campos ?? []).filter((c) => c.tipo === "lista").map((c) => c.etiqueta.toLowerCase());
              return (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <FileText size={18} aria-hidden className="mt-0.5 shrink-0 text-navy-ink" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditando(deApi(p))}>
                    <span className="block text-[14.5px] font-semibold text-pretty text-ink hover:underline">{p.nombre}</span>
                    {p.descripcion && <span className="block text-[13px] text-pretty text-ink-2">{p.descripcion}</span>}
                    <span className="mt-1 block text-[12.5px] text-ink-3">
                      {[listas.join(", "), `${propios} ${propios === 1 ? "campo propio" : "campos propios"}`, `usada en ${p.usos} ${p.usos === 1 ? "contrato" : "contratos"}`, `editada el ${fechaCorta(p.actualizada_en)}`].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <IconButton icon={Pencil} label={`Editar ${p.nombre}`} onClick={() => setEditando(deApi(p))} />
                    <IconButton icon={Copy} label={`Duplicar ${p.nombre}`} onClick={() => void duplicar(p)} />
                    <IconButton icon={Trash2} label={`Eliminar ${p.nombre}`} className="hover:bg-bad-soft hover:text-bad" onClick={() => setBorrar(p)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
      <ConfirmDialog
        open={borrar !== null}
        onClose={() => setBorrar(null)}
        destructive
        title="¿Eliminar la plantilla?"
        description={borrar?.usos
          ? `Ya no se podrá elegir para contratos nuevos. Los ${borrar.usos} contratos hechos con ella no cambian: cada uno guarda su copia del texto.`
          : "Ya no se podrá elegir para contratos nuevos."}
        confirmLabel="Eliminar plantilla"
        onConfirm={async () => {
          if (!borrar) return;
          const { error } = await api.DELETE("/api/v2/contratos/plantillas/{plantilla_id}", { params: { path: { plantilla_id: borrar.id } } });
          if (error) throw new Error(mensajeDeError(error));
          toast({ title: "Plantilla eliminada", tone: "success" });
          onCambio();
        }}
      />
    </div>
  );
}

/** El documento base: CPS.docx. No se edita; todas las plantillas se imprimen sobre él. */
export function DocumentoBase({ plantilla }: { plantilla: Plantilla | undefined }) {
  const filas = [
    ["Encabezado y pie de página", "Los de CPS.docx, tal como salen en el PDF"],
    ["Papel", "Carta (21,59 × 27,94 cm)"],
    ["Letra del cuerpo", "Georgia 12 pt, azul oscuro de Word (#002060)"],
    ["Interlineado", "1,15"],
    ["Márgenes", "Superior 3,5 cm · inferior 2,7 cm · izquierdo y derecho 2,5 cm"],
    ["Firmas", "Una debajo de la otra: el rótulo de cada lista una sola vez («EL CONTRATANTE:») y en seguida cada persona, con línea de firma, su nombre, «C.C. No.» para escribir a mano y el recuadro de la huella; al final el abogado con su nombre, cédula y tarjeta profesional"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Alert kind="info" title="El documento base es CPS.docx">No se edita desde la aplicación. Todas las plantillas se imprimen sobre esta hoja; lo único que cambia es el texto de cada plantilla.</Alert>
        <Sheet>
          <dl className="divide-y divide-line">
            {filas.map(([k, v]) => (
              <div key={k} className="px-4 py-3">
                <dt className="text-[12.5px] text-ink-3">{k}</dt>
                <dd className="text-[14px] text-pretty text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Sheet>
      </div>
      <div className="min-w-0">
        {plantilla ? (
          <>
            <p className="mb-2 flex items-center gap-2 text-[13px] text-ink-3"><span aria-hidden className="inline-block h-3 w-4 border border-dashed border-[#7d93c4]" /> Área del texto · con «{plantilla.nombre}»</p>
            <PreviaPlantilla plantilla={deApi(plantilla)} guias />
          </>
        ) : (
          <Sheet><EmptyState icon={FileText} title="Sin plantillas para mostrar" description="Cree una plantilla para verla sobre el documento base." /></Sheet>
        )}
      </div>
    </div>
  );
}

function EditorPlantilla({ inicial, onCancelar, onGuardada }: { inicial: Borrador; onCancelar: () => void; onGuardada: (nombre: string, nueva: boolean) => void }) {
  const { toast } = useToast();
  const [p, setP] = useState<Borrador>(inicial);
  const [modo, setModo] = useState<"editar" | "ver">("editar");
  const [panel, setPanel] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [campoEdit, setCampoEdit] = useState<{ campo: Campo; index: number; soloCrear?: boolean } | null>(null);
  const [insertar, setInsertar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const seleccion = useRef({ a: inicial.cuerpo.length, b: inicial.cuerpo.length });
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setP((x) => ({ ...x, [k]: v }));
  const usados = camposUsados(p.cuerpo);
  const { errores, desconocidos } = useMemo(() => revisar(p), [p]);
  const valido = p.nombre.trim() && p.cuerpo.trim() && errores.length === 0;

  const recordar = () => {
    const t = area.current;
    if (t) seleccion.current = { a: t.selectionStart, b: t.selectionEnd };
  };
  const aplicar = (fn: (s: string, a: number, b: number) => { texto: string; a: number; b: number }) => {
    const { a, b } = seleccion.current;
    const r = fn(p.cuerpo, a, b);
    set("cuerpo", r.texto);
    seleccion.current = { a: r.a, b: r.b };
    setModo("editar");
    requestAnimationFrame(() => {
      const t = area.current;
      if (t) {
        t.focus();
        t.setSelectionRange(r.a, r.b);
      }
    });
  };
  const envolver = (pre: string, post = pre, vacio = "texto") => aplicar((s, a, b) => {
    const medio = s.slice(a, b) || vacio;
    return { texto: s.slice(0, a) + pre + medio + post + s.slice(b), a: a + pre.length, b: a + pre.length + medio.length };
  });
  const prefijo = (pre: string) => aplicar((s, a, b) => {
    const ini = s.lastIndexOf("\n", a - 1) + 1;
    let fin = s.indexOf("\n", a);
    if (fin < 0) fin = s.length;
    const linea = s.slice(ini, fin);
    const limpio = linea.replace(/^(#{1,2}\s+|[-*]\s+|\d+[.)]\s+)/, "");
    const d = pre.length - (linea.length - limpio.length);
    return { texto: s.slice(0, ini) + pre + limpio + s.slice(fin), a: Math.max(ini, a + d), b: Math.max(ini, b + d) };
  });
  const meter = (texto: string) => {
    aplicar((s, a, b) => ({ texto: s.slice(0, a) + texto + s.slice(b), a: a + texto.length, b: a + texto.length }));
    setInsertar(false);
  };

  const herramientas = [
    [Bold, "Negrita", "**"], [Italic, "Cursiva", "*"], [Heading1, "Título del contrato", "# "], [Heading2, "Cláusula", "## "],
    [List, "Lista con viñetas", "- "], [ListOrdered, "Lista numerada", "1. "], [Minus, "Línea separadora", "---"],
  ] as const;
  const usar = (marca: string) => {
    if (marca === "**" || marca === "*") envolver(marca);
    else if (marca === "---") meter("\n---\n");
    else prefijo(marca);
  };

  async function guardar() {
    setGuardando(true);
    const cuerpo = { nombre: p.nombre, descripcion: p.descripcion || null, cuerpo: p.cuerpo, campos: p.campos, firmas: p.firmas };
    const { data, error } = p.id
      ? await api.PUT("/api/v2/contratos/plantillas/{plantilla_id}", { params: { path: { plantilla_id: p.id } }, body: cuerpo })
      : await api.POST("/api/v2/contratos/plantillas", { body: cuerpo });
    setGuardando(false);
    if (!data) return toast({ title: mensajeDeError(error), tone: "error" });
    onGuardada(data.nombre, !p.id);
  }

  const noPierdaFoco = (e: React.MouseEvent) => e.preventDefault();
  const panelCampos = (enDrawer: boolean) => (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-[13px] font-semibold text-ink-2">Datos fijos</p>
        <p className="mb-2.5 text-[12.5px] text-ink-3">Se llenan solos con el proceso, el abogado responsable y la fecha.</p>
        <div className="space-y-3">
          {CAMPOS_FIJOS.map((g) => {
            const Icono = ICONOS_FIJOS[g.grupo as keyof typeof ICONOS_FIJOS];
            return (
              <div key={g.grupo}>
                <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3"><Icono size={13} aria-hidden />{g.grupo}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.campos.map(([k, l]) => (
                    <button key={k} type="button" onMouseDown={noPierdaFoco} onClick={() => meter(`{{${k}}}`)} className={cx("inline-flex min-h-8 items-center gap-1 rounded-md bg-navy-soft px-2.5 text-[13px] font-semibold text-navy-ink transition-[box-shadow] hover:shadow-[0_0_0_1.5px_var(--navy)]", usados.includes(k) && "shadow-[0_0_0_1px_var(--navy)]")}>
                      {usados.includes(k) && <CheckCircle2 size={12} aria-hidden />}{l}
                    </button>
                  ))}
                  {g.grupo === "Abogado responsable" && (
                    <button type="button" onMouseDown={noPierdaFoco} onClick={() => meter("{{abogado: abogado titulado | abogada titulada}}")} className="inline-flex min-h-8 items-center rounded-md bg-navy-soft px-2.5 text-[13px] font-semibold text-navy-ink hover:shadow-[0_0_0_1.5px_var(--navy)]">Masculino | femenino</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink-2">Campos de esta plantilla</p>
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setCampoEdit({ campo: { clave: "", etiqueta: "", tipo: "texto", obligatorio: true, ayuda: "", opciones: [], firma: false }, index: -1 })}>Nuevo campo</Button>
        </div>
        <p className="mb-2.5 text-[12.5px] text-ink-3">Se piden en el formulario al redactar el contrato.</p>
        {p.campos.length === 0 ? (
          <p className="rounded-lg bg-manila px-3 py-3 text-[13px] text-ink-2">Esta plantilla aún no tiene campos propios. Agregue uno para datos como los honorarios o la forma de pago.</p>
        ) : (
          <ul className="space-y-1.5">
            {p.campos.map((c, i) => (
              <li key={c.clave} className="flex items-center gap-1 rounded-lg bg-gold-soft p-1">
                <div className="min-w-0 flex-1">
                  <button type="button" onMouseDown={noPierdaFoco} onClick={() => meter(c.tipo === "lista" ? `{{#${c.clave}}}{{.nombre}}{{/${c.clave}}}` : `{{${c.clave}}}`)} className="w-full rounded-md px-2 py-1 text-left hover:bg-[color-mix(in_oklab,var(--gold)_25%,transparent)]" title="Insertar en el texto">
                    <span className="block truncate text-[13.5px] font-semibold text-gold-ink">{c.etiqueta}</span>
                    <span className="block text-[12px] text-ink-3">{TIPOS[c.tipo]}{c.tipo === "lista" && c.firma !== false ? " · firman" : ""}{c.obligatorio ? " · obligatorio" : " · opcional"}{!usaCodigo(p.cuerpo, c.clave) && " · sin usar en el texto"}</span>
                  </button>
                  {c.tipo === "lista" && (
                    <div className="flex flex-wrap gap-1 px-1.5 pb-1 pt-0.5">
                      {([
                        ["Bloque por persona", `{{#${c.clave}}}{{.nombre}}, {{.: identificado | identificada}} con cédula de ciudadanía No. {{.cedula}}{{/${c.clave}}}`],
                        ["Nombres", `{{${c.clave}.nombres}}`], ["Singular | plural", `{{${c.clave}: quien | quienes}}`], ["4 formas", `{{${c.clave}: éste | ésta | éstos | éstas}}`],
                      ] as const).map(([l, t]) => (
                        <button key={l} type="button" onMouseDown={noPierdaFoco} onClick={() => meter(t)} className="min-h-7 rounded-md bg-sheet px-2 text-[12px] font-semibold text-gold-ink shadow-[0_0_0_1px_var(--line-strong)] hover:shadow-[0_0_0_1px_var(--gold)]">{l}</button>
                      ))}
                    </div>
                  )}
                </div>
                <IconButton icon={Pencil} iconSize={15} label={`Editar ${c.etiqueta}`} className="size-8" onClick={() => setCampoEdit({ campo: c, index: i })} />
                <IconButton icon={Trash2} iconSize={15} label={`Quitar ${c.etiqueta}`} className="size-8 hover:bg-bad-soft hover:text-bad" onClick={() => set("campos", p.campos.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {!enDrawer && (
        <div>
          <p className="mb-1 text-[13px] font-semibold text-ink-2">Firmas</p>
          <p className="mb-2.5 text-[12.5px] text-pretty text-ink-3">Se agregan solas al final, como en CPS: el rótulo de cada lista una vez, en seguida cada persona con su huella y al final el abogado.</p>
          <label htmlFor="rotulo-abogado" className={ETIQUETA}>Rótulo del abogado</label>
          <input id="rotulo-abogado" value={p.firmas.abogado} onChange={(e) => set("firmas", { abogado: e.target.value.toUpperCase() })} className={cx(CAMPO, "uppercase")} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <button type="button" onClick={onCancelar} className="inline-flex min-h-10 items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft size={16} aria-hidden /> Plantillas</button>
      <div className="space-y-3">
        <input value={p.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre de la plantilla" aria-label="Nombre de la plantilla" maxLength={160} className="block w-full bg-transparent font-display text-[24px] leading-tight text-ink placeholder:text-ink-3 focus:outline-none sm:text-[30px]" />
        <input value={p.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Para qué casos sirve (opcional)" aria-label="Descripción" maxLength={500} className={CAMPO} />
      </div>

      <div className={cx("grid gap-5", panel ? "lg:grid-cols-[minmax(0,1fr)_21rem]" : "lg:grid-cols-1")}>
        <Sheet className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 border-b border-line bg-sheet-2 px-2 py-1.5">
            {herramientas.map(([Icono, l, marca]) => <IconButton key={l} icon={Icono} label={l} iconSize={17} className="size-9" onMouseDown={noPierdaFoco} onClick={() => usar(marca)} />)}
            <span aria-hidden className="mx-1 h-6 w-px bg-line" />
            <Button size="sm" variant="secondary" icon={<Braces size={15} />} className="lg:hidden" onClick={() => { recordar(); setInsertar(true); }}>Insertar campo</Button>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <div className="flex items-center" role="group" aria-label="Zoom">
                <IconButton icon={ZoomOut} label="Alejar" iconSize={17} className="size-9 disabled:pointer-events-none disabled:opacity-40" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_PASO))} />
                <button type="button" onClick={() => setZoom(100)} title="Volver al 100 %" className="min-h-9 min-w-12 rounded-md px-1 text-center font-mono text-[12.5px] tabular-nums text-ink-2 hover:bg-manila/60">{zoom} %</button>
                <IconButton icon={ZoomIn} label="Acercar" iconSize={17} className="size-9 disabled:pointer-events-none disabled:opacity-40" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_PASO))} />
              </div>
              <SegmentedControl label="Modo" value={modo} onChange={setModo} options={[{ value: "editar", label: "Escribir" }, { value: "ver", label: "Vista previa" }]} />
              <IconButton icon={panel ? PanelRightClose : PanelRightOpen} label={panel ? "Ocultar el panel de campos" : "Mostrar el panel de campos"} iconSize={17} className="hidden size-9 lg:inline-flex" onClick={() => setPanel((v) => !v)} />
            </div>
          </div>
          {modo === "editar" ? (
            <textarea
              ref={area}
              value={p.cuerpo}
              onChange={(e) => { set("cuerpo", e.target.value); seleccion.current = { a: e.target.selectionStart, b: e.target.selectionEnd }; }}
              onSelect={recordar}
              onKeyUp={recordar}
              onClick={recordar}
              spellCheck
              aria-label="Texto de la plantilla"
              style={{ fontSize: `${(13.5 * zoom) / 100}px` }}
              className="block min-h-[560px] w-full flex-1 resize-y bg-sheet px-4 py-4 font-mono leading-relaxed text-ink focus:outline-none sm:px-5"
            />
          ) : (
            <div className="flex-1 overflow-x-auto bg-manila/60 p-3 sm:p-6">
              <div className="mx-auto" style={{ width: `${zoom}%`, maxWidth: zoom > 100 ? "none" : undefined }}><PreviaPlantilla plantilla={p} /></div>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-sheet-2 px-4 py-2.5 font-mono text-[12.5px] text-ink-3">
            <span>**negrita**</span><span>*cursiva*</span><span># Título</span><span>## Cláusula</span><span>- lista</span><span>{"{{campo}}"}</span><span>{"{{#lista}}{{.nombre}}{{/lista}}"}</span><span>{"{{lista: quien | quienes}}"}</span>
          </div>
        </Sheet>

        <div className={cx("space-y-4", !panel && (errores.length || desconocidos.length ? "lg:order-first" : "lg:hidden"))}>
          {errores.length > 0 && (
            <Alert kind="error" title="Corrija esto para poder guardar">{errores.slice(0, 4).join(" ")}</Alert>
          )}
          {desconocidos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {desconocidos.filter((c) => /^[a-z][a-z0-9_]*$/.test(c) && !PREFIJOS_RESERVADOS.includes(c)).map((c) => (
                <Button key={c} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setCampoEdit({ campo: { clave: c, etiqueta: c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), tipo: "texto", obligatorio: true, ayuda: "", opciones: [], firma: false }, index: -1, soloCrear: true })}>Crear «{c}»</Button>
              ))}
            </div>
          )}
          {panel && <Sheet className="hidden p-4 lg:block">{panelCampos(false)}</Sheet>}
          <Sheet className="p-4 lg:hidden">
            <label htmlFor="rotulo-abogado-movil" className={ETIQUETA}>Rótulo del abogado en las firmas</label>
            <input id="rotulo-abogado-movil" value={p.firmas.abogado} onChange={(e) => set("firmas", { abogado: e.target.value.toUpperCase() })} className={cx(CAMPO, "uppercase")} />
          </Sheet>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 flex justify-end gap-2 border-t border-line bg-sheet/95 px-4 py-3 backdrop-blur-md lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button disabled={!valido} loading={guardando} onClick={() => void guardar()}>{p.id ? "Guardar cambios" : "Crear plantilla"}</Button>
      </div>

      <Drawer open={insertar} onClose={() => setInsertar(false)} title="Insertar campo" subtitle="Se agrega donde estaba el cursor.">
        {panelCampos(true)}
      </Drawer>

      <CampoDrawer
        estado={campoEdit}
        claves={p.campos.map((c) => c.clave)}
        onClose={() => setCampoEdit(null)}
        onGuardar={(c) => {
          if (!campoEdit) return;
          const nuevo = campoEdit.index === -1;
          const anterior = campoEdit.campo.clave;
          setP((x) => ({
            ...x,
            campos: nuevo ? [...x.campos, c] : x.campos.map((y, j) => (j === campoEdit.index ? c : y)),
            cuerpo: !nuevo && anterior !== c.clave ? x.cuerpo.replace(new RegExp(`(\\{\\{[#/\\s]*)${anterior}(?=[.:}\\s])`, "g"), `$1${c.clave}`) : x.cuerpo,
          }));
          if (nuevo && !campoEdit.soloCrear) setTimeout(() => meter(c.tipo === "lista" ? `{{#${c.clave}}}{{.nombre}}{{/${c.clave}}}` : `{{${c.clave}}}`), 0);
          setCampoEdit(null);
        }}
      />
    </div>
  );
}

function CampoDrawer({ estado, claves, onClose, onGuardar }: {
  estado: { campo: Campo; index: number } | null;
  claves: string[];
  onClose: () => void;
  onGuardar: (c: Campo) => void;
}) {
  const [c, setC] = useState<Campo | null>(null);
  const [claveManual, setClaveManual] = useState(false);
  useEffect(() => {
    if (!estado) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el formulario se reinicia cada vez que se abre
    setC({ opciones: [], ...estado.campo });
    setClaveManual(!!estado.campo.clave);
  }, [estado]);
  if (!estado || !c) return null;
  const set = <K extends keyof Campo>(k: K, v: Campo[K]) => setC((x) => x && { ...x, [k]: v });
  const repetida = claves.filter((k) => k !== estado.campo.clave).includes(c.clave);
  const reservada = PREFIJOS_RESERVADOS.includes(c.clave) || !!ETIQUETA_FIJA[c.clave];
  const opciones = c.opciones ?? [];
  const ok = c.etiqueta.trim() && /^[a-z][a-z0-9_]{0,39}$/.test(c.clave) && !repetida && !reservada
    && (c.tipo !== "opciones" || opciones.filter((o) => o.trim()).length >= 2) && (c.tipo !== "lista" || !!c.rotulo?.trim());
  const errorClave = repetida ? "Ya hay otro campo con este código." : reservada ? "Ese código es de un dato fijo." : null;
  return (
    <Drawer
      open
      onClose={onClose}
      title={estado.index === -1 ? "Nuevo campo" : "Editar campo"}
      subtitle="Aparecerá en el formulario al redactar un contrato con esta plantilla."
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ok} onClick={() => onGuardar({ ...c, opciones: opciones.map((o) => o.trim()).filter(Boolean), ...(c.tipo === "lista" ? { firma: c.firma ?? true } : {}) })}>{estado.index === -1 ? "Agregar campo" : "Guardar campo"}</Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="campo-etiqueta" className={ETIQUETA}>Nombre del campo</label>
          <input id="campo-etiqueta" className={CAMPO} value={c.etiqueta} autoFocus maxLength={120} placeholder="Ej.: Valor de los honorarios"
            onChange={(e) => { const v = e.target.value; setC((x) => x && { ...x, etiqueta: v, ...(claveManual ? {} : { clave: slug(v) }) }); }} />
          <p className="mt-1 text-[12.5px] text-ink-3">Así lo verá quien llene el formulario.</p>
        </div>
        <div>
          <label htmlFor="campo-clave" className={ETIQUETA}>Código en el texto</label>
          <input id="campo-clave" className={cx(CAMPO, "font-mono")} value={c.clave} maxLength={40} onChange={(e) => { setClaveManual(true); set("clave", slug(e.target.value)); }} aria-describedby="campo-clave-ayuda" />
          <p id="campo-clave-ayuda" className={cx("mt-1 text-[12.5px]", errorClave ? "text-bad" : "text-ink-3")}>{errorClave ?? (c.clave ? `Se escribe {{${c.clave}}} en la plantilla.` : "Se crea solo a partir del nombre.")}</p>
        </div>
        <div>
          <label htmlFor="campo-tipo" className={ETIQUETA}>Tipo de dato</label>
          <select id="campo-tipo" className={CAMPO} value={c.tipo} onChange={(e) => set("tipo", e.target.value as TipoCampo)}>
            {Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {c.tipo === "lista" && (
          <div className="space-y-3 rounded-lg bg-sheet-2 p-3 shadow-[0_0_0_1px_var(--line)]">
            <p className="text-[13px] text-pretty text-ink-2">Cada persona puede ser un cliente del proceso o alguien sin registrar. En el texto use <code className="font-mono">{`{{#${c.clave || "lista"}}}…{{/${c.clave || "lista"}}}`}</code> para repetir sus datos.</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label htmlFor="campo-rotulo" className={ETIQUETA}>Rótulo en el contrato</label>
                <input id="campo-rotulo" className={cx(CAMPO, "uppercase")} value={c.rotulo ?? ""} placeholder="EL CONTRATANTE" maxLength={80}
                  onChange={(e) => { const v = e.target.value.toUpperCase(); setC((x) => x && { ...x, rotulo: v, singular: v.replace(/^(EL|LA|LOS|LAS)\s+/, "") }); }} />
                <p className="mt-1 text-[12px] text-ink-3">Fijo: no cambia con el género ni la cantidad.</p>
              </div>
              <div>
                <label htmlFor="campo-singular" className={ETIQUETA}>Cada persona se llama</label>
                <input id="campo-singular" className={cx(CAMPO, "uppercase")} value={c.singular ?? ""} placeholder="CONTRATANTE" maxLength={60} onChange={(e) => set("singular", e.target.value.toUpperCase())} />
                <p className="mt-1 text-[12px] text-ink-3">Para el formulario.</p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ink"><input type="checkbox" checked={c.firma ?? true} onChange={(e) => set("firma", e.target.checked)} className="size-4 accent-[var(--navy)]" />Cada persona firma al final, con huella</label>
          </div>
        )}
        {c.tipo === "opciones" && (
          <div>
            <label htmlFor="campo-opciones" className={ETIQUETA}>Opciones</label>
            <textarea id="campo-opciones" rows={4} className={cx(CAMPO, "py-2")} value={opciones.join("\n")} onChange={(e) => set("opciones", e.target.value.split("\n"))} />
            <p className="mt-1 text-[12.5px] text-ink-3">Una por renglón. Mínimo dos.</p>
          </div>
        )}
        {c.tipo !== "lista" && (
          <div>
            <label htmlFor="campo-inicial" className={ETIQUETA}>Texto inicial (opcional)</label>
            <textarea id="campo-inicial" rows={c.tipo === "parrafo" ? 3 : 1} className={cx(CAMPO, "py-2")} value={c.inicial ?? ""} maxLength={5000} onChange={(e) => set("inicial", e.target.value)} />
            <p className="mt-1 text-[12.5px] text-ink-3">Con esto empieza el campo en el formulario; se puede cambiar en cada contrato.</p>
          </div>
        )}
        <div>
          <label htmlFor="campo-ayuda" className={ETIQUETA}>Ayuda para quien llena (opcional)</label>
          <input id="campo-ayuda" className={CAMPO} value={c.ayuda ?? ""} maxLength={300} placeholder="Ej.: 50 % a la firma y 50 % con la sentencia." onChange={(e) => set("ayuda", e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ink"><input type="checkbox" checked={c.obligatorio} onChange={(e) => set("obligatorio", e.target.checked)} className="size-4 accent-[var(--navy)]" />Obligatorio para dejar el contrato listo para firmar</label>
        {estado.index !== -1 && c.tipo === "lista" && <p className="flex gap-2 text-[12.5px] text-ink-3"><Info size={14} aria-hidden className="mt-0.5 shrink-0" />Si cambia el código, también se cambia en el texto.</p>}
      </div>
    </Drawer>
  );
}
