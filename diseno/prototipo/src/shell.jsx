import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Sun, Moon, Bell, Search, CalendarDays, CheckSquare, MessageSquare, FolderOpen, Hash, Users, FileText, FileSignature, Receipt,
  LayoutDashboard, UserCog, Activity, Plug, BookOpen, Settings, Globe, MoreHorizontal, LogOut, Inbox, Home, ClipboardList, Wallet, UserRound, CircleHelp, X, CornerDownLeft,
} from "lucide-react";
import { cx, Logo, Initials, IconButton, Folio, Radicado } from "./ui.jsx";
import { usuarios, procesos, clientes, tareas } from "./data.js";

/* ------------------------------------------------------------ navegación por rol */

export const NAV = {
  abogado: [
    { group: "Trabajo", items: [
      { id: "hoy", label: "Hoy", icon: Inbox, badge: 4 },
      { id: "tareas", label: "Tareas", icon: CheckSquare },
      { id: "agenda", label: "Agenda", icon: CalendarDays },
      { id: "mensajes", label: "Mensajes", icon: MessageSquare, badge: 1 },
    ] },
    { group: "Expedientes", items: [
      { id: "procesos", label: "Procesos", icon: FolderOpen },
      { id: "radicados", label: "Radicados", icon: Hash },
      { id: "clientes", label: "Clientes", icon: Users },
      { id: "documentos", label: "Documentos", icon: FileText },
    ] },
    { group: "Firma", items: [
      { id: "contratos", label: "Contratos", icon: FileSignature },
      { id: "cobros", label: "Cobros", icon: Receipt },
    ] },
  ],
  admin: [
    { group: null, items: [{ id: "resumen", label: "Resumen", icon: LayoutDashboard }] },
    { group: "Personas", items: [{ id: "usuarios", label: "Usuarios", icon: UserCog }] },
    { group: "Expedientes", items: [
      { id: "procesos", label: "Procesos", icon: FolderOpen },
      { id: "radicados", label: "Radicados", icon: Hash },
    ] },
    { group: "Sistema", items: [
      { id: "consultas", label: "Consultas y envíos", icon: Activity, badge: 1 },
      { id: "integraciones", label: "Integraciones", icon: Plug },
      { id: "glosario", label: "Plantillas y glosario", icon: BookOpen },
      { id: "auditoria", label: "Actividad y auditoría", icon: ClipboardList },
      { id: "firma", label: "Configuración de la firma", icon: Settings },
      { id: "sitio", label: "Contenido del sitio", icon: Globe },
    ] },
  ],
  cliente: [
    { group: null, items: [
      { id: "inicio", label: "Inicio", icon: Home },
      { id: "pendientes", label: "Pendientes", icon: ClipboardList, badge: 2 },
      { id: "mensajes", label: "Mensajes", icon: MessageSquare },
      { id: "pagos", label: "Pagos", icon: Wallet },
      { id: "perfil", label: "Perfil y avisos", icon: UserRound },
      { id: "ayuda", label: "Ayuda", icon: CircleHelp },
    ] },
  ],
};

const MOBILE = {
  abogado: ["hoy", "procesos", "tareas", "mensajes"],
  admin: ["resumen", "usuarios", "consultas", "auditoria"],
  cliente: ["inicio", "pendientes", "mensajes", "pagos"],
};

const flat = (role) => NAV[role].flatMap((g) => g.items);

const ROLE_USER = { abogado: usuarios.abogada, admin: usuarios.admin, cliente: usuarios.cliente };

/* ------------------------------------------------------------ búsqueda global */

