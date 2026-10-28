import { cx } from "@/lib/cx";

/** Avatar con las iniciales del nombre. */
export function Initials({
  name,
  size = 32,
  enRiel = false,
  className,
}: {
  name: string;
  size?: number;
  /** Sobre el riel azul: chip oscuro con letras claras. */
  enRiel?: boolean;
  className?: string;
}) {
  const iniciales = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        enRiel ? "bg-rail-chip text-on-navy" : "bg-navy-soft text-navy-ink",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {iniciales || "·"}
    </span>
  );
}
