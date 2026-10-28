"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastTone = "info" | "success" | "warning" | "error";
interface ToastInput { title: string; description?: string; tone?: ToastTone; duration?: number }
interface ToastItem extends ToastInput { id: number; tone: ToastTone; leaving?: boolean }
interface ToastContextValue { toast: (input: ToastInput) => void }

const TOAST_EXIT_MS = 180;
const ToastContext = createContext<ToastContextValue | null>(null);
const presentation = {
  info: { icon: Info, classes: "text-navy-ink" },
  success: { icon: CheckCircle2, classes: "text-ok" },
  warning: { icon: TriangleAlert, classes: "text-warn" },
  error: { icon: AlertCircle, classes: "text-bad" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    // Primero se marca como saliente para reproducir la animación y luego se retira.
    setItems((current) => current.map((item) => item.id === id ? { ...item, leaving: true } : item));
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setItems((current) => current.filter((item) => item.id !== id));
    }, TOAST_EXIT_MS));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++nextId.current;
    const item = { ...input, id, tone: input.tone ?? "info" };
    setItems((current) => [...current.slice(-3), item]);
    timers.current.set(id, setTimeout(() => dismiss(id), input.duration ?? 5000));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" aria-relevant="additions removals" className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[120] flex flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[24rem]">
        {items.map((item) => {
          const config = presentation[item.tone];
          const Icon = config.icon;
          return (
            <div key={item.id} role={item.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex gap-3 rounded-xl bg-sheet p-4 shadow-pop ${config.classes} ${item.leaving ? "motion-toast-out pointer-events-none" : "motion-toast-in"}`}>
              <Icon aria-hidden="true" size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-[14px]">
                <p className="font-semibold text-ink">{item.title}</p>
                {item.description && <p className="mt-0.5 text-ink-2">{item.description}</p>}
              </div>
              <button type="button" aria-label="Cerrar notificación" onClick={() => dismiss(item.id)} className="-m-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink"><X aria-hidden="true" size={16} strokeWidth={1.75} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de ToastProvider");
  return context;
}
