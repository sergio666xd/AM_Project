import { cx } from "@/lib/cx";

/**
 * Sello de folio: el gesto del sistema. Cada registro de un expediente lleva
 * su número, como en un expediente judicial. Los nuevos van en dorado y pasan
 * a neutro (700 ms) cuando se revisan.
 */
export function Folio({
  n,
  nuevo = false,
  size = "md",
  className,
}: {
  n: number;
  nuevo?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      title={`Folio ${n}${nuevo ? ", sin revisar" : ""}`}
      className={cx(
        "inline-flex shrink-0 items-baseline justify-center gap-1 rounded-[3px] border px-1.5 transition-[background-color,border-color,color] duration-700 ease-out",
        nuevo ? "border-gold bg-gold-soft text-gold-ink" : "border-line-strong text-ink-2",
        size === "sm" ? "h-5 leading-5" : "h-6 leading-6",
        className,
      )}
    >
      <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.06em]">Fl.</span>
      <span className={cx("folio-num font-semibold", size === "sm" ? "text-[13px]" : "text-[15px]")}>{n}</span>
    </span>
  );
}
