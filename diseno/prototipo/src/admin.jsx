import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, UserPlus, MoreHorizontal, Mail, Plus, Download, Pencil, Hammer, Eye, EyeOff, LogIn } from "lucide-react";
import { cx, Sheet, SheetHeader, PageTitle, Button, Tag, Radicado, Empty, SearchInput, Select, Segmented, Notice, Initials, SkeletonRows, Input, Field, Logo } from "./ui.jsx";
import { consultas, integraciones, usuariosAdmin, auditoria } from "./data.js";

const EST = { ok: ["ok", "Funcionando", CheckCircle2], degradado: ["warn", "Con fallas", AlertTriangle], caido: ["bad", "Sin servicio", AlertTriangle] };

/* ============================================================ RESUMEN */

export function AdminResumen({ go, demo, toast }) {
  const [busy, setBusy] = useState(false);
  const [hecho, setHecho] = useState(false);
  return (
    <div className="space-y-6">
      <PageTitle title="Resumen" sub="Estado de la plataforma de la firma, hoy martes 27 de octubre" />
      {!hecho && demo !== "vacio" && (
        <Notice title="Una consulta a la Rama Judicial falló" action={<Button size="sm" variant="secondary" icon={RefreshCw} loading={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); setHecho(true); toast("Radicado consultado: sin novedades"); }, 900); }}>Reintentar</Button>}>
          El radicado del proceso «Nulidad de sanción urbanística, Envigado» no respondió en dos intentos.
        </Notice>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Sheet>
          <SheetHeader title="Consultas a la Rama Judicial" action={<Button size="sm" variant="ghost" onClick={() => go({ page: "consultas" })}>Ver todas</Button>} />
          {demo === "cargando" ? <SkeletonRows rows={4} /> : (
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-line bg-sheet-2 text-[12.5px] text-ink-3"><tr><th className="px-4 py-2.5 font-semibold">Ejecución</th><th className="px-3 py-2.5 text-right font-semibold">Radicados</th><th className="px-3 py-2.5 text-right font-semibold">Folios nuevos</th><th className="px-4 py-2.5 text-right font-semibold">Fallidos</th></tr></thead>
              <tbody className="divide-y divide-line">
                {consultas.historial.map((h, i) => (
                  <tr key={h.hora}>
                    <td className="px-4 py-3 text-ink">{h.hora}<span className="block text-[12.5px] text-ink-3">{h.duracion}</span></td>
                    <td className="px-3 py-3 text-right text-ink-2 tnum">{h.radicados}</td>
                    <td className="px-3 py-3 text-right font-semibold text-ink tnum">{h.nuevas}</td>
                    <td className="px-4 py-3 text-right tnum">{h.fallidos && !(i === 0 && hecho) ? <span className="font-semibold text-warn">{h.fallidos}</span> : <span className="text-ink-3">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
        <Sheet>
          <SheetHeader title="Integraciones" action={<Button size="sm" variant="ghost" onClick={() => go({ page: "integraciones" })}>Configurar</Button>} />
          <ul className="divide-y divide-line">
            {integraciones.map((x) => {
              const e = x.nombre === "Rama Judicial" && hecho ? EST.ok : EST[x.estado];
              return (
                <li key={x.nombre} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold text-ink">{x.nombre}</p><p className="text-[12.5px] text-ink-3">{x.nombre === "Rama Judicial" && hecho ? "Todos los radicados respondieron" : x.detalle}</p></div>
                  <Tag tone={e[0]} icon={e[2]}>{e[1]}</Tag>
                </li>
              );
            })}
          </ul>
        </Sheet>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Sheet>
          <SheetHeader title="Requiere atención" count={2} />
          <ul className="divide-y divide-line">
            <li className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="text-[14px] font-semibold text-ink">Marta Lucía Gómez no ha activado su cuenta</p><p className="text-[12.5px] text-ink-3">Cliente de Aires de Sabaneta · invitada hace 4 días</p></div><Button size="sm" variant="secondary" icon={Mail} onClick={() => toast("Invitación reenviada")}>Reenviar</Button></li>
            <li className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="text-[14px] font-semibold text-ink">1 correo rebotó</p><p className="text-[12.5px] text-ink-3">beatriz.toro@correo.co · cuenta suspendida</p></div><Button size="sm" variant="ghost" onClick={() => go({ page: "consultas" })}>Ver envío</Button></li>
          </ul>
        </Sheet>
        <Sheet>
          <SheetHeader title="Actividad reciente" action={<Button size="sm" variant="ghost" onClick={() => go({ page: "auditoria" })}>Auditoría</Button>} />
          <ul className="divide-y divide-line">
            {auditoria.slice(0, 4).map((a) => (
              <li key={a.hora + a.accion} className="flex gap-3 px-4 py-3 text-[14px]"><span className="w-[92px] shrink-0 text-[12.5px] text-ink-3">{a.hora}</span><span className="min-w-0 text-ink-2"><b className="text-ink">{a.quien}</b> {a.accion.toLowerCase()} · {a.objeto}</span></li>
            ))}
          </ul>
        </Sheet>
      </div>
    </div>
  );
}

/* ============================================================ USUARIOS */

export function AdminUsuarios({ demo, toast }) {
  const [q, setQ] = useState("");
  const [rol, setRol] = useState("todos");
  const [est, setEst] = useState("todos");
  const lista = (demo === "vacio" ? [] : usuariosAdmin).filter((u) => (rol === "todos" || u.rol === rol) && (est === "todos" || u.estado === est) && (!q || (u.nombre + u.correo).toLowerCase().includes(q.toLowerCase())));
  const tone = { activo: ["ok", "Activo"], pendiente: ["gold", "Sin activar"], suspendido: ["neutral", "Suspendido"] };
  return (
    <div className="space-y-5">
      <PageTitle title="Usuarios" sub="Abogados, administración y clientes de la firma" actions={<Button icon={UserPlus}>Crear usuario</Button>} />
      <div className="flex flex-wrap gap-2 rounded-xl bg-manila p-2">
        <SearchInput value={q} onChange={setQ} placeholder="Nombre o correo" className="min-w-[220px] flex-1" />
        <Select value={rol} onChange={(e) => setRol(e.target.value)} className="w-auto min-w-[180px]" aria-label="Perfil">
          <option value="todos">Todos los perfiles</option>
          {["Abogada directora", "Abogado asociado", "Administración", "Cliente"].map((r) => <option key={r}>{r}</option>)}
        </Select>
        <Segmented value={est} onChange={setEst} className="bg-sheet/70" options={[{ id: "todos", label: "Todos" }, { id: "activo", label: "Activos" }, { id: "pendiente", label: "Sin activar" }, { id: "suspendido", label: "Suspendidos" }]} />
      </div>
      <Sheet className="overflow-hidden">
        {lista.length === 0 ? <Empty title="Ningún usuario coincide" action={<Button variant="secondary" onClick={() => { setQ(""); setRol("todos"); setEst("todos"); }}>Quitar filtros</Button>} /> : (
          <ul className="divide-y divide-line">
            {lista.map((u) => (
              <li key={u.correo} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Initials name={u.nombre} size={34} />
                <div className="min-w-0 flex-1"><p className="text-[14.5px] font-semibold text-ink">{u.nombre}</p><p className="truncate text-[13px] text-ink-3">{u.correo}</p></div>
                <span className="w-[150px] text-[13.5px] text-ink-2">{u.rol}</span>
                <Tag tone={tone[u.estado][0]}>{tone[u.estado][1]}</Tag>
                <span className="hidden w-[150px] text-right text-[13px] text-ink-3 md:inline">{u.ultimo}</span>
                <Button size="sm" variant="ghost" aria-label={`Acciones para ${u.nombre}`} icon={MoreHorizontal} className="w-8 px-0" />
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

/* ============================================================ CONSULTAS Y ENVÍOS */

export function AdminConsultas({ toast }) {
  const [tab, setTab] = useState("consultas");
  return (
    <div className="space-y-5">
      <PageTitle title="Consultas y envíos" sub="Cron diario a las 12:00 m. y 5:00 p. m., hora de Colombia" actions={<Button icon={RefreshCw} onClick={() => toast("Consulta de 41 radicados iniciada")}>Consultar todos ahora</Button>} />
      <Segmented value={tab} onChange={setTab} options={[{ id: "consultas", label: "Consultas" }, { id: "envios", label: "Correos y WhatsApp" }]} />
      {tab === "consultas" ? (
        <>
          <Sheet>
            <SheetHeader title="Radicados fallidos en la última ejecución" count={consultas.fallidos.length} />
            <ul className="divide-y divide-line">
              {consultas.fallidos.map((f) => (
                <li key={f.radicado} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1"><Radicado numero={f.radicado} /><p className="text-[13px] text-ink-3">{f.proceso}</p><p className="mt-1 text-[13px] text-warn">{f.error} · {f.intentos} intentos</p></div>
                  <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => toast("Reintento en curso")}>Reintentar</Button>
                </li>
              ))}
            </ul>
          </Sheet>
          <AdminResumenTabla />
        </>
      ) : (
        <Sheet>
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-line bg-sheet-2 text-[12.5px] text-ink-3"><tr><th className="px-4 py-2.5 font-semibold">Destinatario</th><th className="px-3 py-2.5 font-semibold">Qué</th><th className="px-3 py-2.5 font-semibold">Canal</th><th className="px-4 py-2.5 font-semibold">Resultado</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[["Hernán Restrepo", "Aviso folio 88", "WhatsApp", "ok"], ["Hernán Restrepo", "Aviso folio 88", "Correo", "ok"], ["Claudia Ríos", "Recordatorio de audiencia", "WhatsApp", "ok"], ["Beatriz Toro", "Resumen mensual", "Correo", "bad"]].map(([a, b, c, r], i) => (
                <tr key={i}><td className="px-4 py-3 font-semibold text-ink">{a}</td><td className="px-3 py-3 text-ink-2">{b}</td><td className="px-3 py-3 text-ink-2">{c}</td><td className="px-4 py-3">{r === "ok" ? <Tag tone="ok" icon={CheckCircle2}>Entregado</Tag> : <Tag tone="bad" icon={AlertTriangle}>Rebotó</Tag>}</td></tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}
    </div>
  );
}
function AdminResumenTabla() {
  return (
    <Sheet>
      <SheetHeader title="Ejecuciones" />
      <ul className="divide-y divide-line text-[14px]">
        {consultas.historial.map((h) => (
          <li key={h.hora} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3"><span className="flex-1 font-semibold text-ink">{h.hora}</span><span className="text-ink-2 tnum">{h.radicados} radicados</span><span className="text-ink-2 tnum">{h.nuevas} folios nuevos</span><span className={cx("tnum", h.fallidos ? "font-semibold text-warn" : "text-ink-3")}>{h.fallidos} fallidos</span><span className="text-ink-3 tnum">{h.duracion}</span></li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ============================================================ GLOSARIO */

export function AdminGlosario() {
  const filas = [
    ["Auto admite demanda", "El juzgado aceptó la demanda y el proceso empieza formalmente.", 14],
    ["Auto inadmite demanda", "El juzgado pidió corregir algunos puntos de la demanda antes de admitirla.", 6],
    ["Auto libra mandamiento de pago", "El juzgado aceptó la demanda y ordenó a la otra parte pagar lo que debe.", 9],
    ["Traslado de excepciones", "La otra parte se opuso a algunas pretensiones y tenemos unos días para responder.", 7],
    ["Auto fija fecha de audiencia", "El juzgado programó una audiencia. Le confirmaremos los detalles antes.", 22],
    ["Al despacho", "El expediente está en manos del juez para que tome una decisión.", 31],
  ];
  return (
    <div className="space-y-5">
      <PageTitle title="Plantillas y glosario" sub="Cómo se le explica al cliente cada tipo de actuación" actions={<Button icon={Plus}>Agregar término</Button>} />
      <Sheet className="overflow-hidden">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-line bg-sheet-2 text-[12.5px] text-ink-3"><tr><th className="px-4 py-2.5 font-semibold">Texto del juzgado</th><th className="px-3 py-2.5 font-semibold">Lo que lee el cliente</th><th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Usos en 2026</th><th className="w-12 px-4 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-line">
            {filas.map(([a, b, n]) => (
              <tr key={a}><td className="px-4 py-3 align-top font-semibold text-ink">{a}</td><td className="px-3 py-3 align-top text-ink-2">{b}</td><td className="hidden px-3 py-3 text-right align-top text-ink-3 sm:table-cell tnum">{n}</td><td className="px-2 py-2 align-top"><Button size="sm" variant="ghost" icon={Pencil} aria-label={`Editar ${a}`} className="w-8 px-0" /></td></tr>
            ))}
          </tbody>
        </table>
      </Sheet>
    </div>
  );
}

/* ============================================================ AUDITORÍA */

export function AdminAuditoria() {
  return (
    <div className="space-y-5">
      <PageTitle title="Actividad y auditoría" actions={<Button variant="secondary" icon={Download}>Exportar CSV</Button>} />
      <Sheet className="overflow-hidden">
        <ul className="divide-y divide-line">
          {auditoria.map((a) => (
            <li key={a.hora + a.accion} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-[14px] sm:px-5">
              <span className="w-[110px] shrink-0 text-ink-3 tnum">{a.hora}</span>
              <span className="w-[150px] shrink-0 font-semibold text-ink">{a.quien}</span>
              <span className="min-w-0 flex-1 text-ink-2">{a.accion} · {a.objeto}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

export function AdminIntegraciones() {
  return (
    <div className="space-y-5">
      <PageTitle title="Integraciones" />
      <div className="grid gap-4 md:grid-cols-2">
        {integraciones.map((x) => { const e = EST[x.estado]; return (
          <Sheet key={x.nombre} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3"><p className="font-semibold text-ink">{x.nombre}</p><Tag tone={e[0]} icon={e[2]}>{e[1]}</Tag></div>
            <p className="mt-1 text-[13.5px] text-ink-3">{x.detalle}</p>
            <div className="mt-4 flex gap-2"><Button size="sm" variant="secondary">Probar conexión</Button><Button size="sm" variant="ghost">Configurar</Button></div>
          </Sheet>
        ); })}
      </div>
    </div>
  );
}

export function FueraDeAlcance({ titulo }) {
  return (
    <div className="space-y-5">
      <PageTitle title={titulo} />
      <Sheet><Empty icon={Hammer} title="Esta sección no está en el prototipo">Existe hoy en la aplicación y se rediseña en la Fase 7 con este mismo sistema visual.</Empty></Sheet>
    </div>
  );
}

/* ============================================================ INGRESO */

export function Login({ onEnter }) {
  const [ver, setVer] = useState(false);
  const [correo, setCorreo] = useState("alejandra@amabogados.co");
  const [clave, setClave] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const entrar = (e) => {
    e.preventDefault();
    if (clave.length < 4) { setErr(true); return; }
    setErr(false); setBusy(true);
    setTimeout(() => onEnter(correo.includes("correo.co") ? "cliente" : "abogado"), 700);
  };
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative hidden flex-col justify-between bg-rail p-12 text-[#f4f1e8] lg:flex">
        <Logo variant="reversed" className="w-[300px]" />
        <div className="max-w-[440px]">
          <p className="font-display text-[34px] leading-tight">Cada proceso, folio por folio.</p>
          <p className="mt-3 text-[16px] text-[#c9d1e6]">El portal de la firma para abogados y clientes. Las actuaciones del juzgado llegan solas dos veces al día.</p>
        </div>
        <p className="text-[13px] text-[#9aa6c4]">Sabaneta, Antioquia</p>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <form onSubmit={entrar} className="w-full max-w-[400px]">
          <Logo variant="landscape" className="mb-10 w-[240px] dark:hidden lg:hidden" />
          <Logo variant="reversed" className="mb-10 hidden w-[240px] dark:block lg:hidden" />
          <h1 className="font-display text-[30px] text-ink">Ingresar</h1>
          <p className="mt-1 text-[15px] text-ink-3">Use el correo con el que la firma le dio acceso.</p>
          <div className="mt-7 space-y-4">
            <Field label="Correo"><Input type="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className="h-12 text-[16px]" /></Field>
            <Field label="Contraseña" error={err ? "La contraseña no coincide con ese correo. Revise mayúsculas o recupérela." : null}>
              <div className="relative">
                <Input type={ver ? "text" : "password"} autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} className="h-12 pr-12 text-[16px]" />
                <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:text-ink">{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between text-[14px]">
            <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--navy)]" /> Recordarme en este equipo</label>
            <button type="button" className="font-semibold text-navy-ink hover:underline">Olvidé mi contraseña</button>
          </div>
          <Button size="lg" type="submit" loading={busy} icon={LogIn} className="mt-6 w-full">Ingresar</Button>
          <p className="mt-6 text-[13px] text-ink-3">Prototipo: cualquier contraseña de 4 o más caracteres funciona. Un correo que termine en «correo.co» entra como cliente.</p>
        </form>
      </div>
    </div>
  );
}
