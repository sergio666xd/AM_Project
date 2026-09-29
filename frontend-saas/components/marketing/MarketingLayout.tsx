import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { FloatingActions } from "./FloatingActions";

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#fffdf8] text-[#002060]"><SiteHeader />{children}<SiteFooter /><FloatingActions /></div>;
}
