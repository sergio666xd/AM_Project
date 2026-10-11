import { AlertTriangle, RefreshCw } from "lucide-react";

type ApiErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
};

function getErrorCopy(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status = Number(message.match(/\bHTTP\s+(\d{3})\b/i)?.[1]);

  if (/no se pudo conectar|failed to fetch|networkerror/i.test(message)) {
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
  if (status === 401 || status === 403) {
    return {
      title: "No tienes acceso a estos datos",
      description: "Actualiza la página o vuelve a iniciar sesión.",
    };
  }
  return {
    title: "No fue posible cargar estos datos",
    description: "Inténtalo de nuevo. Si el problema continúa, contacta al administrador.",
  };
}

export function ApiErrorState({ error, onRetry, retrying = false, compact = false }: ApiErrorStateProps) {
  const copy = getErrorCopy(error);
  return (
    <div role="alert" className={`flex ${compact ? "items-center" : "items-start sm:items-center"} gap-3 rounded-xl border border-danger/30 bg-danger-light p-4 text-danger`}>
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-1 text-sm">{copy.description}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-danger/30 px-3 text-sm font-medium hover:bg-danger/10 disabled:cursor-wait disabled:opacity-60">
          <RefreshCw aria-hidden="true" className={`size-4 ${retrying ? "animate-spin" : ""}`} />
          Reintentar
        </button>
      )}
    </div>
  );
}
