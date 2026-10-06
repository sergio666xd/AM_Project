import { MarketingLayout } from "./MarketingLayout";
import { renderRichText } from "@/components/marketing/RichText";

export type LegalSection = { title: string; body: string[] };

export function LegalPage({ title, updatedAt, sections }: { title: string; updatedAt: string; sections: LegalSection[] }) {
  return <MarketingLayout><main className="mx-auto max-w-4xl px-5 py-16 lg:px-8"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">Información legal</p><h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{renderRichText(title)}</h1><p className="mt-4 text-sm text-[#002060]/70">Última actualización: {renderRichText(updatedAt)}</p><div className="mt-12 space-y-9">{sections.map((section) => <section key={section.title}><h2 className="text-2xl font-bold">{renderRichText(section.title)}</h2>{section.body.map((paragraph) => <p key={paragraph} className="mt-3 leading-8 text-[#002060]/80">{renderRichText(paragraph)}</p>)}</section>)}</div></main></MarketingLayout>;
}
