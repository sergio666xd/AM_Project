import React, { useRef, useState } from "react";
import {
  ArrowRight, Upload, CheckCircle2, CalendarDays, MessageCircle, Phone, ChevronDown, FileText, Download, AlertTriangle, Send, Mail, Smartphone, ShieldCheck, Clock, Loader2, ChevronLeft,
} from "lucide-react";
import { cx, Sheet, Button, Tag, Folio, Etapas, Empty, Notice, fechaLarga, fechaCorta, pesos, Textarea, Initials, SkeletonRows } from "./ui.jsx";
import { procesos, pendientesCliente, historiaCliente, cuentasCobro } from "./data.js";

const P = procesos.find((p) => p.id === 21);

function Titulo({ children, sub }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[30px] leading-tight text-ink sm:text-[36px]">{children}</h1>
      {sub && <p className="mt-2 text-ink-2">{sub}</p>}
    </div>
  );
}

/* ============================================================ INICIO */

export function ClienteInicio({ go, demo }) {
  const pend = demo === "vacio" ? [] : pendientesCliente;
  return (
    <div>
      <Titulo sub="Martes 27 de octubre">Buenos días, Hernán</Titulo>

      {demo === "cargando" ? <Sheet><SkeletonRows rows={3} /></Sheet> : pend.length > 0 ? (
        <section className="mb-8 rounded-2xl bg-gold-soft p-5 ring-1 ring-[color-mix(in_oklab,var(--gold)_45%,transparent)] sm:p-6">
          <h2 className="font-display text-[22px] text-ink">Necesitamos {pend.length === 1 ? "una cosa" : `${pend.length} cosas`} de usted</h2>
          <ul className="mt-4 space-y-3">
            {pend.map((x) => (
              <li key={x.id} className="flex flex-col gap-4 rounded-xl bg-sheet px-4 py-4 shadow-sheet sm:flex-row sm:items-center">
                <div className="sm:min-w-0 sm:flex-1">
                  <p className="font-semibold text-ink">{x.titulo}</p>
                  <p className="mt-0.5 text-[15px] text-ink-2">Antes del {fechaLarga(x.vence)}</p>
                </div>
                <Button size="lg" onClick={() => go({ page: "pendientes" })} icon={x.tipo === "documento" ? Upload : CheckCircle2}>{x.tipo === "documento" ? "Enviar documento" : "Confirmar"}</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Notice tone="ok" icon={CheckCircle2} title="Está al día" className="mb-8">No necesitamos nada de usted por ahora. Le avisaremos si eso cambia.</Notice>
      )}

      <Sheet className="overflow-hidden">
        <div className="border-b border-line px-5 py-5 sm:px-7">
          <h2 className="mt-1 font-display text-[24px] leading-snug text-ink">{P.nombre}</h2>
          <p className="mt-3 max-w-[62ch] text-ink-2">{P.resumenCliente}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 px-5 py-6 sm:px-7 md:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <p className="mb-4 text-[15px] font-semibold text-ink">En qué va</p>
            <Etapas etapas={P.etapas} actual={P.etapa} grande />
            <p className="mt-4 text-[15px] text-ink-2">Estamos en <b className="text-ink">{P.etapas[P.etapa].toLowerCase()}</b>: se hace la lista de bienes y deudas de su madre y se les pone valor.</p>
          </div>
          <div className="rounded-xl bg-manila px-5 py-4">
            <p className="flex items-center gap-2 text-[15px] text-ink-2"><CalendarDays size={18} /> Próxima fecha</p>
            <p className="mt-2 font-display text-[24px] leading-tight text-ink first-letter:uppercase">{fechaLarga(P.proximo.fecha)}</p>
            <p className="text-[15px] text-ink-2">{P.proximo.hora} · {P.proximo.texto}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-line bg-sheet-2 px-5 py-4 sm:px-7">
          <Button size="lg" iconRight={ArrowRight} onClick={() => go({ page: "proceso", id: 21 })}>Ver todo el proceso</Button>
          <Button size="lg" variant="secondary" icon={MessageCircle} onClick={() => go({ page: "mensajes" })}>Escribirle a su abogada</Button>
        </div>
      </Sheet>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-[22px] text-ink">Lo último en su proceso</h2>
        <Sheet className="overflow-hidden">
          <ul className="divide-y divide-line">
            {historiaCliente.slice(0, 3).map((h) => (
              <li key={h.folio} className={cx("flex gap-4 px-5 py-4 sm:px-7", h.nuevo && "bg-[color-mix(in_oklab,var(--gold-soft)_60%,transparent)]")}>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink-3">{fechaLarga(h.fecha)}{h.nuevo && <span className="ml-2 rounded bg-gold-soft px-1.5 py-0.5 text-[13px] font-semibold text-gold-ink">Nuevo</span>}</p>
                  <p className="mt-1 text-ink">{h.texto}</p>
                </div>
                <Folio n={h.folio} nuevo={h.nuevo} size="sm" />
              </li>
            ))}
          </ul>
        </Sheet>
      </section>
    </div>
  );
}

/* ============================================================ DETALLE DEL PROCESO */

export function ClienteProceso({ go }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <div>
      <button onClick={() => go({ page: "inicio" })} className="mb-4 inline-flex h-11 items-center gap-1 text-[16px] font-semibold text-ink-3 hover:text-ink"><ChevronLeft size={20} /> Inicio</button>
      <Titulo sub={`${P.despacho} · su abogada: Alejandra Muñoz`}>{P.nombre}</Titulo>

      <Sheet className="mb-8 px-5 py-6 sm:px-7">
        <h2 className="mb-5 font-display text-[22px] text-ink">En qué va su proceso</h2>
        <Etapas etapas={P.etapas} actual={P.etapa} grande />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-sheet-2 p-4 ring-1 ring-line">
            <p className="font-semibold text-ink">Ahora: {P.etapas[P.etapa].toLowerCase()}</p>
            <p className="mt-1 text-[16px] text-ink-2">Se presenta ante el juzgado la lista de bienes y deudas de su madre, con su valor. Los demás herederos pueden opinar sobre esa lista.</p>
          </div>
          <div className="rounded-xl bg-gold-soft p-4">
            <p className="font-semibold text-ink">Qué sigue</p>
            <p className="mt-1 text-[16px] text-ink-2">La audiencia del {fechaLarga(P.proximo.fecha)} a las {P.proximo.hora}. Antes necesitamos el certificado de tradición del apartamento.</p>
          </div>
        </div>
      </Sheet>

      <h2 className="mb-3 font-display text-[22px] text-ink">Historia del proceso</h2>
      <Sheet className="overflow-hidden">
        <ol className="divide-y divide-line">
          {historiaCliente.map((h) => (
            <li key={h.folio} className={cx("px-5 py-4 sm:px-7", h.nuevo && "bg-[color-mix(in_oklab,var(--gold-soft)_60%,transparent)]")}>
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink-3 first-letter:uppercase">{fechaLarga(h.fecha)}</p>
                  <p className="mt-1 text-ink">{h.texto}</p>
                  {h.tecnico && (
                    <button onClick={() => setAbierto(abierto === h.folio ? null : h.folio)} aria-expanded={abierto === h.folio} className="mt-2 inline-flex h-9 items-center gap-1 text-[15px] font-semibold text-navy-ink">
                      {abierto === h.folio ? "Ocultar" : "Ver"} cómo lo escribió el juzgado <ChevronDown size={16} className={cx("transition-transform", abierto === h.folio && "rotate-180")} />
                    </button>
                  )}
                  {abierto === h.folio && <p className="anim-fade mt-1 rounded-lg bg-manila px-3 py-2 text-[15px] italic text-ink-2">«{h.tecnico}»</p>}
                </div>
                <Folio n={h.folio} nuevo={h.nuevo} size="sm" />
              </div>
            </li>
          ))}
        </ol>
      </Sheet>

      <h2 className="mb-3 mt-8 font-display text-[22px] text-ink">Documentos</h2>
      <Sheet className="overflow-hidden">
        <ul className="divide-y divide-line">
          {[["Contrato de prestación de servicios (firmado)", "18 sep."], ["Registro civil de defunción", "26 oct."]].map(([t, d]) => (
            <li key={t} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-7">
              <FileText size={20} className="text-ink-3" />
              <div className="min-w-0 flex-1"><p className="font-semibold text-ink">{t}</p><p className="text-[15px] text-ink-3">{d}</p></div>
              <Button variant="secondary" icon={Download}>Descargar</Button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ============================================================ PENDIENTES */

export function ClientePendientes({ demo, toast }) {
  const [estado, setEstado] = useState({});
  const input = useRef(null);
  const [actual, setActual] = useState(null);
  const subir = (id, tooBig) => {
    setEstado((s) => ({ ...s, [id]: "subiendo" }));
    setTimeout(() => setEstado((s) => ({ ...s, [id]: tooBig ? "error" : "listo" })), 1300);
  };
  const lista = demo === "vacio" ? [] : pendientesCliente;
  return (
    <div>
      <Titulo sub="Todo lo que la firma le ha pedido, en un solo lugar.">Pendientes</Titulo>
      <input ref={input} type="file" className="hidden" onChange={() => { subir(actual, false); }} />
      {lista.length === 0 ? (
        <Sheet><Empty icon={CheckCircle2} title="No tiene pendientes">Cuando necesitemos un documento o una confirmación suya, aparecerá aquí y le avisaremos por correo y WhatsApp.</Empty></Sheet>
      ) : (
        <div className="space-y-4">
          {lista.map((x) => {
            const e = estado[x.id];
            return (
              <Sheet key={x.id} className="px-5 py-5 sm:px-7">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[19px] font-semibold text-ink">{x.titulo}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-2"><Clock size={16} /> Antes del {fechaLarga(x.vence)} · {x.habiles} días hábiles</p>
                    <p className="mt-3 max-w-[62ch] text-[16px] text-ink-2">{x.detalle}</p>
                  </div>
                  {e === "listo" ? <Tag tone="ok" icon={CheckCircle2} className="h-8 px-3 text-[14px]">{x.tipo === "documento" ? "Enviado" : "Confirmado"}</Tag> : null}
                </div>
                <div className="mt-5">
                  {x.tipo === "documento" ? (
                    e === "subiendo" ? (
                      <div className="flex items-center gap-3 rounded-xl bg-sheet-2 px-4 py-4 ring-1 ring-line"><Loader2 size={20} className="animate-spin text-navy" /><span className="text-ink-2">Enviando certificado-tradicion.pdf…</span></div>
                    ) : e === "listo" ? (
                      <p className="rounded-xl bg-ok-soft px-4 py-4 text-ok">Recibimos su documento. Alejandra lo revisará y le escribirá si falta algo.</p>
                    ) : (
                      <>
                        {e === "error" && <Notice tone="bad" title="El archivo pesa más de 20 MB" className="mb-3">Tómele una foto con el celular o envíe el PDF comprimido. Si no puede, escríbale a su abogada.</Notice>}
                        <button onClick={() => { setActual(x.id); input.current?.click(); }} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 py-8 text-center transition-colors hover:border-navy hover:bg-navy-soft">
                          <Upload size={26} className="text-navy-ink" />
                          <span className="text-[17px] font-semibold text-ink">Elegir el archivo o tomar una foto</span>
                          <span className="text-[15px] text-ink-3">PDF o foto, hasta 20 MB</span>
                        </button>
                        <button onClick={() => subir(x.id, true)} className="mt-2 text-[13px] text-ink-3 underline">(Prototipo: ver qué pasa con un archivo muy grande)</button>
                      </>
                    )
                  ) : e === "listo" ? null : (
                    <div className="flex flex-wrap gap-3">
                      <Button size="lg" icon={CheckCircle2} onClick={() => { setEstado((s) => ({ ...s, [x.id]: "listo" })); toast("Gracias, confirmamos su asistencia"); }}>Sí, asistiré</Button>
                      <Button size="lg" variant="secondary">No podré asistir</Button>
                    </div>
                  )}
                </div>
              </Sheet>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ MENSAJES */

export function ClienteMensajes() {
  const [txt, setTxt] = useState("");
  const [enviados, setEnviados] = useState([]);
  return (
    <div>
      <Titulo sub="Su abogada responde en horario de oficina, de lunes a viernes.">Mensajes</Titulo>
      <Sheet className="flex min-h-[520px] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Initials name="Alejandra Muñoz" size={44} />
          <div><p className="font-semibold text-ink">Alejandra Muñoz</p><p className="text-[15px] text-ink-3">Su abogada · Sucesión de Gloria Inés Restrepo</p></div>
        </div>
        <div className="flex-1 space-y-4 bg-sheet-2 px-5 py-6">
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-navy px-4 py-3 text-on-navy">Doctora, ya conseguí el registro de defunción. El certificado de tradición me lo entregan la otra semana.<p className="mt-1 text-right text-[13px] opacity-75">Sábado, 4:20 p. m.</p></div>
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-sheet px-4 py-3 text-ink shadow-sheet">Gracias, Hernán. Ya lo recibimos. Con el certificado de tradición quedamos listos para la audiencia.<p className="mt-1 text-[13px] text-ink-3">Lunes, 8:05 a. m.</p></div>
          {enviados.map((m, i) => <div key={i} className="anim-pop ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-navy px-4 py-3 text-on-navy">{m}<p className="mt-1 text-right text-[13px] opacity-75">Ahora</p></div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (txt.trim()) { setEnviados((v) => [...v, txt.trim()]); setTxt(""); } }} className="flex items-end gap-3 border-t border-line p-4">
          <Textarea rows={2} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escriba su mensaje" className="flex-1 resize-none text-[17px]" />
          <Button size="lg" type="submit" icon={Send} disabled={!txt.trim()}>Enviar</Button>
        </form>
      </Sheet>
      <p className="mt-4 flex items-center gap-2 text-[15px] text-ink-3"><Phone size={16} /> Si es urgente, llame al 604 288 1530.</p>
    </div>
  );
}

/* ============================================================ PAGOS */

export function ClientePagos() {
  const mias = cuentasCobro.filter((c) => c.cliente === "Hernán Restrepo Vélez");
  return (
    <div>
      <Titulo sub="Cuentas de cobro de su proceso y los pagos que hemos recibido.">Pagos</Titulo>
      <Notice tone="ok" icon={CheckCircle2} title="Está al día" className="mb-6">No tiene saldos pendientes con la firma.</Notice>
      <Sheet className="overflow-hidden">
        <ul className="divide-y divide-line">
          {mias.map((c) => (
            <li key={c.numero} className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-7">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{c.concepto}</p>
                <p className="text-[15px] text-ink-3">Cuenta de cobro {c.numero} · pagada el 2 de octubre</p>
              </div>
              <span className="font-display text-[22px] text-ink tnum">{pesos(c.valor)}</span>
              <Tag tone="ok" icon={CheckCircle2} className="h-8 px-3 text-[14px]">Pagada</Tag>
              <Button variant="secondary" icon={Download}>Recibo</Button>
            </li>
          ))}
        </ul>
      </Sheet>
      <p className="mt-4 text-[15px] text-ink-3">Estos documentos son cuentas de cobro y recibos de la firma; no son facturas electrónicas.</p>
    </div>
  );
}

/* ============================================================ PERFIL Y AVISOS */

export function ClientePerfil({ toast }) {
  const tipos = [["novedades", "Novedades de su proceso"], ["pendientes", "Cuando le pedimos algo"], ["fechas", "Recordatorio de audiencias y citas"], ["pagos", "Cuentas de cobro y recibos"]];
  const [pref, setPref] = useState({ novedades: { correo: true, whatsapp: true }, pendientes: { correo: true, whatsapp: true }, fechas: { correo: true, whatsapp: true }, pagos: { correo: true, whatsapp: false } });
  const [letra, setLetra] = useState("normal");
  return (
    <div>
      <Titulo>Perfil y avisos</Titulo>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Sheet className="overflow-hidden">
          <div className="border-b border-line px-5 py-4 sm:px-7"><h2 className="font-display text-[22px] text-ink">Cómo quiere que le avisemos</h2></div>
          <table className="w-full">
            <thead><tr className="text-left text-[15px] text-ink-3"><th className="px-5 py-3 font-semibold sm:px-7">Aviso</th><th className="w-24 px-2 py-3 text-center font-semibold"><Mail size={18} className="mx-auto" aria-hidden /><span className="text-[13px]">Correo</span></th><th className="w-24 px-2 py-3 text-center font-semibold"><MessageCircle size={18} className="mx-auto" aria-hidden /><span className="text-[13px]">WhatsApp</span></th></tr></thead>
            <tbody className="divide-y divide-line border-t border-line">
              {tipos.map(([k, l]) => (
                <tr key={k}>
                  <td className="px-5 py-4 text-ink sm:px-7">{l}</td>
                  {["correo", "whatsapp"].map((c) => (
                    <td key={c} className="px-2 py-4 text-center">
                      <button role="switch" aria-checked={pref[k][c]} aria-label={`${l} por ${c}`} onClick={() => setPref((p) => ({ ...p, [k]: { ...p[k], [c]: !p[k][c] } }))} className={cx("relative inline-flex h-7 w-12 items-center rounded-full transition-colors", pref[k][c] ? "bg-navy" : "bg-line-strong")}>
                        <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", pref[k][c] ? "translate-x-6" : "translate-x-1")} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-[15px] text-ink-3 sm:px-7">Siempre verá todo en este portal, aunque apague un canal.</p>
        </Sheet>
        <div className="space-y-6">
          <Sheet className="px-5 py-5">
            <h2 className="font-display text-[20px] text-ink">Tamaño de la letra</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[["normal", "Normal"], ["grande", "Más grande"]].map(([k, l]) => (
                <button key={k} onClick={() => { setLetra(k); document.documentElement.style.fontSize = k === "grande" ? "112%" : ""; }} aria-pressed={letra === k} className={cx("h-14 rounded-xl font-semibold transition-[background-color,box-shadow]", letra === k ? "bg-navy-soft text-navy-ink shadow-[0_0_0_2px_var(--navy)]" : "bg-sheet-2 text-ink-2 ring-1 ring-line")} style={{ fontSize: k === "grande" ? 19 : 16 }}>{l}</button>
              ))}
            </div>
          </Sheet>
          <Sheet className="px-5 py-5">
            <h2 className="font-display text-[20px] text-ink">Sus datos</h2>
            <dl className="mt-3 space-y-2 text-[16px]">
              <div><dt className="text-[14px] text-ink-3">Correo</dt><dd className="text-ink">hernan.restrepo@correo.co</dd></div>
              <div><dt className="text-[14px] text-ink-3">WhatsApp</dt><dd className="text-ink">300 418 2290</dd></div>
            </dl>
            <Button variant="secondary" className="mt-4" onClick={() => toast("Le enviamos la solicitud de cambio a su abogada")}>Pedir un cambio de datos</Button>
          </Sheet>
          <p className="flex items-start gap-2 text-[14px] text-ink-3"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> Sus documentos solo los ven usted y el equipo de la firma.</p>
        </div>
      </div>
    </div>
  );
}

export function ClienteAyuda() {
  const qs = [
    ["¿Qué es un folio?", "Cada cosa que pasa en su proceso queda numerada en orden, como las hojas del expediente del juzgado. Si habla con su abogada, puede decirle el número del folio para ubicarlo rápido."],
    ["¿Cada cuánto se actualiza?", "Revisamos la página de la Rama Judicial dos veces al día, a las 12:00 m. y a las 5:00 p. m. Si hay algo nuevo, se lo explicamos aquí."],
    ["¿Cómo envío un documento?", "En Pendientes, toque «Elegir el archivo o tomar una foto». Puede enviar un PDF o una foto tomada con el celular."],
  ];
  return (
    <div>
      <Titulo>Ayuda</Titulo>
      <Sheet className="divide-y divide-line">
        {qs.map(([q, a]) => <details key={q} className="group px-5 py-4 sm:px-7"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-[18px] font-semibold text-ink">{q}<ChevronDown size={20} className="text-ink-3 transition-transform group-open:rotate-180" /></summary><p className="mt-2 max-w-[62ch] text-ink-2">{a}</p></details>)}
      </Sheet>
    </div>
  );
}
