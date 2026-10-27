import React, { useMemo, useState } from "react";
import { Mail, MessageCircle, Smartphone, CalendarPlus, Calculator, Info } from "lucide-react";
import { cx, Drawer, Button, Field, Input, Textarea, Select, Folio, Logo, fechaLarga, fechaCorta, Notice } from "./ui.jsx";
import { procesos, festivos2026, usuarios } from "./data.js";

/* ------------------------------------------------------------ días hábiles con festivos y vacancia judicial */

const VACANCIA = [["2026-12-19", "2027-01-11"]];
const iso = (f) => f.toISOString().slice(0, 10);
const esHabil = (f) => {
  const s = iso(f), w = f.getUTCDay();
  if (w === 0 || w === 6) return false;
  if (festivos2026.includes(s)) return false;
  return !VACANCIA.some(([a, b]) => s >= a && s < b);
};
export function sumarHabiles(desde, dias) {
  const f = new Date(desde + "T00:00:00Z");
  const saltos = [];
  let n = 0;
  while (n < dias) {
    f.setUTCDate(f.getUTCDate() + 1);
    if (esHabil(f)) n++;
    else if (festivos2026.includes(iso(f))) saltos.push(iso(f));
  }
  return { vence: iso(f), saltos };
}

/* campo de fecha en formato colombiano (dd/mm/aaaa), sin depender del idioma del navegador */
const aTexto = (v) => v ? v.split("-").reverse().join("/") : "";
function FechaInput({ value, onChange, ...p }) {
  const [txt, setTxt] = useState(aTexto(value));
  React.useEffect(() => setTxt(aTexto(value)), [value]);
  const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const valido = m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31;
  return (
    <>
      <Input {...p} inputMode="numeric" placeholder="dd/mm/aaaa" value={txt} className="tnum" aria-invalid={!valido}
        onChange={(e) => { const t = e.target.value.replace(/[^\d/]/g, "").slice(0, 10); setTxt(t); const k = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (k) onChange(`${k[3]}-${k[2].padStart(2, "0")}-${k[1].padStart(2, "0")}`); }} />
      {!valido && <span className="mt-1.5 block text-[12.5px] text-bad">Escriba la fecha como dd/mm/aaaa.</span>}
    </>
  );
}

/* ------------------------------------------------------------ avisar al cliente: se previsualiza en lenguaje claro */

export function AvisarDrawer({ open, onClose, folio, onDone }) {
  const p = folio && procesos.find((x) => x.id === folio.procesoId);
  const [texto, setTexto] = useState("");
  const [canales, setCanales] = useState({ correo: true, whatsapp: true, portal: true });
  const [enviando, setEnviando] = useState(false);
  React.useEffect(() => {
    if (folio) setTexto(folio.claro + (folio.termino ? " Ya estamos trabajando en ello y le contaremos cuando esté listo." : folio.evento ? " Le confirmaremos unos días antes los detalles." : ""));
  }, [folio]);
  if (!folio || !p) return null;
  const nombre = p.contacto || p.cliente.split(" ")[0];
  const enviar = () => { setEnviando(true); setTimeout(() => { setEnviando(false); onDone(`Aviso enviado a ${p.cliente.split(" ").slice(0, 2).join(" ")}`); }, 700); };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Avisar al cliente"
      sub={<span className="flex items-center gap-2"><Folio n={folio.folio} size="sm" /> {folio.titulo}</span>}
      width={600}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={enviar} loading={enviando} disabled={!Object.values(canales).some(Boolean) || !texto.trim()}>Enviar aviso</Button></>}
    >
      <div className="space-y-5">
        <Field label="Mensaje para el cliente" hint="Escrito en lenguaje claro. El texto técnico del juzgado va como referencia al final.">
          <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Enviar por</p>
          <div className="flex flex-wrap gap-2">
            {[["correo", "Correo", Mail], ["whatsapp", "WhatsApp", MessageCircle], ["portal", "Portal y app", Smartphone]].map(([k, l, I]) => (
              <button key={k} onClick={() => setCanales((c) => ({ ...c, [k]: !c[k] }))} aria-pressed={canales[k]} className={cx("inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-semibold transition-[background-color,box-shadow,color]", canales[k] ? "bg-navy-soft text-navy-ink shadow-[0_0_0_1.5px_var(--navy)]" : "bg-sheet text-ink-2 shadow-[0_0_0_1px_var(--line-strong)]")}>
                <I size={16} /> {l}
              </button>
            ))}
          </div>
          {!Object.values(canales).some(Boolean) && <p className="mt-2 text-[13px] text-bad">Elija al menos un canal.</p>}
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Así lo verá {nombre}</p>
          <div className="overflow-hidden rounded-xl border border-line bg-sheet-2">
            <div className="flex items-center justify-between border-b border-line bg-sheet px-4 py-3">
              <Logo variant="landscape" className="h-8 w-auto dark:hidden" />
              <Logo variant="reversed" className="hidden h-8 w-auto dark:block" />
              <span className="text-[12px] text-ink-3">Hoy, 8:20 a. m.</span>
            </div>
            <div className="lectura space-y-3 px-4 py-4 text-ink">
              <p>Hola, {nombre}:</p>
              <p>{texto || <span className="text-ink-3">Escriba el mensaje arriba.</span>}</p>
              <p className="text-ink-2">Alejandra Muñoz<br /><span className="text-[15px] text-ink-3">Su abogada · {p.nombre}</span></p>
              <div className="rounded-lg bg-manila px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
                <span className="font-semibold">Referencia del juzgado:</span> {folio.titulo}. {p.despacho}, folio {folio.folio}.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------ crear tarea con cálculo de término */

