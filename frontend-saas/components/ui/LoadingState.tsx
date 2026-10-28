/** Filas de esqueleto con la forma de una lista de folios mientras llegan los datos. */
export function LoadingState({ label = "Cargando", rows = 3 }: { label?: string; rows?: number }) {
  const safeRows = Math.max(1, rows);
  return (
    <div role="status" aria-label={label} className="motion-delayed-in divide-y divide-line overflow-hidden rounded-xl bg-sheet shadow-sheet">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: safeRows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5 rounded-md" />
            <div className="skeleton h-3 w-4/5 rounded-md" />
          </div>
          <div className="skeleton h-6 w-12 rounded-[3px]" />
        </div>
      ))}
    </div>
  );
}
