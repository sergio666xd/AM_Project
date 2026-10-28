import React, { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Bell, ListPlus, ArrowRight, RefreshCw, CalendarClock, Video, MapPin, MessageSquare, CheckCircle2, ChevronLeft, Upload, Plus, MoreHorizontal,
  Gavel, FileText, MessageCircle, CheckSquare, Send, FileSignature, ClipboardList, Search, FolderOpen, Archive, Filter, Download, Eye,
} from "lucide-react";
import {
  cx, Sheet, SheetHeader, PageTitle, Button, Tag, Folio, Radicado, Habiles, Notice, Empty, SkeletonRows, Tabs, Etapas, Initials, SearchInput, Select, Segmented,
  fechaLarga, fechaCorta, pesos, Input,
} from "./ui.jsx";
import { procesos, foliosNuevos, tareas, agendaHoy, conversaciones, expediente21, cuentasCobro } from "./data.js";
import { AvisarDrawer, TareaDrawer } from "./acciones.jsx";

const proc = (id) => procesos.find((p) => p.id === id);

/* ============================================================ HOY */

export function Hoy({ go, demo, toast }) {
  const [revisados, setRevisados] = useState({});
  const [avisar, setAvisar] = useState(null);
  const [tarea, setTarea] = useState(null);
  const [reintento, setReintento] = useState("idle");
  const lista = demo === "vacio" ? [] : foliosNuevos;
  const pendientes = lista.filter((f) => !revisados[f.folio + "-" + f.procesoId]).length;

  const marcar = (f, que) => setRevisados((r) => ({ ...r, [f.folio + "-" + f.procesoId]: que }));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Hoy"
        sub={<>Martes 27 de octubre · Rama Judicial consultada hoy a las 7:40 a. m.</>}
      />

      {demo === "error" || demo === "normal" ? (
        <Notice
          tone={reintento === "ok" ? "ok" : "warn"}
          icon={reintento === "ok" ? CheckCircle2 : undefined}
          title={reintento === "ok" ? "Radicado consultado de nuevo: sin actuaciones nuevas" : "Un radicado no se pudo consultar"}
          action={reintento !== "ok" && <Button size="sm" variant="secondary" icon={RefreshCw} loading={reintento === "busy"} onClick={() => { setReintento("busy"); setTimeout(() => setReintento("ok"), 900); }}>Reintentar ahora</Button>}
        >
          {reintento === "ok" ? "Nulidad de sanción urbanística, Envigado está al día." : "La Rama Judicial no respondió para Nulidad de sanción urbanística, Envigado. Se volverá a intentar a las 12:00 m."}
        </Notice>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* folios nuevos */}
        <Sheet>
          <SheetHeader
            title="Folios nuevos"
            count={demo === "cargando" ? null : pendientes}
            action={<span className="hidden text-[13px] text-ink-3 sm:inline">Desde ayer, 5:00 p. m.</span>}
          />
          {demo === "cargando" ? <SkeletonRows rows={4} /> : lista.length === 0 ? (
            <Empty icon={CheckCircle2} title="No hay folios nuevos">
              La Rama Judicial no reportó actuaciones desde la última consulta. La próxima es a las 12:00 m.
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {lista.map((f) => {
                const p = proc(f.procesoId);
                const hecho = revisados[f.folio + "-" + f.procesoId];
                return (
                  <li key={f.folio + "-" + f.procesoId} className={cx("relative px-4 py-4 transition-[background-color,box-shadow] duration-500 sm:px-5", !hecho && "bg-[color-mix(in_oklab,var(--gold-soft)_60%,transparent)]")}>
                    <div className="flex gap-4">
                      <div className="min-w-0 flex-1">
                        <button onClick={() => go({ page: "expediente", id: p.id })} className="block max-w-full truncate text-left text-[13px] font-semibold text-navy-ink hover:underline">{p.nombre}</button>
                        <p className="truncate text-[12.5px] text-ink-3">{p.despacho}</p>
                        <p className="mt-2 text-[15px] font-semibold text-ink">{f.titulo}</p>
                        <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{f.claro}</p>
                        {(f.termino || f.evento) && (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {f.termino && <Tag tone={f.termino.habilesRestantes <= 5 ? "bad" : "warn"} icon={CalendarClock}>Término de {f.termino.dias} días hábiles · vence {fechaCorta(f.termino.vence)}</Tag>}
                            {f.evento && <Tag tone="navy" icon={CalendarClock}>Audiencia {fechaCorta(f.evento.fecha)}, {f.evento.hora}</Tag>}
                          </div>
                        )}
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                          {hecho ? (
                            <span className="anim-fade inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok"><CheckCircle2 size={15} /> {hecho}</span>
                          ) : (
                            <>
                              <Button size="sm" icon={Send} onClick={() => setAvisar(f)}>Avisar al cliente</Button>
                              <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setTarea(f)}>{f.termino ? "Crear tarea con término" : "Crear tarea"}</Button>
                              <Button size="sm" variant="ghost" onClick={() => marcar(f, "Revisado, sin acción")}>Marcar revisado</Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 pt-0.5">
                        <button onClick={() => go({ page: "expediente", id: p.id, folio: f.folio })} className="rounded-[4px] transition-[scale] active:scale-[0.96]" aria-label={`Abrir el expediente en el folio ${f.folio}`} title="Abrir el expediente en este folio"><Folio n={f.folio} nuevo={!hecho} className="hover:border-gold hover:text-gold-ink" /></button>
                        <span className="text-[12px] text-ink-3">{fechaCorta(f.fecha)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>

        <div className="space-y-6">
          <Sheet>
            <SheetHeader title="Vence pronto" action={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => go({ page: "tareas" })}>Tareas</Button>} />
            {demo === "cargando" ? <SkeletonRows rows={3} /> : (
              <ul className="divide-y divide-line">
                {tareas.filter((t) => t.estado !== "hecha").sort((a, b) => a.habiles - b.habiles).slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-snug text-ink">{t.titulo}</p>
                      <p className="truncate text-[12.5px] text-ink-3">{proc(t.procesoId).nombre}</p>
                    </div>
                    <Habiles n={t.habiles} vence={t.vence} />
                  </li>
                ))}
              </ul>
            )}
          </Sheet>

          <Sheet>
            <SheetHeader title="Agenda de hoy" action={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => go({ page: "agenda" })}>Agenda</Button>} />
            <ul className="divide-y divide-line">
              {agendaHoy.map((a) => (
                <li key={a.hora} className="flex gap-3 px-4 py-3">
                  <div className="w-[78px] shrink-0 whitespace-nowrap text-[13px] font-semibold text-ink tnum">{a.hora}</div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{a.titulo}</p>
                    <p className="flex items-center gap-1 text-[12.5px] text-ink-3">{a.lugar.startsWith("Virtual") ? <Video size={12} /> : <MapPin size={12} />} {a.lugar}</p>
                    {a.procesoId && <button onClick={() => go({ page: "expediente", id: a.procesoId })} className="block max-w-full truncate text-left text-[12.5px] font-semibold text-navy-ink hover:underline">{proc(a.procesoId).nombre}</button>}
                  </div>
                </li>
              ))}
            </ul>
          </Sheet>

          <Sheet>
            <SheetHeader title="Mensajes" count={1} action={<Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => go({ page: "mensajes" })}>Abrir</Button>} />
            <button onClick={() => go({ page: "mensajes" })} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-sheet-2">
              <Initials name={conversaciones[0].con} size={34} />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">Claudia Ríos <span className="font-normal text-ink-3">· {conversaciones[0].hora}</span></p>
                <p className="line-clamp-2 text-[13px] text-ink-2">{conversaciones[0].ultimo}</p>
              </div>
            </button>
          </Sheet>
        </div>
      </div>

      <AvisarDrawer open={!!avisar} folio={avisar} onClose={() => setAvisar(null)} onDone={(t) => { marcar(avisar, "Cliente avisado por correo, WhatsApp y portal"); setAvisar(null); toast(t); }} />
      <TareaDrawer open={!!tarea} folio={tarea} onClose={() => setTarea(null)} onDone={(t) => { marcar(tarea, t); setTarea(null); toast("Tarea creada"); }} />
    </div>
  );
}

/* ============================================================ PROCESOS */

export function Procesos({ go, demo }) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("todas");
  const [estado, setEstado] = useState("activo");
  const [resp, setResp] = useState("todos");
  const lista = useMemo(() => procesos.filter((p) =>
    (estado === "todos" || p.estado === estado) && (area === "todas" || p.area === area) && (resp === "todos" || p.responsable === resp) &&
    (!q || (p.nombre + " " + p.cliente + " " + p.despacho).toLowerCase().includes(q.toLowerCase()) || (q.replace(/\D/g, "").length >= 4 && p.radicado.includes(q.replace(/\D/g, ""))))
  ), [q, area, estado, resp]);
  const vacio = demo === "vacio" ? [] : lista;
  return (
    <div className="space-y-5">
      <PageTitle title="Procesos" sub={`${procesos.filter((p) => p.estado === "activo").length} activos · ${procesos.filter((p) => p.estado === "archivado").length} archivado`} actions={<Button icon={Plus}>Nuevo proceso</Button>} />
      <div className="flex flex-wrap gap-2 rounded-xl bg-manila p-2">
        <SearchInput value={q} onChange={setQ} placeholder="Nombre, cliente o radicado" className="min-w-[220px] flex-1" />
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-auto min-w-[170px]" aria-label="Área">
          <option value="todas">Todas las áreas</option>
          {[...new Set(procesos.map((p) => p.area))].map((a) => <option key={a}>{a}</option>)}
        </Select>
        <Select value={resp} onChange={(e) => setResp(e.target.value)} className="w-auto min-w-[170px]" aria-label="Responsable">
          <option value="todos">Todos los responsables</option>
          <option>Alejandra Muñoz</option>
          <option>Santiago Ocampo</option>
        </Select>
        <Segmented value={estado} onChange={setEstado} options={[{ id: "activo", label: "Activos" }, { id: "archivado", label: "Archivados" }, { id: "todos", label: "Todos" }]} className="bg-sheet/70" />
      </div>
      <Sheet className="overflow-hidden">
        {demo === "cargando" ? <SkeletonRows rows={6} /> : vacio.length === 0 ? (
          <Empty icon={FolderOpen} title={demo === "vacio" ? "Todavía no hay procesos" : "Ningún proceso coincide con los filtros"} action={demo === "vacio" ? <Button icon={Plus}>Crear el primer proceso</Button> : <Button variant="secondary" onClick={() => { setQ(""); setArea("todas"); setResp("todos"); setEstado("todos"); }}>Quitar filtros</Button>}>
            {demo === "vacio" ? "Cree un proceso y asócielo a un radicado para empezar a recibir las actuaciones del juzgado." : "Pruebe con otra área, otro responsable o el número de radicado completo."}
          </Empty>
        ) : (
          <table className="w-full text-left">
            <thead className="hidden border-b border-line bg-sheet-2 text-[12.5px] text-ink-3 md:table-header-group">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Proceso</th>
                <th className="px-3 py-2.5 font-semibold">Etapa</th>
                <th className="px-3 py-2.5 font-semibold">Próximo</th>
                <th className="px-3 py-2.5 font-semibold">Responsable</th>
                <th className="px-5 py-2.5 text-right font-semibold">Folios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {vacio.map((p) => (
                <tr key={p.id} onClick={() => go({ page: "expediente", id: p.id })} className="block cursor-pointer px-4 py-3.5 transition-colors hover:bg-sheet-2 md:table-row md:p-0">
                  <td className="block md:table-cell md:px-5 md:py-3.5">
                    <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                      {p.nombre}
                      {p.nuevos > 0 && <span className="rounded bg-gold-soft px-1.5 text-[11.5px] font-bold text-gold-ink">{p.nuevos} nuevo</span>}
                      {p.estado === "archivado" && <Tag icon={Archive}>Archivado</Tag>}
                    </p>
                    <p className="text-[13px] text-ink-3">{p.cliente} · {p.despacho}</p>
                  </td>
                  <td className="mt-2 block md:mt-0 md:table-cell md:px-3 md:py-3.5"><span className="text-[13.5px] text-ink-2">{p.etapas[p.etapa]}</span></td>
                  <td className="block md:table-cell md:px-3 md:py-3.5">
                    {p.proximo ? <span className="text-[13.5px] text-ink-2">{p.proximo.texto} · <span className="font-semibold text-ink">{fechaCorta(p.proximo.fecha)}</span></span> : <span className="text-[13.5px] text-ink-3">Sin pendientes</span>}
                  </td>
                  <td className="hidden md:table-cell md:px-3 md:py-3.5"><span className="flex items-center gap-2 text-[13.5px] text-ink-2"><Initials name={p.responsable} size={24} />{p.responsable.split(" ")[0]}</span></td>
                  <td className="hidden text-right md:table-cell md:px-5 md:py-3.5"><Folio n={p.folios} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sheet>
    </div>
  );
}

/* ============================================================ EXPEDIENTE */

const TIPO = {
  actuacion: { icon: Gavel, label: "Actuación", tone: "navy" },
  documento: { icon: FileText, label: "Documento", tone: "ok" },
  mensaje: { icon: MessageCircle, label: "Mensaje", tone: "neutral" },
  tarea: { icon: CheckSquare, label: "Tarea", tone: "warn" },
  aviso: { icon: Send, label: "Aviso al cliente", tone: "neutral" },
  solicitud: { icon: ClipboardList, label: "Solicitud", tone: "gold" },
  contrato: { icon: FileSignature, label: "Contrato", tone: "gold" },
};

const ANTIGUOS = [
  { tipo: "actuacion", titulo: "Auto de trámite", detalle: "Se agrega memorial al expediente y se pone en conocimiento de las partes.", claro: "El juzgado agregó un documento al expediente.", autor: "Rama Judicial" },
  { tipo: "documento", titulo: "Memorial radicado", detalle: "PDF, 4 páginas.", autor: null },
  { tipo: "actuacion", titulo: "Constancia secretarial", detalle: "Se deja constancia del vencimiento de un término.", claro: "El juzgado dejó constancia de que venció un plazo.", autor: "Rama Judicial" },
  { tipo: "aviso", titulo: "Aviso enviado al cliente", detalle: "Enviado por correo y WhatsApp.", autor: null },
  { tipo: "actuacion", titulo: "Notificación por estado", detalle: "Se notifica por estado electrónico la providencia anterior.", claro: "El juzgado publicó su decisión anterior.", autor: "Rama Judicial" },
  { tipo: "mensaje", titulo: "Mensaje del cliente", detalle: "«Gracias, doctora. Quedo atento.»", autor: "Cliente" },
];
const restar = (iso, d) => { const f = new Date(iso + "T12:00:00Z"); f.setUTCDate(f.getUTCDate() - d); return f.toISOString().slice(0, 10); };

function foliosDe(p) {
  let recientes;
  if (p.id === 21) recientes = expediente21;
  else {
    const nuevo = foliosNuevos.find((f) => f.procesoId === p.id);
    recientes = nuevo ? [{ ...nuevo, detalle: nuevo.anotacion, nuevo: true, autor: "Rama Judicial" }] : [];
  }
  const tope = recientes.length ? recientes[recientes.length - 1].folio - 1 : p.folios;
  let fecha = recientes.length ? recientes[recientes.length - 1].fecha : "2026-10-20";
  const antiguos = [];
  for (let n = tope; n >= 1; n--) {
    fecha = restar(fecha, n % 3 === 0 ? 4 : 2);
    const t = n === 1
      ? { tipo: "documento", titulo: "Demanda y anexos", detalle: "Demanda presentada por la firma con sus anexos.", autor: p.responsable }
      : n === 2 ? { tipo: "documento", titulo: "Poder otorgado por el cliente", detalle: "Poder especial con presentación personal.", autor: p.responsable }
      : ANTIGUOS[n % ANTIGUOS.length];
    antiguos.push({ ...t, folio: n, fecha, autor: t.autor || p.responsable });
  }
  return [...recientes, ...antiguos];
}

const PAGINA = 10;

export function Expediente({ id, folio: folioInicial, go, demo, toast }) {
  const p = proc(id) || proc(21);
  const [visibles, setVisibles] = useState(PAGINA);
  const [orden, setOrden] = useState("desc");
  const [tab, setTab] = useState("folios");
  const [filtro, setFiltro] = useState("todo");
  const [salto, setSalto] = useState("");
  const [resaltado, setResaltado] = useState(null);
  const [avisar, setAvisar] = useState(null);
  const [tarea, setTarea] = useState(null);
  const folios = foliosDe(p);
  const filtrados = folios.filter((f) => filtro === "todo" || f.tipo === filtro);
  const vis = (orden === "desc" ? filtrados : [...filtrados].reverse()).slice(0, visibles);
  const misTareas = tareas.filter((t) => t.procesoId === p.id);
  const cobros = cuentasCobro.filter((c) => c.procesoId === p.id);

  const saltarA = (n) => {
    const idx = folios.findIndex((x) => x.folio === n);
    if (idx < 0) { toast(`El expediente tiene folios del 1 al ${p.folios}.`); return; }
    setTab("folios"); setFiltro("todo"); setOrden("desc"); setVisibles((v) => Math.max(v, Math.ceil((idx + 1) / PAGINA) * PAGINA)); setResaltado(n);
    setTimeout(() => document.getElementById("folio-" + n)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    setTimeout(() => setResaltado(null), 2400);
  };
  const irAlFolio = (e) => { e.preventDefault(); saltarA(Number(salto)); };
  React.useEffect(() => { if (folioInicial) saltarA(folioInicial); }, []);

  return (
    <div className="space-y-0">
      <button onClick={() => go({ page: "procesos" })} className="mb-3 inline-flex h-9 items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink"><ChevronLeft size={16} /> Procesos</button>

      {/* carátula */}
      <div className="rounded-t-xl border border-b-0 border-manila-line bg-manila px-4 pb-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[760px]">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Tag tone="navy">{p.area}</Tag>
              <Tag>{p.clase}</Tag>
              {p.estado === "archivado" ? <Tag icon={Archive}>Archivado</Tag> : <Tag tone="ok" icon={CheckCircle2}>Activo</Tag>}
            </div>
            <h1 className="font-display text-[24px] leading-tight text-ink sm:text-[30px]">{p.nombre}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Send} onClick={() => setAvisar(foliosNuevos.find((f) => f.procesoId === p.id) || { procesoId: p.id, folio: p.folios, titulo: "Actualización del proceso", claro: p.resumenCliente })}>Avisar al cliente</Button>
            <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setTarea({ procesoId: p.id, folio: p.folios, titulo: "tarea del expediente", claro: "" })}>Nueva tarea</Button>
            <Button size="sm" variant="secondary" icon={Upload}>Subir documento</Button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-ink-2">Radicado</dt><dd className="mt-0.5"><Radicado numero={p.radicado} /></dd></div>
          <div><dt className="text-ink-2">Despacho</dt><dd className="mt-0.5 font-semibold text-ink">{p.despacho}</dd></div>
          <div><dt className="text-ink-2">Cliente</dt><dd className="mt-0.5 font-semibold text-ink">{p.cliente}</dd></div>
          <div><dt className="text-ink-2">Contraparte</dt><dd className="mt-0.5 font-semibold text-ink">{p.contraparte}</dd></div>
        </dl>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] text-ink-2">Etapa: <span className="font-semibold text-ink">{p.etapas[p.etapa]}</span></p>
              <button className="text-[13px] font-semibold text-navy-ink hover:underline">Cambiar etapa</button>
            </div>
            <Etapas etapas={p.etapas} actual={p.etapa} />
          </div>
          <form onSubmit={irAlFolio} className="flex items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[13px] text-ink-2">Ir al folio</span>
              <Input inputMode="numeric" value={salto} onChange={(e) => setSalto(e.target.value.replace(/\D/g, ""))} placeholder={`1 a ${p.folios}`} className="tnum" />
            </label>
            <Button variant="secondary" type="submit" disabled={!salto}>Ir</Button>
          </form>
        </div>

        <Tabs
          className="mt-5"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "folios", label: "Folios", count: p.folios },
            { id: "tareas", label: "Tareas", count: misTareas.length },
            { id: "documentos", label: "Documentos" },
            { id: "equipo", label: "Partes y equipo" },
            { id: "cobros", label: "Contrato y cobros" },
          ]}
        />
      </div>

      <Sheet className="rounded-t-none border border-t-0 border-line">
        {p.consultaFallida && tab === "folios" && (
          <div className="px-4 pt-4 sm:px-6"><Notice title="La última consulta a la Rama Judicial falló">No respondió en 30 segundos. Los folios de abajo son los que ya teníamos; se reintentará a las 12:00 m.</Notice></div>
        )}
        {tab === "folios" && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
              {[["todo", "Todo"], ["actuacion", "Actuaciones"], ["documento", "Documentos"], ["mensaje", "Mensajes"], ["tarea", "Tareas"]].map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k} className={cx("h-8 rounded-full px-3 text-[13px] font-semibold transition-colors", filtro === k ? "bg-navy text-on-navy" : "bg-manila text-ink-2 hover:text-ink")}>{l}</button>
              ))}
              <button onClick={() => setOrden((o) => (o === "desc" ? "asc" : "desc"))} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-ink-2 hover:bg-manila hover:text-ink"><ArrowUpDown size={14} /> {orden === "desc" ? "Más recientes primero" : "Más antiguos primero"}</button>
            </div>
            {demo === "cargando" ? <SkeletonRows rows={5} /> : vis.length === 0 ? (
              <Empty icon={Filter} title="No hay folios de este tipo" action={<Button variant="secondary" onClick={() => setFiltro("todo")}>Ver todos los folios</Button>} />
            ) : (
              <ol className="divide-y divide-line">
                {vis.map((f) => {
                  const T = TIPO[f.tipo];
                  return (
                    <li id={"folio-" + f.folio} key={f.folio} className={cx("flex gap-4 px-4 py-4 transition-[background-color,box-shadow] duration-700 sm:px-6", f.nuevo && "bg-[color-mix(in_oklab,var(--gold-soft)_60%,transparent)]", resaltado === f.folio && "bg-gold-soft")}>
                      <div className="hidden w-[74px] shrink-0 pt-0.5 text-[13px] text-ink-3 sm:block tnum">{fechaCorta(f.fecha)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3"><T.icon size={14} strokeWidth={2} /> {T.label}</span>
                          <span className="text-[12.5px] text-ink-3 sm:hidden">· {fechaCorta(f.fecha)}</span>
                          {f.estado && <Tag tone="warn">{f.estado}</Tag>}
                        </div>
                        <p className="mt-1 text-[15px] font-semibold text-ink">{f.titulo}</p>
                        <p className="mt-1 max-w-[72ch] text-[14px] leading-relaxed text-ink-2">{f.detalle}</p>
                        {f.claro && (
                          <p className="mt-2 max-w-[72ch] rounded-lg bg-sheet-2 px-3 py-2 text-[13.5px] text-ink-2 ring-1 ring-line">
                            <span className="font-semibold text-ink">Para el cliente:</span> {f.claro}
                          </p>
                        )}
                        {f.archivo && <button className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-ink hover:underline"><Eye size={14} /> {f.archivo}</button>}
                        {f.tipo === "actuacion" && f.nuevo && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" icon={Send} onClick={() => setAvisar({ ...f, procesoId: p.id })}>Avisar al cliente</Button>
                            <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setTarea({ ...f, procesoId: p.id })}>Crear tarea</Button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Folio n={f.folio} nuevo={f.nuevo} />
                        <span className="text-[12px] text-ink-3">{f.autor}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {demo !== "cargando" && filtrados.length > visibles && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
                <span className="text-[13px] text-ink-3 tnum">Mostrando {vis.length} de {filtrados.length} folios</span>
                <Button size="sm" variant="secondary" onClick={() => setVisibles((v) => v + PAGINA)}>{orden === "desc" ? "Ver folios anteriores" : "Ver folios siguientes"}</Button>
              </div>
            )}
          </>
        )}

        {tab === "tareas" && (
          misTareas.length === 0 ? <Empty icon={CheckSquare} title="Este proceso no tiene tareas" action={<Button icon={Plus}>Nueva tarea</Button>} /> : (
            <ul className="divide-y divide-line">
              {misTareas.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
                  <input type="checkbox" defaultChecked={t.estado === "hecha"} className="h-[18px] w-[18px] accent-[var(--navy)]" aria-label={`Completar ${t.titulo}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-ink">{t.titulo}</p>
                    <p className="text-[13px] text-ink-3">{t.responsable}{t.origen ? ` · desde ${t.origen.toLowerCase()}` : ""}</p>
                  </div>
                  {t.estado === "hecha" ? <Tag tone="ok" icon={CheckCircle2}>Hecha</Tag> : <Habiles n={t.habiles} vence={t.vence} />}
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "documentos" && (
          <div className="divide-y divide-line">
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
              <ClipboardList size={18} className="text-gold-ink" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-ink">Certificado de tradición y libertad</p>
                <p className="text-[13px] text-ink-3">Pedido a {p.cliente.split(" ").slice(0, 2).join(" ")} el 9 oct. · plazo {fechaCorta("2026-11-03")}</p>
              </div>
              <Tag tone="gold">Esperando al cliente</Tag>
              <Button size="sm" variant="ghost" icon={Bell}>Recordar</Button>
            </div>
            {folios.filter((f) => f.archivo || f.tipo === "documento").map((f) => (
              <div key={f.folio} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                <FileText size={18} className="text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">{f.titulo}</p>
                  <p className="text-[13px] text-ink-3">{f.autor} · {fechaCorta(f.fecha)}</p>
                </div>
                <Folio n={f.folio} size="sm" />
                <Button size="sm" variant="ghost" icon={Download}>Descargar</Button>
              </div>
            ))}
          </div>
        )}

        {tab === "equipo" && (
          <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-3">Partes</p>
              <ul className="space-y-2 text-[14px]">
                <li className="flex justify-between gap-3 rounded-lg bg-sheet-2 px-3 py-2.5 ring-1 ring-line"><span className="font-semibold text-ink">{p.cliente}</span><span className="text-ink-3">Cliente</span></li>
                <li className="flex justify-between gap-3 rounded-lg bg-sheet-2 px-3 py-2.5 ring-1 ring-line"><span className="font-semibold text-ink">{p.contraparte}</span><span className="text-ink-3">Contraparte</span></li>
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-3">Equipo de la firma</p>
              <ul className="space-y-2 text-[14px]">
                {p.equipo.map((n, i) => (
                  <li key={n} className="flex items-center gap-3 rounded-lg bg-sheet-2 px-3 py-2 ring-1 ring-line"><Initials name={n} size={28} /><span className="flex-1 font-semibold text-ink">{n}</span><span className="text-ink-3">{i === 0 ? "Responsable" : "Colaborador"}</span></li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "cobros" && (
          <div className="divide-y divide-line">
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
              <FileSignature size={18} className="text-gold-ink" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-ink">Contrato de prestación de servicios</p>
                <p className="text-[13px] text-ink-3">{p.id === 21 ? "Versión 2 · firmado el 18 sep. · copia enviada al cliente" : "Borrador · sin enviar a firma"}</p>
              </div>
              {p.id === 21 ? <Tag tone="ok" icon={CheckCircle2}>Firmado</Tag> : <Tag>Borrador</Tag>}
            </div>
            {cobros.length === 0 ? <Empty icon={FileText} title="Sin cuentas de cobro en este proceso" action={<Button variant="secondary" icon={Plus}>Nueva cuenta de cobro</Button>} /> : cobros.map((c) => (
              <div key={c.numero} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">{c.numero} · {c.concepto}</p>
                  <p className="text-[13px] text-ink-3">Vence {fechaCorta(c.vence)}</p>
                </div>
                <span className="text-[15px] font-semibold text-ink tnum">{pesos(c.valor)}</span>
                <EstadoCobro estado={c.estado} />
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <AvisarDrawer open={!!avisar} folio={avisar} onClose={() => setAvisar(null)} onDone={(t) => { setAvisar(null); toast(t); }} />
      <TareaDrawer open={!!tarea} folio={tarea} onClose={() => setTarea(null)} onDone={(t) => { setTarea(null); toast(t); }} />
    </div>
  );
}

export function EstadoCobro({ estado }) {
  const m = { vencida: ["bad", "Vencida"], parcial: ["warn", "Pago parcial"], pagada: ["ok", "Pagada"], pendiente: ["neutral", "Pendiente"] }[estado];
  return <Tag tone={m[0]} icon={estado === "pagada" ? CheckCircle2 : undefined}>{m[1]}</Tag>;
}
