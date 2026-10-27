import { LoadingState } from "@/components/ui/LoadingState";

export function PortalLoadingState({ title }: { title: string }) {
  return (
    <main className="motion-delayed-in mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label={title}>
      <div className="space-y-2"><div className="h-7 w-56 skeleton rounded-md" /><div className="h-4 w-80 max-w-full skeleton rounded-md" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="h-28 skeleton rounded-xl" /><div className="h-28 skeleton rounded-xl" /><div className="h-28 skeleton rounded-xl" /><div className="h-28 skeleton rounded-xl" /></div>
      <p className="sr-only">{title}</p>
      <LoadingState label={title} rows={3} />
    </main>
  );
}
