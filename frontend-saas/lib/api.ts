/**
 * Base de la API. En el navegador siempre es el mismo origen: en Vercel
 * `/api` se reescribe al backend (vercel.json) y en desarrollo lo hace
 * next.config.ts, así la cookie de sesión viaja sola. En el servidor de
 * desarrollo no hay reescritura, y se llama al backend local.
 *
 * Las llamadas a la API van por el cliente tipado de `lib/api-v2/cliente`.
 */
export const API_URL =
  typeof window === "undefined" && process.env.NODE_ENV === "development"
    ? // Uvicorn suele escuchar solo en IPv4; localhost podría resolver a ::1.
      process.env.BACKEND_DEV_URL ?? "http://127.0.0.1:8000"
    : "";

/** Error con el estado HTTP separado del mensaje. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiErrorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** Lanza el Workflow que consulta uno o varios radicados en la Rama Judicial. */
export async function iniciarWorkflowConsultaRadicado(
  input:
    | { tipo: "AUTOMATICA_NUEVO"; radicado_id: number; consulta_id: number }
    | { tipo: "MANUAL"; radicado_id: number }
    | { tipo: "MANUAL"; radicado_ids: number[] },
): Promise<{ workflow_run_id: string }> {
  const response = await fetch("/workflow-admin/consultas/radicado", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AM-Solicitud": "1" },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, result.detail || "No fue posible iniciar la consulta del radicado.");
  }
  return result as { workflow_run_id: string };
}
