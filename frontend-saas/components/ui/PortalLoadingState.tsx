import { LoadingState } from "@/components/ui/LoadingState";

export function PortalLoadingState({ title }: { title: string }) {
  return (
    <main className="motion-delayed-in mx-auto w-full max-w-[1280px] space-y-6" role="status" aria-label={title}>
      <div className="space-y-2"><div className="h-8 w-56 skeleton rounded-md" /><div className="h-4 w-80 max-w-full skeleton rounded-md" /></div>
      <p className="sr-only">{title}</p>
      <LoadingState label={title} rows={4} />
    </main>
  );
}
