/** Marca las pantallas de la app para que tomen el expediente foliado (ver globals.css). */
export default function GestionProcesosLayout({ children }: { children: React.ReactNode }) {
  return <div data-app className="contents">{children}</div>;
}
