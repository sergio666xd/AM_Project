import type { ReactNode } from "react";

/** Entrada suave de cada página del panel; Next.js vuelve a montar la plantilla al navegar. */
export default function PanelTemplate({ children }: { children: ReactNode }) {
  return <div className="motion-page h-full">{children}</div>;
}
