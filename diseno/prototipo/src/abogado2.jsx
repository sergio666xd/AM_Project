import React, { useMemo, useState } from "react";
import {
  List, Columns3, CalendarDays, Plus, CheckCircle2, Link2, Copy, Video, MapPin, PenLine, Send, Paperclip, ChevronLeft, Users, Hash, RefreshCw,
  FileText, ClipboardList, Download, FileSignature, Receipt, AlertTriangle, Bell, Phone, Building2, UserRound,
} from "lucide-react";
import {
  cx, Sheet, SheetHeader, PageTitle, Button, Tag, Folio, Radicado, Habiles, Empty, SkeletonRows, Initials, SearchInput, Select, Segmented, Drawer, Field, Input, Textarea,
  fechaCorta, fechaLarga, diaSemana, pesos, Notice,
} from "./ui.jsx";
import { procesos, tareas, agendaSemana, conversaciones, clientes, cuentasCobro, foliosNuevos } from "./data.js";
import { EstadoCobro } from "./abogado.jsx";

const proc = (id) => procesos.find((p) => p.id === id);

/* ============================================================ TAREAS */

export function Tareas({ go, demo, toast }) {
  const [vista, setVista] = useState("lista");
  const [mias, setMias] = useState("todas");
  const [q, setQ] = useState("");
  const [hechas, setHechas] = useState(() => Object.fromEntries(tareas.map((t) => [t.id, t.estado === "hecha"])));
  const lista = (demo === "vacio" ? [] : tareas).filter((t) => (mias === "todas" || t.responsable === "Alejandra Muñoz") && (!q || (t.titulo + proc(t.procesoId).nombre).toLowerCase().includes(q.toLowerCase())));
  const toggle = (t) => { setHechas((h) => ({ ...h, [t.id]: !h[t.id] })); if (!hechas[t.id]) toast(`«${t.titulo}» completada`); };
  const abiertas = lista.filter((t) => !hechas[t.id]).sort((a, b) => (a.habiles ?? 99) - (b.habiles ?? 99));
  const cerradas = lista.filter((t) => hechas[t.id]);

  return (
    <div className="space-y-5">
      <PageTitle title="Tareas" sub={`${tareas.filter((t) => t.estado !== "hecha").length} abiertas · 1 vencida`} actions={<Button icon={Plus}>Nueva tarea</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={vista} onChange={setVista} options={[{ id: "lista", label: "Lista", icon: List }, { id: "tablero", label: "Tablero", icon: Columns3 }, { id: "calendario", label: "Calendario", icon: CalendarDays }]} />
        <Segmented value={mias} onChange={setMias} options={[{ id: "mias", label: "Mías" }, { id: "todas", label: "De la firma" }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Buscar tarea o proceso" className="ml-auto w-full sm:w-[280px]" />
      </div>

      {demo === "cargando" ? <Sheet><SkeletonRows rows={6} /></Sheet> : lista.length === 0 ? (
        <Sheet><Empty icon={CheckCircle2} title={demo === "vacio" ? "No hay tareas" : "Ninguna tarea coincide"} action={<Button icon={Plus}>Nueva tarea</Button>}>Las tareas también se crean desde cada folio nuevo en Hoy, con el término ya calculado.</Empty></Sheet>
      ) : vista === "lista" ? (
        <Sheet className="overflow-hidden">
          <ul className="divide-y divide-line">
            {[...abiertas, ...cerradas].map((t) => {
              const p = proc(t.procesoId), h = hechas[t.id];
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <input type="checkbox" checked={h} onChange={() => toggle(t)} className="h-[18px] w-[18px] shrink-0 accent-[var(--navy)]" aria-label={`Completar ${t.titulo}`} />
                  <div className="min-w-0 flex-1">
                    <p className={cx("text-[14.5px] font-semibold", h ? "text-ink-3 line-through" : "text-ink")}>{t.titulo}</p>
                    <p className="truncate text-[13px] text-ink-3">
                      <button onClick={() => go({ page: "expediente", id: p.id })} className="hover:text-ink hover:underline">{p.nombre}</button>
                      {t.origen && <> · {t.origen}</>}
                    </p>
                  </div>
                  <span className="hidden items-center gap-2 text-[13px] text-ink-2 md:flex"><Initials name={t.responsable} size={24} />{t.responsable.split(" ")[0]}</span>
                  {t.prioridad === "alta" && !h && <Tag tone="bad" className="hidden sm:inline-flex">Alta</Tag>}
                  <div className="w-[150px] text-right">{h ? <Tag tone="ok" icon={CheckCircle2}>Hecha</Tag> : <Habiles n={t.habiles} vence={t.vence} />}</div>
                </li>
              );
            })}
          </ul>
        </Sheet>
      ) : vista === "tablero" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[["pendiente", "Pendientes"], ["en curso", "En curso"], ["hecha", "Hechas"]].map(([k, l]) => {
            const col = lista.filter((t) => (k === "hecha" ? hechas[t.id] : !hechas[t.id] && t.estado === k));
            return (
              <div key={k} className="rounded-xl bg-manila p-2">
                <p className="flex items-center justify-between px-2 pb-2 pt-1 text-[13.5px] font-semibold text-ink">{l}<span className="text-ink-3 tnum">{col.length}</span></p>
                <div className="space-y-2">
                  {col.map((t) => (
                    <div key={t.id} className="rounded-lg bg-sheet p-3 shadow-sheet">
                      <p className="text-[14px] font-semibold leading-snug text-ink">{t.titulo}</p>
                      <p className="mt-1 truncate text-[12.5px] text-ink-3">{proc(t.procesoId).nombre}</p>
                      <div className="mt-2.5 flex items-center justify-between"><Initials name={t.responsable} size={24} />{hechas[t.id] ? <Tag tone="ok">Hecha</Tag> : <Habiles n={t.habiles} vence={t.vence} />}</div>
                    </div>
                  ))}
                  {col.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-ink-3">Nada aquí</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Calendario lista={lista} hechas={hechas} />
      )}
    </div>
  );
}

function Calendario({ lista, hechas }) {
  const dias = Array.from({ length: 35 }, (_, i) => { const f = new Date(Date.UTC(2026, 9, 26 + i)); return f.toISOString().slice(0, 10); });
  return (
    <Sheet className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="font-display text-[18px] text-ink">Octubre y noviembre de 2026</p>
        <span className="text-[13px] text-ink-3">Los festivos aparecen sombreados</span>
      </div>
      <div className="grid grid-cols-7 border-b border-line bg-sheet-2 text-center text-[12px] font-semibold text-ink-3">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d, i) => {
          const items = lista.filter((t) => t.vence === d);
          const hoy = d === "2026-10-27", festivo = ["2026-11-02", "2026-11-16"].includes(d), finde = i % 7 >= 5;
          return (
            <div key={d} className={cx("min-h-[92px] border-b border-r border-line p-1.5", (festivo || finde) && "bg-manila/60")}>
              <p className={cx("mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tnum", hoy ? "bg-navy font-bold text-on-navy" : "text-ink-3")}>{Number(d.slice(8))}</p>
              {festivo && <p className="text-[10.5px] text-ink-3">Festivo</p>}
              {items.map((t) => (
                <p key={t.id} className={cx("mb-0.5 truncate rounded px-1.5 py-0.5 text-[11.5px] font-semibold", hechas[t.id] ? "bg-ok-soft text-ok line-through" : t.habiles != null && t.habiles <= 3 ? "bg-bad-soft text-bad" : "bg-navy-soft text-navy-ink")} title={t.titulo}>{t.titulo}</p>
              ))}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ============================================================ AGENDA */

export function Agenda({ go, toast }) {
  const [ics, setIcs] = useState(false);
  return (
    <div className="space-y-5">
      <PageTitle title="Agenda" sub="Semana del 26 al 31 de octubre" actions={<><Button variant="secondary" icon={Link2} onClick={() => setIcs(true)}>Suscribir en mi calendario</Button><Button icon={Plus}>Nuevo evento</Button></>} />
      <Sheet className="overflow-hidden">
        <ul className="divide-y divide-line">
          {agendaSemana.map((d) => (
            <li key={d.dia} className="grid gap-3 px-4 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:px-5">
              <div>
                <p className={cx("font-display text-[18px] first-letter:uppercase", d.dia === "2026-10-27" ? "text-navy-ink" : "text-ink")}>{diaSemana(d.dia)}</p>
                <p className="text-[13px] text-ink-3">{fechaCorta(d.dia)}{d.dia === "2026-10-27" && " · hoy"}</p>
              </div>
              {d.items.length === 0 ? <p className="self-center text-[14px] text-ink-3">Sin eventos</p> : (
                <div className="space-y-2">
                  {d.items.map((a) => (
                    <div key={a.titulo} className="flex flex-wrap items-center gap-3 rounded-lg bg-sheet-2 px-3 py-2.5 ring-1 ring-line">
                      <span className="w-[136px] text-[13.5px] font-semibold text-ink tnum">{a.hora} – {a.fin}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-semibold text-ink">{a.titulo}</p>
                        <p className="flex items-center gap-1 text-[13px] text-ink-3">{a.lugar.startsWith("Virtual") ? <Video size={13} /> : <MapPin size={13} />}{a.lugar}{a.procesoId && <> · <button onClick={() => go({ page: "expediente", id: a.procesoId })} className="font-semibold text-navy-ink hover:underline">{proc(a.procesoId).nombre}</button></>}</p>
                      </div>
                      <Tag tone={a.tipo === "audiencia" ? "navy" : a.tipo === "firma" ? "gold" : "neutral"}>{a.tipo === "audiencia" ? "Audiencia" : a.tipo === "firma" ? "Firma" : "Reunión"}</Tag>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
      <Drawer open={ics} onClose={() => setIcs(false)} title="Suscribir la agenda" sub="Google Calendar, Outlook o el calendario del celular" footer={<Button onClick={() => { setIcs(false); toast("Enlace copiado"); }} icon={Copy}>Copiar enlace</Button>}>
        <div className="space-y-4 text-[14px] text-ink-2">
          <p>Pegue este enlace en su calendario como «calendario desde URL». Se actualiza solo cuando cambian audiencias, firmas y reuniones.</p>
          <div className="break-all rounded-lg bg-manila px-3 py-3 font-mono text-[12.5px] text-ink">https://procesos.amabogados.co/api/v2/agenda/feed.ics?token=7f3c…e91a</div>
          <Notice tone="navy" title="El enlace es personal">Quien lo tenga puede ver su agenda. Si lo comparte por error, genere uno nuevo desde aquí y el anterior dejará de funcionar.</Notice>
        </div>
      </Drawer>
    </div>
  );
}

/* ============================================================ MENSAJES */

export function Mensajes({ go }) {
  const [sel, setSel] = useState(null);
  const [txt, setTxt] = useState("");
  const [enviados, setEnviados] = useState([]);
  const c = conversaciones.find((x) => x.id === sel);
  return (
    <div className="space-y-5">
      <PageTitle title="Mensajes" />
      <Sheet className="grid min-h-[560px] overflow-hidden md:grid-cols-[320px_minmax(0,1fr)]">
        <ul className={cx("divide-y divide-line border-line md:block md:border-r", sel && "hidden")}>
          {conversaciones.map((x) => (
            <li key={x.id}>
              <button onClick={() => setSel(x.id)} className={cx("flex w-full gap-3 px-4 py-3.5 text-left transition-colors", sel === x.id ? "bg-navy-soft" : "hover:bg-sheet-2")}>
                <Initials name={x.con} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2"><span className="truncate text-[14px] font-semibold text-ink">{x.con}</span><span className="shrink-0 text-[12px] text-ink-3">{x.hora}</span></p>
                  <p className="truncate text-[12.5px] text-ink-3">{proc(x.procesoId).nombre}</p>
                  <p className="line-clamp-1 text-[13px] text-ink-2">{x.ultimo}</p>
                </div>
                {x.sinLeer > 0 && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold" aria-label="Sin leer" />}
              </button>
            </li>
          ))}
        </ul>
        {c ? (
          <div className="flex min-h-[560px] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button onClick={() => setSel(null)} className="md:hidden" aria-label="Volver"><ChevronLeft size={20} /></button>
              <Initials name={c.con} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-ink">{c.con}</p>
                <button onClick={() => go({ page: "expediente", id: c.procesoId })} className="truncate text-[12.5px] font-semibold text-navy-ink hover:underline">{proc(c.procesoId).nombre}</button>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-sheet-2 px-4 py-5">
              <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-sheet px-4 py-2.5 text-[14px] text-ink shadow-sheet">{c.ultimo}<p className="mt-1 text-right text-[11.5px] text-ink-3">{c.hora}</p></div>
              {enviados.map((m, i) => (
                <div key={i} className="anim-pop ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[14px] text-on-navy">{m}<p className="mt-1 text-right text-[11.5px] opacity-75">Ahora · queda como folio {proc(c.procesoId).folios + 1 + i}</p></div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; setEnviados((v) => [...v, txt.trim()]); setTxt(""); }} className="flex items-end gap-2 border-t border-line p-3">
              <Button type="button" variant="ghost" size="md" icon={Paperclip} aria-label="Adjuntar" className="w-10 px-0" />
              <Textarea rows={1} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escriba un mensaje" className="max-h-32 min-h-10 flex-1 resize-none" />
              <Button type="submit" icon={Send} disabled={!txt.trim()}>Enviar</Button>
            </form>
          </div>
        ) : (
          <div className="hidden md:block"><Empty icon={Send} title="Elija una conversación" className="h-full justify-center">Cada mensaje queda en el expediente del proceso como un folio.</Empty></div>
        )}
      </Sheet>
    </div>
  );
}

/* ============================================================ CLIENTES */

export function Clientes({ go, demo }) {
  const [q, setQ] = useState("");
  const lista = (demo === "vacio" ? [] : clientes).filter((c) => !q || (c.nombre + c.documento).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-5">
      <PageTitle title="Clientes" sub={`${clientes.length} clientes con acceso al portal`} actions={<Button icon={Plus}>Nuevo cliente</Button>} />
      <SearchInput value={q} onChange={setQ} placeholder="Nombre, cédula o NIT" className="max-w-[420px]" />
      <Sheet className="overflow-hidden">
        {demo === "cargando" ? <SkeletonRows /> : lista.length === 0 ? <Empty icon={Users} title={demo === "vacio" ? "Aún no hay clientes" : "Ningún cliente coincide"}>{demo === "vacio" ? "Cree un cliente para darle acceso a su portal y asociarlo a sus procesos." : "Pruebe con el número de documento sin puntos."}</Empty> : (
          <ul className="divide-y divide-line">
            {lista.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-manila text-ink-3">{c.tipo === "Persona jurídica" ? <Building2 size={17} /> : <UserRound size={17} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">{c.nombre}</p>
                  <p className="text-[13px] text-ink-3">{c.documento} · {c.ciudad} · {c.procesos} {c.procesos === 1 ? "proceso" : "procesos"}</p>
                </div>
                {c.pendiente && <Tag tone="gold">{c.pendiente}</Tag>}
                <span className="hidden text-[13px] text-ink-3 sm:inline">{c.ultimo}</span>
                <Button size="sm" variant="ghost" icon={Phone} aria-label={`WhatsApp ${c.whatsapp}`}>{c.whatsapp}</Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

/* ============================================================ RADICADOS */

export function Radicados({ go, toast }) {
  const [busy, setBusy] = useState(null);
  return (
    <div className="space-y-5">
      <PageTitle title="Radicados" sub="Consultados en la Rama Judicial todos los días a las 12:00 m. y 5:00 p. m." actions={<Button icon={Plus}>Agregar radicado</Button>} />
      <Sheet className="overflow-hidden">
        <ul className="divide-y divide-line">
          {procesos.filter((p) => p.estado === "activo").map((p) => {
            const n = foliosNuevos.find((f) => f.procesoId === p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Radicado numero={p.radicado} />
                  <p className="text-[13px] text-ink-3">{p.despacho} · <button onClick={() => go({ page: "expediente", id: p.id })} className="font-semibold text-navy-ink hover:underline">{p.nombre}</button></p>
                </div>
                <div className="text-[13px] sm:text-right">
                  {p.consultaFallida ? <Tag tone="warn" icon={AlertTriangle}>Sin respuesta hoy</Tag> : n ? <span className="font-semibold text-ink">{n.titulo}</span> : <span className="text-ink-3">Sin novedades</span>}
                  <p className="text-[12px] text-ink-3">{p.actualizado}</p>
                </div>
                <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy === p.id} onClick={() => { setBusy(p.id); setTimeout(() => { setBusy(null); toast("Consultado: sin actuaciones nuevas"); }, 900); }}>Consultar</Button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

/* ============================================================ DOCUMENTOS */

export function Documentos({ go }) {
  const [vista, setVista] = useState("pedidos");
  return (
    <div className="space-y-5">
      <PageTitle title="Documentos" actions={<Button icon={Plus}>Pedir documento</Button>} />
      <Segmented value={vista} onChange={setVista} options={[{ id: "pedidos", label: "Pedidos a clientes" }, { id: "recibidos", label: "Recibidos" }]} />
      <Sheet className="overflow-hidden">
        {vista === "pedidos" ? (
          <ul className="divide-y divide-line">
            {[["Certificado de tradición y libertad", 21, "2026-11-03", 4, "Esperando al cliente"], ["Certificado de existencia y representación", 24, "2026-10-30", 3, "Esperando al cliente"], ["Copia del reglamento de propiedad horizontal", 22, "2026-10-23", -2, "Vencido"]].map(([t, id, v, h, e]) => (
              <li key={t} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <ClipboardList size={18} className="text-gold-ink" />
                <div className="min-w-0 flex-1"><p className="text-[14.5px] font-semibold text-ink">{t}</p><p className="text-[13px] text-ink-3">{proc(id).cliente} · {proc(id).nombre}</p></div>
                <Tag tone={h < 0 ? "bad" : "gold"}>{e}</Tag>
                <div className="w-[118px] text-right"><Habiles n={h} vence={v} /></div>
                <Button size="sm" variant="ghost" icon={Bell}>Recordar</Button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-line">
            {[["Registro civil de defunción", 21, 87, "26 oct.", "Hernán Restrepo"], ["Contrato de arrendamiento del local", 24, 28, "15 oct.", "Inversiones Montañas del Sur"], ["Estado de cuenta del apartamento 1204", 22, 41, "2 oct.", "Aires de Sabaneta"]].map(([t, id, f, d, de]) => (
              <li key={t} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <FileText size={18} className="text-ink-3" />
                <div className="min-w-0 flex-1"><p className="text-[14.5px] font-semibold text-ink">{t}</p><p className="text-[13px] text-ink-3">{de} · {d} · <button onClick={() => go({ page: "expediente", id })} className="font-semibold text-navy-ink hover:underline">{proc(id).nombre}</button></p></div>
                <Folio n={f} size="sm" />
                <Button size="sm" variant="ghost" icon={Download}>Descargar</Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

/* ============================================================ CONTRATOS */

export function Contratos({ go }) {
  const filas = [
    { p: 21, estado: ["ok", "Firmado"], det: "Versión 2 · firmado el 18 sep." },
    { p: 23, estado: ["ok", "Firmado"], det: "Versión 1 · firmado el 2 jul." },
    { p: 24, estado: ["gold", "En firma"], det: "Cita de firma: 28 oct., 9:00 a. m." },
    { p: 26, estado: ["neutral", "Borrador"], det: "Falta definir honorarios" },
  ];
  return (
    <div className="space-y-5">
      <PageTitle title="Contratos" sub="Contrato de prestación de servicios, desde la plantilla de la firma" actions={<Button icon={Plus}>Nuevo contrato</Button>} />
      <Sheet className="overflow-hidden">
        <ul className="divide-y divide-line">
          {filas.map((f) => (
            <li key={f.p} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <FileSignature size={18} className="text-gold-ink" />
              <div className="min-w-0 flex-1"><p className="text-[14.5px] font-semibold text-ink">{proc(f.p).cliente}</p><p className="text-[13px] text-ink-3">{proc(f.p).nombre} · {f.det}</p></div>
              <Tag tone={f.estado[0]} icon={f.estado[1] === "Firmado" ? CheckCircle2 : undefined}>{f.estado[1]}</Tag>
              <Button size="sm" variant="ghost" icon={PenLine}>Abrir</Button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ============================================================ COBROS */

export function Cobros({ go }) {
  const porCobrar = cuentasCobro.reduce((s, c) => s + c.valor - c.pagado, 0);
  const vencido = cuentasCobro.filter((c) => c.estado === "vencida").reduce((s, c) => s + c.valor - c.pagado, 0);
  return (
    <div className="space-y-5">
      <PageTitle title="Cobros" sub="Cuentas de cobro y pagos registrados a mano. El pago en línea llega en una fase posterior." actions={<><Button variant="secondary">Registrar pago</Button><Button icon={Plus}>Nueva cuenta de cobro</Button></>} />
      <div className="flex flex-wrap gap-x-10 gap-y-3 rounded-xl bg-manila px-5 py-4 text-[14px]">
        <p className="text-ink-2">Por cobrar <span className="ml-1 font-display text-[22px] text-ink tnum">{pesos(porCobrar)}</span></p>
        <p className="text-ink-2">Vencido <span className="ml-1 font-display text-[22px] text-bad tnum">{pesos(vencido)}</span></p>
        <p className="text-ink-2">Recibido en octubre <span className="ml-1 font-display text-[22px] text-ink tnum">{pesos(5200000)}</span></p>
      </div>
      <Sheet className="overflow-hidden">
        <table className="w-full text-left text-[14px]">
          <thead className="hidden border-b border-line bg-sheet-2 text-[12.5px] text-ink-3 md:table-header-group">
            <tr><th className="px-5 py-2.5 font-semibold">Cuenta</th><th className="px-3 py-2.5 font-semibold">Cliente</th><th className="px-3 py-2.5 font-semibold">Vence</th><th className="px-3 py-2.5 text-right font-semibold">Valor</th><th className="px-3 py-2.5 text-right font-semibold">Saldo</th><th className="px-5 py-2.5 font-semibold">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cuentasCobro.map((c) => (
              <tr key={c.numero} className="block px-4 py-3.5 md:table-row md:p-0">
                <td className="block md:table-cell md:px-5 md:py-3.5"><p className="font-semibold text-ink tnum">{c.numero}</p><p className="text-[13px] text-ink-3">{c.concepto}</p></td>
                <td className="block text-ink-2 md:table-cell md:px-3 md:py-3.5">{c.cliente}</td>
                <td className="hidden text-ink-2 md:table-cell md:px-3 md:py-3.5 tnum">{fechaCorta(c.vence)}</td>
                <td className="hidden text-right text-ink-2 md:table-cell md:px-3 md:py-3.5 tnum">{pesos(c.valor)}</td>
                <td className="block font-semibold text-ink md:table-cell md:px-3 md:py-3.5 md:text-right tnum">{pesos(c.valor - c.pagado)}</td>
                <td className="mt-1 block md:mt-0 md:table-cell md:px-5 md:py-3.5"><EstadoCobro estado={c.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>
    </div>
  );
}
