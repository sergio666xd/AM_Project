export function LoadingState({ label = "Cargando", rows = 3 }: { label?: string; rows?: number }) {
  const safeRows = Math.max(1, rows);
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: safeRows }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-surface-hover" />
      ))}
    </div>
  );
}
