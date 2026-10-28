/**
 * Base de la API. En el navegador siempre es el mismo origen: en Vercel
 * `/api` se reescribe al backend (vercel.json) y en desarrollo lo hace
 * next.config.ts, así la cookie de sesión viaja sola. En el servidor de
 * desarrollo no hay reescritura, y se llama al backend local.
 */
export const API_URL =
  typeof window === "undefined" && process.env.NODE_ENV === "development"
    ? // Uvicorn suele escuchar solo en IPv4; localhost podría resolver a ::1.
      process.env.BACKEND_DEV_URL ?? "http://127.0.0.1:8000"
    : "";

/** Evento global emitido cuando la API rechaza la sesión. */
export const SESSION_EXPIRED_EVENT = "session-expired";

/**
 * Marcador que `useSession().token` entrega cuando hay sesión. El token real
 * vive en una cookie httpOnly que JavaScript no puede leer; las pantallas que
 * aún arman `Authorization: Bearer ${token}` mandan este marcador y la API lo
 * trata como "usa la cookie". Desaparece cuando esas pantallas pasen a la API v2.
 */
export const TOKEN_EN_COOKIE = "cookie";

const ENCABEZADO_CSRF = "X-AM-Solicitud";

export interface FetchOptions extends RequestInit {
  token?: string | null;
}

/**
 * Error de la API con el estado HTTP separado del mensaje, para que las
 * pantallas muestren el detalle del backend sin el prefijo técnico.
 */
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

type ValidationIssue = { loc?: (string | number)[]; msg?: string };

/** Convierte el `detail` de FastAPI (texto o lista de validación) en un mensaje legible. */
function readableDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = (detail as ValidationIssue[])
      .map((issue) => {
        const field = issue.loc?.filter((part) => part !== "body" && part !== "query").join(".");
        const message = (issue.msg || "").replace(/^Value error, /, "");
        return field ? `${field}: ${message}` : message;
      })
      .filter(Boolean);
    if (messages.length) return `Revisa los datos enviados. ${messages.join(" · ")}`;
  }
  return null;
}

// El backend guarda y devuelve fechas en UTC sin indicador de zona
// ("2026-10-21T22:10:01"). El navegador las interpretaría como hora local y
// las mostraría 5 horas adelantadas, así que se marcan como UTC al recibirlas.
const NAIVE_UTC_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

export function normalizeUtcDates<T>(value: T): T {
  if (typeof value === "string") {
    return (NAIVE_UTC_DATETIME.test(value) ? `${value}Z` : value) as T;
  }
  if (Array.isArray(value)) return value.map(normalizeUtcDates) as T;
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      (value as Record<string, unknown>)[key] = normalizeUtcDates((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

const fallbackByStatus: Record<number, string> = {
  401: "Tu sesión expiró. Inicia sesión nuevamente.",
  403: "No tienes permiso para realizar esta acción.",
  404: "No encontramos el recurso solicitado.",
  413: "El archivo supera el tamaño permitido.",
  429: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
};

export async function apiRequest(
  endpoint: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { token, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  if (token && token !== TOKEN_EN_COOKIE) requestHeaders.set("Authorization", `Bearer ${token}`);
  if (requestHeaders.get("Authorization") === `Bearer ${TOKEN_EN_COOKIE}`) requestHeaders.delete("Authorization");
  if (
    !(typeof FormData !== "undefined" && rest.body instanceof FormData) &&
    !requestHeaders.has("Content-Type")
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }
  const url = /^https?:\/\//i.test(endpoint)
    ? endpoint
    : `${API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const method = String(rest.method || "GET").toUpperCase();
  // La API rechaza los cambios autenticados con la cookie que no traen este
  // encabezado; un sitio ajeno no puede añadirlo.
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) requestHeaders.set(ENCABEZADO_CSRF, "1");
  const retryDelays = method === "GET" || method === "HEAD" ? [250, 700] : [];
  const fetchWithTransientRetries = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetch(url, { credentials: "same-origin", ...rest, headers: requestHeaders });
      } catch (cause) {
        if (!(cause instanceof TypeError) || attempt >= retryDelays.length) throw cause;
        await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
      }
    }
  };

  let response: Response;
  try {
    response = await fetchWithTransientRetries();
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error(
        "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
      );
    }
    throw cause;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      readableDetail(errorData.detail) ||
        readableDetail(errorData.message) ||
        fallbackByStatus[response.status] ||
        "El servidor no pudo completar la solicitud. Inténtalo de nuevo.",
    );
  }
  const readJson = response.json.bind(response);
  response.json = async () => normalizeUtcDates(await readJson());
  return response;
}

export async function fetchApi(
  endpoint: string,
  options: FetchOptions = {},
 ) {
  const response = await apiRequest(endpoint, options);
  if (response.status === 204) return null;
  return response.json();
}

export async function iniciarWorkflowConsultaRadicado(
  _token: string | null,
  input:
    | { tipo: "AUTOMATICA_NUEVO"; radicado_id: number; consulta_id: number }
    | { tipo: "MANUAL"; radicado_id: number }
    | { tipo: "MANUAL"; radicado_ids: number[] },
): Promise<{ workflow_run_id: string }> {
  const response = await fetch("/workflow-admin/consultas/radicado", {
    method: "POST",
    headers: { "Content-Type": "application/json", [ENCABEZADO_CSRF]: "1" },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, result.detail || "No fue posible iniciar el Workflow de consulta.");
  }
  return result as { workflow_run_id: string };
}

export async function fetchBlobApi(
  endpoint: string,
  options: FetchOptions = {},
): Promise<Blob> {
  return (await apiRequest(endpoint, options)).blob();
}

export async function getCurrentUser() {
  return fetchApi("/api/auth/me", { method: "GET" });
}
