import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Check, Loader2, AlertTriangle, Search } from "lucide-react";
import { LOGO_LANDSCAPE, LOGO_LANDSCAPE_REV, LOGO_EMBLEM } from "./logo.js";

export const cx = (...c) => c.filter(Boolean).join(" ");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_C = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const d = (iso) => new Date(iso + "T12:00:00");
export const fechaLarga = (iso) => { const f = d(iso); return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`; };
export const fechaCorta = (iso) => { const f = d(iso); return `${f.getDate()} ${MESES_C[f.getMonth()]}`; };
export const diaSemana = (iso) => DIAS[d(iso).getDay()];
export const pesos = (n) => "$" + n.toLocaleString("es-CO").replace(/,/g, ".");

/* ------------------------------------------------------------ marca */

export function Logo({ variant = "landscape", className }) {
  const src = variant === "reversed" ? LOGO_LANDSCAPE_REV : variant === "emblem" ? LOGO_EMBLEM : LOGO_LANDSCAPE;
  return <img src={src} alt="Alejandra Muñoz, Abogada y Asociados" className={className} draggable={false} />;
}

/* ------------------------------------------------------------ folio: el gesto del sistema */

export function Folio({ n, nuevo, size = "md", className }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-baseline justify-center gap-1 rounded-[3px] border px-1.5 tnum transition-[background-color,border-color,color] duration-700 ease-out",
        nuevo ? "border-gold bg-gold-soft text-gold-ink" : "border-line-strong text-ink-3",
        size === "sm" ? "h-5 text-[11px]" : "h-6 text-[12px]",
        className
      )}
      title={`Folio ${n}`}
    >
      <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.06em]">Fl.</span>
      <span className={cx("folio-num font-semibold", size === "sm" ? "text-[13px]" : "text-[15px]")}>{n}</span>
    </span>
  );
}

/* ------------------------------------------------------------ radicado agrupado por segmentos */

const SEG = [[0, 5, "Ciudad"], [5, 7, "Entidad"], [7, 9, "Especialidad"], [9, 12, "Despacho"], [12, 16, "Año"], [16, 21, "Consecutivo"], [21, 23, "Recurso"]];
export function Radicado({ numero, copy = true, className }) {
  const [ok, setOk] = useState(false);
  const copiar = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(numero).catch(() => {});
    setOk(true);
    setTimeout(() => setOk(false), 1400);
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <span className="font-mono text-[12.5px] tracking-tight text-ink-2 tnum">
        {SEG.map(([a, b, t], i) => (
          <span key={i} title={t} className={i % 2 ? "text-ink-3" : ""}>
            {numero.slice(a, b)}
            {i < SEG.length - 1 && <span className="inline-block w-[3px]" />}
          </span>
        ))}
      </span>
      {copy && (
        <button onClick={copiar} aria-label="Copiar radicado" className="relative inline-flex h-6 w-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-manila hover:text-ink after:absolute after:-inset-2">
          <span className={cx("absolute transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]", ok ? "scale-25 opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0")}><Copy size={13} strokeWidth={1.75} /></span>
          <span className={cx("absolute text-ok transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]", ok ? "scale-100 opacity-100 blur-0" : "scale-25 opacity-0 blur-[4px]")}><Check size={13} strokeWidth={2.25} /></span>
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------ botones */

const VARIANTS = {
  primary: "bg-navy text-on-navy hover:bg-navy-hover shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_1px_2px_rgb(0_20_60/0.25)]",
  secondary: "bg-sheet text-ink shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(24_32_58/0.06)] hover:bg-sheet-2",
  ghost: "text-ink-2 hover:bg-manila hover:text-ink",
  gold: "bg-gold text-[#2b220a] hover:brightness-[1.04] shadow-[0_1px_2px_rgb(60_45_10/0.25)]",
  danger: "bg-sheet text-bad shadow-[0_0_0_1px_var(--line-strong)] hover:bg-bad-soft",
};
const SIZES = { sm: "h-8 px-2.5 text-[13px] gap-1.5 rounded-md", md: "h-10 px-3.5 text-[14px] gap-2 rounded-lg", lg: "h-12 px-5 text-[16px] gap-2 rounded-lg" };

export function Button({ variant = "primary", size = "md", icon: Icon, iconRight: IconR, loading, className, children, ...p }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,box-shadow,color,scale] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {loading ? <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" /> : Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2} className="-ml-0.5" />}
      {children}
      {IconR && <IconR size={size === "sm" ? 14 : 16} strokeWidth={2} className="-mr-0.5" />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, badge, size = 18, ...p }) {
  return (
    <button {...p} aria-label={label} title={label} className={cx("relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 transition-[background-color,color,scale] duration-150 hover:bg-manila hover:text-ink active:scale-[0.96]", className)}>
      <Icon size={size} strokeWidth={1.75} />
      {badge ? <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white tnum">{badge}</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------ etiquetas de estado (texto + icono, nunca solo color) */

const TONES = {
  neutral: "bg-manila text-ink-2",
  navy: "bg-navy-soft text-navy-ink",
  gold: "bg-gold-soft text-gold-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};
export function Tag({ tone = "neutral", icon: Icon, children, className }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold", TONES[tone], className)}>
      {Icon && <Icon size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ hojas */

export function Sheet({ className, children, as: As = "section", ...p }) {
  return <As {...p} className={cx("rounded-xl bg-sheet shadow-sheet", className)}>{children}</As>;
}

export function SheetHeader({ title, count, action, className }) {
  return (
    <div className={cx("flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5", className)}>
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        {title}
        {count != null && <span className="rounded bg-manila px-1.5 text-[12px] font-semibold text-ink-2 tnum">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ encabezado de página */

export function PageTitle({ title, sub, actions, className }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight text-ink sm:text-[30px]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ pestañas tipo carátula */

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx("-mb-px flex gap-1 overflow-x-auto", className)}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative flex h-10 shrink-0 items-center gap-1.5 rounded-t-lg px-3.5 text-[14px] font-semibold transition-colors",
              on ? "bg-sheet text-ink shadow-[0_-1px_0_var(--line),1px_0_0_var(--line),-1px_0_0_var(--line)]" : "text-ink-3 hover:bg-manila hover:text-ink"
            )}
          >
            {on && <span className="absolute inset-x-2.5 top-0 h-[2px] rounded-b bg-gold" />}
            {t.label}
            {t.count != null && <span className={cx("rounded px-1 text-[11px] tnum", on ? "bg-manila text-ink-2" : "text-ink-3")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* segmented control para cambiar de vista */
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx("inline-flex rounded-lg bg-manila p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === value}
          className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow]", o.id === value ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(24_32_58/0.12)]" : "text-ink-3 hover:text-ink")}
        >
          {o.icon && <o.icon size={14} strokeWidth={2} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ formularios */

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1.5 flex items-center gap-1 text-[12.5px] text-bad"><AlertTriangle size={13} />{error}</span> : hint ? <span className="mt-1.5 block text-[12.5px] text-ink-3">{hint}</span> : null}
    </label>
  );
}
const inputCls = "w-full rounded-lg bg-sheet px-3 text-[14px] text-ink shadow-[0_0_0_1px_var(--line-strong)] transition-shadow placeholder:text-ink-3 focus:shadow-[0_0_0_2px_var(--navy)] focus:outline-none";
export const Input = (p) => <input {...p} className={cx(inputCls, "h-10", p.className)} />;
export const Textarea = (p) => <textarea {...p} className={cx(inputCls, "py-2.5 leading-relaxed", p.className)} />;
export const Select = ({ children, ...p }) => <select {...p} className={cx(inputCls, "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", p.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23636b80' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>{children}</select>;

export function SearchInput({ value, onChange, placeholder, className }) {
  return (
    <div className={cx("relative", className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

/* ------------------------------------------------------------ panel lateral / hoja inferior en móvil */

export function Drawer({ open, onClose, title, sub, children, footer, width = 520 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <div className="anim-fade absolute inset-0 bg-[rgb(10_16_36/0.38)]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        className="anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-sheet shadow-pop outline-none sm:max-h-none sm:rounded-none sm:rounded-l-2xl"
        style={{ maxWidth: width }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-4">
          <div className="min-w-0">
            <h2 className="font-display text-[21px] leading-snug text-ink">{title}</h2>
            {sub && <div className="mt-1 text-[13px] text-ink-3">{sub}</div>}
          </div>
          <IconButton icon={X} label="Cerrar" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sheet-2 px-5 py-3.5 sm:rounded-bl-2xl">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ vacío, error, carga */

export function Empty({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon && <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-manila text-ink-3"><Icon size={20} strokeWidth={1.75} /></span>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-[44ch] text-[14px] text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "warn", icon: Icon = AlertTriangle, title, children, action, className }) {
  return (
    <div className={cx("flex flex-wrap items-start gap-3 rounded-lg px-4 py-3", TONES[tone], className)}>
      <Icon size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-[14px]">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5 opacity-90">{children}</p>}
      </div>
      {action && <div className="basis-full pl-[30px] sm:basis-auto sm:pl-0">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-2/5" /><div className="skeleton h-3 w-4/5" /></div>
          <div className="skeleton h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ avatar de iniciales */

export function Initials({ name, size = 32, className }) {
  const ini = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-navy-soft font-semibold text-navy-ink", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {ini}
    </span>
  );
}

/* ------------------------------------------------------------ línea de etapas */

export function Etapas({ etapas, actual, compact, grande, className }) {
  return (
    <ol className={cx("flex w-full min-w-0 items-start", className)} aria-label="Etapas del proceso">
      {etapas.map((e, i) => {
        const hecho = i < actual, aqui = i === actual;
        return (
          <li key={e} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={aqui ? "step" : undefined}>
            {i > 0 && <span className={cx("absolute right-1/2 top-[7px] h-[2px] w-full", i <= actual ? "bg-navy" : "bg-line-strong")} />}
            <span className={cx("relative z-10 h-4 w-4 rounded-full border-2", hecho ? "border-navy bg-navy" : aqui ? "border-gold bg-gold shadow-[0_0_0_4px_var(--gold-soft)]" : "border-line-strong bg-sheet")} />
            {!compact && <span className={cx("mt-2 hidden px-1 leading-tight sm:block", grande ? "text-[14px]" : "text-[12px]", aqui ? "font-semibold text-ink" : "text-ink-2")}>{e}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ cuenta regresiva en días hábiles */

export function Habiles({ n, vence }) {
  if (n == null) return null;
  const tone = n < 0 ? "bad" : n <= 3 ? "bad" : n <= 6 ? "warn" : "neutral";
  const txt = n < 0 ? `Venció hace ${-n} ${-n === 1 ? "día hábil" : "días hábiles"}` : n === 0 ? "Vence hoy" : `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;
  return (
    <span className={cx("inline-flex flex-col items-end leading-tight")}>
      <span className={cx("text-[13px] font-semibold tnum", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink-2")}>{txt}</span>
      {vence && <span className="text-[12px] text-ink-3">{fechaCorta(vence)}</span>}
    </span>
  );
}

/* ------------------------------------------------------------ aviso flotante */

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6">
      <div key={toast.id} className="anim-pop pointer-events-auto flex items-center gap-3 rounded-xl bg-[#18203a] px-4 py-3 text-[14px] text-[#f4f1e8] shadow-pop">
        <Check size={16} className="text-gold" strokeWidth={2.5} />
        {toast.text}
      </div>
    </div>
  );
}
