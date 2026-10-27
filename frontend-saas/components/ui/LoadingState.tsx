export function LoadingState({ label = "Cargando", rows = 3 }: { label?: string; rows?: number }) {
  const safeRows = Math.max(1, rows);
  return (
    <div role="status" aria-label={label} className="motion-delayed-in space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: safeRows }, (_, index) => (
        <div
          key={index}
          className="skeleton h-11 rounded-[var(--radius-md)]"
          style={{ animationDelay: `${index * 80}ms` }}
        />
      ))}
    </div>
  );
}
