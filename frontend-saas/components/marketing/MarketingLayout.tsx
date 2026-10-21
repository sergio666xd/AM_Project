import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { FloatingActions } from "./FloatingActions";
import { JsonLd } from "./JsonLd";

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-brand-950 font-sans selection:bg-gold-400/30 selection:text-brand-950">
      <JsonLd />
      <SiteHeader />
      {children}
      <SiteFooter />
      <FloatingActions />
    </div>
  );
}
