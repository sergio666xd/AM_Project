import { AlertTriangle, RefreshCw } from "lucide-react";
import { apiErrorStatus } from "@/lib/api";

type ApiErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
};

function getErrorCopy(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status = apiErrorStatus(error) ?? 0;

  if (!status && /no se pudo conectar|failed to fetch|networkerror/i.test(message)) {
    return {
      title: "No se pudo conectar con el servicio",
      description: "Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  if (status >= 500) {
    return {
      title: "El servidor no pudo completar la solicitud",
      description: `El servicio respondió con un error${status ? ` (HTTP ${status})` : ""}. Inténtalo de nuevo; si continúa, contacta al administrador.`,
    };
  }
  if (status === 401) {
    return {
      title: "Tu sesión expiró",
      description: "Te llevaremos al inicio de sesión para continuar.",
    };
  }
  if (status === 403) {
    return {
      title: "No tienes acceso a estos datos",
      description: message || "Si crees que es un error, contacta al administrador.",
    };
  }
  return {
    title: "No fue posible cargar estos datos",
    description: status >= 400 && message
      ? message
      : "Inténtalo de nuevo. Si el problema continúa, contacta al administrador.",
  };
}

export function ApiErrorState({ error, onRetry, retrying = false, compact = false }: ApiErrorStateProps) {
  const copy = getErrorCopy(error);
  return (
    <div role="alert" className={`flex flex-wrap ${compact ? "items-center" : "items-start"} gap-3 rounded-lg bg-bad-soft px-4 py-3 text-bad`}>
      <AlertTriangle aria-hidden="true" size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-[14px]">
        <p className="font-semibold">{copy.title}</p>
        <p className="mt-0.5 opacity-90">{copy.description}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex min-h-10 shrink-0 basis-full items-center justify-center gap-2 rounded-lg bg-sheet px-3 text-[14px] font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong)] transition-[background-color,scale] hover:bg-sheet-2 active:scale-[0.96] disabled:cursor-wait disabled:opacity-60 sm:basis-auto"
        >
          <RefreshCw aria-hidden="true" className={`size-4 ${retrying ? "animate-spin" : ""}`} />
          Reintentar
        </button>
      )}
    </div>
  );
}
