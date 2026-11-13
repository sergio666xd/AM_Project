import { cx } from "@/lib/cx";
import { VERSION_APP } from "@/lib/version";

/** Número de la versión publicada, en letra pequeña junto al logo de los paneles. */
export function VersionApp({ className }: { className?: string }) {
  if (!VERSION_APP) return null;
  return (
    <span title={`Versión ${VERSION_APP}`} className={cx("text-[11px] leading-none tabular-nums", className)}>
      v{VERSION_APP}
    </span>
  );
}