export function TareaDrawer({ open, onClose, folio, onDone }) {
  const p = folio && procesos.find((x) => x.id === folio.procesoId);
  const [titulo, setTitulo] = useState("");
  const [dias, setDias] = useState(5);
  const [desde, setDesde] = useState("2026-10-27");
  const [resp, setResp] = useState("Alejandra Muñoz");
  const [usar, setUsar] = useState(true);
  const [fecha, setFecha] = useState("2026-11-04");
  React.useEffect(() => {
    if (!folio) return;
    setTitulo(folio.termino ? (folio.titulo.includes("inadmite") ? "Subsanar la demanda" : "Responder: " + folio.titulo.toLowerCase()) : folio.evento ? "Preparar " + folio.titulo.replace(/^Auto fija fecha /, "").toLowerCase() : "Revisar: " + folio.titulo.toLowerCase());
    setDias(folio.termino?.dias ?? 5);
    setUsar(!!folio.termino);
    setResp(p?.responsable || "Alejandra Muñoz");
  }, [folio]);
  const calc = useMemo(() => sumarHabiles(desde, Number(dias) || 0), [desde, dias]);
  if (!folio || !p) return null;
  const guardar = () => onDone(`Tarea creada: vence el ${fechaLarga(usar ? calc.vence : fecha)}`);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Crear tarea"
      sub={<span className="flex items-center gap-2"><Folio n={folio.folio} size="sm" /> {p.nombre}</span>}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={guardar} disabled={!titulo.trim()}>Crear tarea</Button></>}
    >
      <div className="space-y-5">
        <Field label="Qué hay que hacer" error={!titulo.trim() ? "Escriba un título para la tarea." : null}>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Field>
        <Field label="Responsable">
          <Select value={resp} onChange={(e) => setResp(e.target.value)}>
            {p.equipo.map((n) => <option key={n}>{n}</option>)}
          </Select>
        </Field>

        <div className="rounded-xl border border-line">
          <label className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3">
            <input type="checkbox" checked={usar} onChange={(e) => setUsar(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
            <span className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Calculator size={16} className="text-ink-3" /> Calcular el vencimiento como término judicial</span>
          </label>
          {usar ? (
            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Notificado por estado el"><FechaInput value={desde} onChange={setDesde} /></Field>
                <Field label="Días hábiles"><Input type="number" min={1} max={60} value={dias} onChange={(e) => setDias(e.target.value)} className="tnum" /></Field>
              </div>
              <div className="rounded-lg bg-gold-soft px-4 py-3">
                <p className="text-[13px] text-gold-ink">Vence el</p>
                <p className="font-display text-[22px] leading-tight text-ink first-letter:uppercase">{fechaLarga(calc.vence)}</p>
                <p className="mt-1 text-[13px] text-ink-2">
                  Cuenta desde el día hábil siguiente a la notificación. {calc.saltos.length ? `No cuenta el festivo del ${calc.saltos.map(fechaLarga).join(", ")}.` : "Sin festivos en el periodo."}
                  {folio.termino && <> Base: {folio.termino.base}.</>}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 py-4"><Field label="Fecha límite"><FechaInput value={fecha} onChange={setFecha} /></Field></div>
          )}
        </div>

        {folio.evento && (
          <Notice tone="navy" icon={CalendarPlus} title="Esta actuación trae una fecha" action={<Button size="sm" variant="secondary">Agregar a la agenda</Button>}>
            {fechaLarga(folio.evento.fecha)}, {folio.evento.hora}.
          </Notice>
        )}
        <p className="flex items-start gap-2 text-[13px] text-ink-3"><Info size={14} className="mt-0.5 shrink-0" /> La tarea queda en el expediente con el siguiente número de folio y le llegará un recordatorio dos días hábiles antes.</p>
      </div>
    </Drawer>
  );
}
