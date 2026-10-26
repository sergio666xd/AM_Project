"use client";

import { ArrowUp, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function FloatingActions() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 320);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Volver arriba"
          className="grid size-11 place-items-center rounded-full border border-border bg-surface text-brand-900 shadow-md transition-all hover:bg-surface-hover hover:border-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      )}

      <a
        href="https://wa.me/573508809878?text=Hola%2C%20quiero%20recibir%20asesor%C3%ADa%20jur%C3%ADdica."
        target="_blank"
        rel="noreferrer"
        aria-label="Escribir a WhatsApp de la firma"
        title="Escribir por WhatsApp"
        className="group relative grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
      >
        <MessageCircle className="size-7" aria-hidden="true" />
        <span className="pointer-events-none absolute right-16 hidden rounded-lg bg-brand-950 px-3 py-1.5 text-xs font-semibold text-white shadow-md sm:group-hover:inline-block whitespace-nowrap">
          ¿En qué podemos ayudarte?
        </span>
      </a>
    </div>
  );
}
