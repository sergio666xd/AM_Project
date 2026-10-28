import { cx } from "@/lib/cx";

const ARCHIVOS = {
  horizontal: "/marca/am-horizontal.svg",
  "horizontal-inversa": "/marca/am-horizontal-inversa.svg",
  emblema: "/marca/am-emblema.svg",
  "emblema-inverso": "/marca/am-emblema-inverso.svg",
} as const;

/**
 * Logo de la firma. El dibujo no se altera; solo cambia la disposición
 * (horizontal o emblema) y la versión inversa para fondos azules u oscuros.
 */
export function Logo({
  variante = "horizontal",
  className,
}: {
  variante?: keyof typeof ARCHIVOS;
  className?: string;
}) {
  const emblema = variante.startsWith("emblema");
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático: next/image no aporta nada y obliga a fijar tamaños.
    <img
      src={ARCHIVOS[variante]}
      alt="Alejandra Muñoz, Abogada y Asociados"
      width={emblema ? 233 : 867}
      height={233}
      draggable={false}
      className={cx("select-none", className)}
    />
  );
}
