import { cx } from "@/lib/cx";

/** Avatar con las iniciales del nombre. */
export function Initials({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const iniciales = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-navy-soft font-semibold text-navy-ink", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {iniciales || "·"}
    </span>
  );
}
