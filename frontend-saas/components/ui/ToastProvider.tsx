"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastTone = "info" | "success" | "warning" | "error";
interface ToastInput { title: string; description?: string; tone?: ToastTone; duration?: number }
interface ToastItem extends ToastInput { id: number; tone: ToastTone }
interface ToastContextValue { toast: (input: ToastInput) => void }

const ToastContext = createContext<ToastContextValue | null>(null);
const presentation = {
  info: { icon: Info, classes: "border-info/30 text-info" },
  success: { icon: CheckCircle2, classes: "border-success/30 text-success" },
  warning: { icon: TriangleAlert, classes: "border-warning/30 text-warning" },
  error: { icon: AlertCircle, classes: "border-danger/30 text-danger" },
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
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
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
      <div aria-live="polite" aria-relevant="additions removals" className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((item) => {
          const config = presentation[item.tone];
          const Icon = config.icon;
          return (
            <div key={item.id} role={item.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex gap-3 rounded-xl border bg-surface p-4 shadow-lg ${config.classes}`}>
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">{item.title}</p>
                {item.description && <p className="mt-1 text-foreground-secondary">{item.description}</p>}
              </div>
              <button type="button" aria-label="Cerrar notificación" onClick={() => dismiss(item.id)} className="grid size-7 shrink-0 place-items-center rounded-md text-foreground-muted hover:bg-surface-hover"><X aria-hidden="true" className="size-4" /></button>
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
