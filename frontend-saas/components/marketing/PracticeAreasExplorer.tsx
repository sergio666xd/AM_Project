"use client";

import { useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  HeartHandshake,
  Landmark,
  MessageCircle,
  Search,
  type LucideIcon,
} from "lucide-react";

interface AreaSection {
  readonly title: string;
  readonly items: readonly string[];
}

interface Area {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly sections: readonly AreaSection[];
}

interface PracticeAreasExplorerProps {
  areas: readonly Area[];
}

const areaIcons: Record<string, LucideIcon> = {
  family: HeartHandshake,
  business: BriefcaseBusiness,
  building: Building2,
  government: Landmark,
};

export function PracticeAreasExplorer({ areas }: PracticeAreasExplorerProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredAreas = areas.filter((area) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const inTitle = area.title.toLowerCase().includes(term);
    const inDesc = area.description.toLowerCase().includes(term);
    const inSections = area.sections.some(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        s.items.some((item) => item.toLowerCase().includes(term))
    );
    return inTitle || inDesc || inSections;
  });

  const activeArea = selectedIdx !== null && filteredAreas[selectedIdx] ? filteredAreas[selectedIdx] : null;

  return (
    <div className="space-y-8">
      {/* Search and filter header */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Branch pill buttons */}
        <div
          role="tablist"
          aria-label="Filtro de áreas de práctica"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedIdx === null}
            onClick={() => setSelectedIdx(null)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              selectedIdx === null
                ? "bg-brand-900 text-white shadow-xs"
                : "border border-border bg-surface text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            Todas las áreas ({areas.length})
          </button>
          {areas.map((area, idx) => {
            const Icon = areaIcons[area.icon] || BriefcaseBusiness;
            const isSelected = selectedIdx === idx;
            return (
              <button
                key={area.title}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedIdx(idx)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-brand-900 text-white shadow-xs"
                    : "border border-border bg-surface text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span className="truncate max-w-44">{area.title.split(",")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Quick search input */}
        <div className="relative min-w-64">
          <Search className="absolute left-3 top-2.5 size-4 text-foreground-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar trámite o servicio..."
            className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-700"
          />
        </div>
      </div>

      {/* Areas container */}
      <div className="space-y-10">
        {(activeArea ? [activeArea] : filteredAreas).map((area) => {
          const Icon = areaIcons[area.icon] || BriefcaseBusiness;
          const waMessage = encodeURIComponent(
            `Hola, me gustaría consultar y recibir asesoría sobre el área de: ${area.title}.`
          );

          return (
            <article
              key={area.title}
              className="rounded-3xl border border-border bg-surface p-7 sm:p-10 shadow-xs space-y-8"
            >
              {/* Header with Title and Contextual CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-border pb-6">
                <div className="flex items-start gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-900 border border-brand-100">
                    <Icon className="size-7" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                      {area.title}
                    </h2>
                    <p className="mt-2 text-sm sm:text-base leading-relaxed text-foreground-muted max-w-2xl">
                      {area.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <a
                    href={`https://wa.me/573508809878?text=${waMessage}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold-400 px-5 py-2.5 text-xs font-bold text-brand-950 hover:bg-gold-300 transition-colors shadow-xs"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    Consultar este tema
                  </a>
                </div>
              </div>

              {/* Subsections Grid */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {area.sections.map((section) => (
                  <section
                    key={section.title}
                    className="rounded-2xl border border-border/80 bg-surface-secondary/50 p-5 space-y-3.5"
                  >
                    <h3 className="flex items-start gap-2 text-sm font-bold text-foreground">
                      <CheckCircle2 className="size-4 text-gold-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{section.title}</span>
                    </h3>

                    <ul className="space-y-2 text-xs leading-relaxed text-foreground-muted">
                      {section.items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="text-gold-500 font-bold shrink-0">·</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          );
        })}

        {filteredAreas.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-12 text-center">
            <p className="text-sm font-semibold text-foreground">No se encontraron servicios para &quot;{search}&quot;</p>
            <p className="mt-1 text-xs text-foreground-muted">Prueba con otro término o consulta directamente con nuestro equipo.</p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-4 inline-flex items-center rounded-xl bg-brand-900 px-4 py-2 text-xs font-bold text-white hover:bg-brand-950"
            >
              Ver todas las áreas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
