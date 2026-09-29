import type { LucideIcon } from "lucide-react";

export function AreaPlaceholder({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <section className="mx-auto max-w-4xl rounded-3xl border border-[#ccb56b]/40 bg-white p-8 shadow-sm">
    <Icon className="text-[#92792e]" size={28} />
    <h1 className="mt-5 text-3xl font-semibold text-[#002060]">{title}</h1>
    <p className="mt-3 max-w-2xl leading-7 text-[#002060]/70">{description}</p>
  </section>;
}