function Busqueda({ open, onClose, go, role }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef(null);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => ref.current?.focus(), 10); } }, [open]);
  const res = useMemo(() => {
    const t = q.trim().toLowerCase();
    const P = procesos.filter((p) => role !== "cliente" || p.clienteId === 31);
    if (!t) return [{ grupo: "Recientes", items: P.slice(0, 4).map((p) => ({ k: "p" + p.id, titulo: p.nombre, sub: p.despacho, folio: p.folios, go: { page: "expediente", id: p.id } })) }];
    const num = t.replace(/\D/g, "");
    const pr = P.filter((p) => p.nombre.toLowerCase().includes(t) || p.cliente.toLowerCase().includes(t) || (num.length >= 4 && p.radicado.includes(num)));
    const cl = role === "cliente" ? [] : clientes.filter((c) => c.nombre.toLowerCase().includes(t) || c.documento.replace(/\D/g, "").includes(num || "x"));
    const ta = role === "cliente" ? [] : tareas.filter((x) => x.titulo.toLowerCase().includes(t));
    return [
      pr.length && { grupo: "Expedientes", items: pr.map((p) => ({ k: "p" + p.id, titulo: p.nombre, sub: p.radicado, radicado: num.length >= 4, folio: p.folios, go: { page: "expediente", id: p.id } })) },
      cl.length && { grupo: "Clientes", items: cl.map((c) => ({ k: "c" + c.id, titulo: c.nombre, sub: c.documento, go: { page: "clientes" } })) },
      ta.length && { grupo: "Tareas", items: ta.map((x) => ({ k: "t" + x.id, titulo: x.titulo, sub: procesos.find((p) => p.id === x.procesoId)?.nombre, go: { page: "tareas" } })) },
    ].filter(Boolean);
  }, [q, role]);
  const items = res.flatMap((g) => g.items);
  if (!open) return null;
  const elegir = (it) => { go(it.go); onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[10vh]" onKeyDown={(e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
      if (e.key === "Enter" && items[i]) elegir(items[i]);
    }}>
      <div className="anim-fade absolute inset-0 bg-[rgb(10_16_36/0.38)]" onClick={onClose} />
      <div className="anim-pop relative w-full max-w-[620px] overflow-hidden rounded-2xl bg-sheet shadow-pop" role="dialog" aria-label="Buscar">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-ink-3" />
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder={role === "cliente" ? "Buscar en sus procesos" : "Proceso, radicado, cliente o tarea"} className="h-14 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none" />
          <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 font-sans text-[11px] text-ink-3 sm:block">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-semibold text-ink">Nada coincide con «{q}»</p>
              <p className="mt-1 text-[14px] text-ink-3">Pruebe con el número de radicado completo o parte del nombre del cliente.</p>
            </div>
          ) : res.map((g) => (
            <div key={g.grupo} className="pb-1">
              <p className="px-4 pb-1 pt-2 text-[12px] font-semibold text-ink-3">{g.grupo}</p>
              {g.items.map((it) => {
                const idx = items.indexOf(it);
                return (
                  <button key={it.k} onMouseEnter={() => setI(idx)} onClick={() => elegir(it)} className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left", idx === i && "bg-manila")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink">{it.titulo}</p>
                      {it.radicado ? <Radicado numero={it.sub} copy={false} /> : <p className="truncate text-[13px] text-ink-3">{it.sub}</p>}
                    </div>
                    {it.folio && <Folio n={it.folio} size="sm" />}
                    {idx === i && <CornerDownLeft size={14} className="text-ink-3" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ campana */

function Campana({ role, go }) {
  const [open, setOpen] = useState(false);
  const avisos = role === "cliente"
    ? [{ t: "Nueva fecha en su proceso", s: "Audiencia de inventarios: jueves 19 de noviembre", h: "Hoy, 7:42 a. m.", go: { page: "proceso", id: 21 } }, { t: "Le pedimos un documento", s: "Certificado de tradición y libertad", h: "9 oct.", go: { page: "pendientes" } }]
    : role === "admin"
    ? [{ t: "Consulta fallida", s: "1 radicado sin respuesta de la Rama Judicial", h: "Hoy, 7:41 a. m.", go: { page: "consultas" } }, { t: "Cliente sin activar", s: "Marta Lucía Gómez no ha ingresado", h: "Hace 4 días", go: { page: "usuarios" } }]
    : [{ t: "3 folios nuevos", s: "Expedientes 24, 21 y 23", h: "Hoy, 7:42 a. m.", go: { page: "hoy" } }, { t: "Claudia Ríos le escribió", s: "¿La audiencia de hoy es por la misma plataforma?", h: "7:58 a. m.", go: { page: "mensajes" } }, { t: "Documento recibido", s: "Registro civil de defunción · Exp. 21", h: "Ayer", go: { page: "expediente", id: 21 } }];
  return (
    <div className="relative">
      <IconButton icon={Bell} label="Avisos" badge={avisos.length} onClick={() => setOpen((v) => !v)} />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="anim-pop absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl bg-sheet shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[14px] font-semibold text-ink">Avisos</p>
              <button className="text-[13px] font-semibold text-navy-ink hover:underline" onClick={() => setOpen(false)}>Marcar todo como leído</button>
            </div>
            <ul className="divide-y divide-line">
              {avisos.map((a) => (
                <li key={a.t}>
                  <button onClick={() => { go(a.go); setOpen(false); }} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-sheet-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink">{a.t}</span>
                      <span className="block truncate text-[13px] text-ink-2">{a.s}</span>
                      <span className="block text-[12px] text-ink-3">{a.h}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ menú de cuenta */

function Cuenta({ role, theme, setTheme, onExit, compact }) {
  const [open, setOpen] = useState(false);
  const u = ROLE_USER[role];
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className={cx("flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors", compact ? "hover:bg-manila" : "hover:bg-rail-active")} aria-label="Cuenta">
        <Initials name={u.nombre} size={32} className={compact ? "" : "bg-[#24427f] text-[#f4f1e8]"} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-[#f4f1e8]">{u.corto}</span>
            <span className="block truncate text-[12px] text-[#b9c3dc]">{u.rol}</span>
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cx("anim-pop absolute z-50 w-60 overflow-hidden rounded-xl bg-sheet p-1.5 shadow-pop", compact ? "right-0 top-12" : "bottom-14 left-0")}>
            <p className="px-2.5 pb-1.5 pt-1 text-[12px] text-ink-3">{u.correo}</p>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-ink hover:bg-manila">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Tema claro" : "Tema oscuro"}
            </button>
            <button onClick={onExit} className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-ink hover:bg-manila"><LogOut size={16} /> Cerrar sesión</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ hoja "Más" en móvil */

function MasSheet({ open, onClose, role, page, go }) {
  if (!open) return null;
  const rest = flat(role).filter((x) => !MOBILE[role].includes(x.id));
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="anim-fade absolute inset-0 bg-[rgb(10_16_36/0.38)]" onClick={onClose} />
      <div className="anim-sheet absolute inset-x-0 bottom-0 rounded-t-2xl bg-sheet pb-[max(env(safe-area-inset-bottom),12px)] shadow-pop">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <p className="font-display text-[19px] text-ink">Más secciones</p>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {rest.map((it) => (
            <button key={it.id} onClick={() => { go({ page: it.id }); onClose(); }} className={cx("flex flex-col items-center gap-1.5 rounded-xl px-2 py-3.5 text-[13px] font-semibold", page === it.id ? "bg-navy-soft text-navy-ink" : "text-ink-2 hover:bg-manila")}>
              <it.icon size={20} strokeWidth={1.75} />
              <span className="leading-tight">{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ shell interno (abogado y administración) */

export function AppShell({ role, page, go, theme, setTheme, onExit, children, title }) {
  const [busca, setBusca] = useState(false);
  const [mas, setMas] = useState(false);
  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setBusca(true); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const activo = page === "expediente" ? "procesos" : page;
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* barra lateral: escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-rail text-[#f4f1e8] lg:flex">
        <div className="px-5 pb-5 pt-6">
          <Logo variant="reversed" className="h-auto w-[196px]" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Principal">
          {NAV[role].map((g, gi) => (
            <div key={gi} className={gi ? "mt-5" : ""}>
              {g.group && <p className="mb-1.5 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#9fb0d4]">{g.group}</p>}
              <ul className="space-y-0.5">
                {g.items.map((it) => {
                  const on = activo === it.id;
                  return (
                    <li key={it.id}>
                      <button
                        onClick={() => go({ page: it.id })}
                        aria-current={on ? "page" : undefined}
                        className={cx(
                          "relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
                          on ? "bg-rail-active font-semibold text-[#f4f1e8]" : "text-[#c9d1e6] hover:bg-rail-active hover:text-[#f4f1e8]"
                        )}
                      >
                        <it.icon size={18} strokeWidth={on ? 2 : 1.75} className={on ? "text-gold" : ""} />
                        <span className="flex-1 text-left">{it.label}</span>
                        {it.badge ? <span className={cx("rounded px-1.5 text-[11.5px] font-bold tnum", on ? "bg-gold text-[#2b220a]" : "bg-[#24427f] text-[#f4f1e8]")}>{it.badge}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Cuenta role={role} theme={theme} setTheme={setTheme} onExit={onExit} />
        </div>
      </aside>

      {/* barra superior */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-ground/92 px-3 backdrop-blur-md sm:px-5 lg:h-16">
        <Logo variant="emblem" className="h-8 w-8 lg:hidden" />
        
        <button onClick={() => setBusca(true)} className="ml-auto hidden h-10 w-full max-w-[440px] items-center gap-2.5 rounded-lg bg-sheet px-3 text-[14px] text-ink-3 shadow-[0_0_0_1px_var(--line-strong)] transition-shadow hover:shadow-[0_0_0_1px_var(--ink-3)] sm:flex lg:ml-0">
          <Search size={16} />
          <span className="flex-1 text-left">Buscar proceso, radicado o cliente</span>
          <kbd className="rounded border border-line-strong px-1.5 font-sans text-[11px]">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-0.5 sm:ml-2 lg:ml-auto">
          <IconButton icon={Search} label="Buscar" onClick={() => setBusca(true)} className="sm:hidden" />
          <IconButton icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? "Tema claro" : "Tema oscuro"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="hidden sm:inline-flex" />
          <Campana role={role} go={go} />
          <div className="lg:hidden"><Cuenta role={role} theme={theme} setTheme={setTheme} onExit={onExit} compact /></div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">{children}</main>

      {/* barra inferior: móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Principal">
        {MOBILE[role].map((id) => {
          const it = flat(role).find((x) => x.id === id);
          const on = activo === id;
          return (
            <button key={id} onClick={() => go({ page: id })} aria-current={on ? "page" : undefined} className={cx("relative flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-semibold", on ? "text-navy-ink" : "text-ink-3")}>
              {on && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-gold" />}
              <span className="relative">
                <it.icon size={22} strokeWidth={on ? 2 : 1.75} />
                {it.badge ? <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white tnum">{it.badge}</span> : null}
              </span>
              {it.label.split(" ")[0]}
            </button>
          );
        })}
        <button onClick={() => setMas(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-semibold text-ink-3">
          <MoreHorizontal size={22} strokeWidth={1.75} />
          Más
        </button>
      </nav>

      <MasSheet open={mas} onClose={() => setMas(false)} role={role} page={page} go={go} />
      <Busqueda open={busca} onClose={() => setBusca(false)} go={go} role={role} />
    </div>
  );
}

/* ------------------------------------------------------------ shell del cliente: más simple, letra más grande */

export function ClientShell({ page, go, theme, setTheme, onExit, children }) {
  const [mas, setMas] = useState(false);
  const activo = page === "proceso" ? "inicio" : page;
  const items = NAV.cliente[0].items;
  return (
    <div className="lectura min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-sheet/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-4 px-4 sm:h-[72px] sm:px-6">
          <Logo variant="landscape" className="hidden h-12 w-auto dark:hidden sm:block" />
          <Logo variant="reversed" className="hidden h-12 w-auto dark:sm:block" />
          <Logo variant="emblem" className="h-10 w-10 sm:hidden" />
          <p className="font-display text-[19px] text-ink sm:hidden">Su portal</p>
          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Principal">
            {items.slice(0, 5).map((it) => (
              <button key={it.id} onClick={() => go({ page: it.id })} aria-current={activo === it.id ? "page" : undefined} className={cx("relative flex h-11 items-center gap-2 rounded-lg px-3.5 text-[16px] font-semibold transition-colors", activo === it.id ? "text-navy-ink" : "text-ink-2 hover:bg-manila hover:text-ink")}>
                {it.label}
                {it.badge ? <span className="rounded bg-gold px-1.5 text-[12px] font-bold text-[#2b220a] tnum">{it.badge}</span> : null}
                {activo === it.id && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-t bg-gold" />}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Campana role="cliente" go={go} />
            <Cuenta role="cliente" theme={theme} setTheme={setTheme} onExit={onExit} compact />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] px-4 pb-32 pt-6 sm:px-6 lg:pb-16 lg:pt-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Principal">
        {MOBILE.cliente.map((id) => {
          const it = items.find((x) => x.id === id);
          const on = activo === id;
          return (
            <button key={id} onClick={() => go({ page: id })} aria-current={on ? "page" : undefined} className={cx("relative flex h-[68px] flex-col items-center justify-center gap-1 text-[13px] font-semibold", on ? "text-navy-ink" : "text-ink-3")}>
              {on && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-gold" />}
              <span className="relative">
                <it.icon size={24} strokeWidth={on ? 2 : 1.75} />
                {it.badge ? <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-[#2b220a] tnum">{it.badge}</span> : null}
              </span>
              {it.label.split(" ")[0]}
            </button>
          );
        })}
        <button onClick={() => setMas(true)} className="flex h-[68px] flex-col items-center justify-center gap-1 text-[13px] font-semibold text-ink-3">
          <MoreHorizontal size={24} strokeWidth={1.75} />
          Más
        </button>
      </nav>
      <MasSheet open={mas} onClose={() => setMas(false)} role="cliente" page={page} go={go} />
    </div>
  );
}
