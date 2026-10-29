import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { PestanasSitio, type SeccionSitio } from "./PestanasSitio";

/** Columna del sitio: 1180 px con el mismo margen que el encabezado y el pie. */
export function Columna({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * La carpeta de la firma: carátula manila arriba, pestañas en su canto
 * inferior y la hoja blanca unida debajo. La pestaña de la sección actual es
 * parte de esa hoja (canto dorado), así cada página se lee como otra sección
 * del mismo expediente.
 */
export function Carpeta({
  actual,
  caratula,
  children,
  id,
}: {
  actual: SeccionSitio | null;
  caratula: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Columna className="pt-5 sm:pt-8">
      <div className="rounded-t-xl bg-manila">
        <div className="px-5 pt-5 pb-6 sm:px-8 sm:pt-8 sm:pb-9 lg:px-10 lg:pt-10">{caratula}</div>
        <PestanasSitio actual={actual} />
      </div>
      {/* Lo que sigue a la primera sección son más folios de la misma hoja, separados por una línea. */}
      <div id={id} className="scroll-mt-6 divide-y divide-line rounded-b-xl bg-sheet shadow-sheet">
        {children}
      </div>
    </Columna>
  );
}

/** Relleno interior de una hoja. */
export const RELLENO = "px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10";

/** Título de página en la carátula. */
export function TituloPagina({ children, grande = false }: { children: ReactNode; grande?: boolean }) {
  return (
    <h1
      className={cx(
        "max-w-[22ch] font-display font-normal text-ink",
        grande
          ? "text-[34px] leading-[1.1] tracking-[-0.012em] sm:text-[50px] lg:text-[58px]"
          : "text-[32px] leading-[1.14] tracking-[-0.01em] sm:text-[42px]",
      )}
    >
      {children}
    </h1>
  );
}

/** Entrada en la carátula: el texto que acompaña al título. */
export function Entrada({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[58ch] text-[18px] leading-[1.6] text-ink-2 sm:text-[19px]">{children}</p>;
}

/** Título de una hoja. */
export function TituloHoja({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cx("max-w-[30ch] font-display text-[26px] font-normal leading-[1.2] text-ink sm:text-[30px]", className)}>
      {children}
    </h2>
  );
}

/** Ficha de la carátula: etiqueta y valor, como los datos de un expediente. */
export function Ficha({ filas }: { filas: { etiqueta: string; valor: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 text-[16px] sm:grid-cols-[minmax(88px,max-content)_minmax(0,1fr)]">
      {filas.map((fila) => (
        <div key={fila.etiqueta} className="contents">
          <dt className="pt-px text-[14px] font-semibold text-ink-2 max-sm:-mb-3">{fila.etiqueta}</dt>
          <dd className="m-0 leading-[1.55] text-ink">{fila.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
