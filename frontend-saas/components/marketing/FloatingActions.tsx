"use client";

import { ArrowUp, MessageCircle, MessageCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function FloatingActions() {
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 320);
    update(); window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
    {showTop && <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Volver arriba" className="grid h-11 w-11 place-items-center rounded-full border border-[#ccb56b] bg-white text-[#002060] shadow-lg transition hover:bg-[#fff7df]"><ArrowUp size={20} /></button>}
    <a href="https://wa.me/573508809878?text=Hola%2C%20quiero%20recibir%20asesor%C3%ADa%20jur%C3%ADdica." target="_blank" rel="noreferrer" aria-label="Escribir por WhatsApp" className="grid h-14 w-14 place-items-center rounded-full bg-[#25d366] !text-white shadow-lg transition hover:scale-105"><MessageCircleIcon size={28}/></a>
  </div>;
}
