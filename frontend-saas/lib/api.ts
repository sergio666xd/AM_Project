const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(
  /^http:\/\/localhost(?=:|$)/i,
  "http://127.0.0.1",
);

export const API_URL =
  configuredApiUrl ||
  // Local Uvicorn commonly binds IPv4 only; avoid localhost resolving to ::1.
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "");

export interface FetchOptions extends RequestInit {
  token?: string | null;
}

export async function apiRequest(
  endpoint: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { token, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
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
  const retryDelays = method === "GET" || method === "HEAD" ? [250, 700] : [];
  const fetchWithTransientRetries = async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetch(url, { ...rest, headers: requestHeaders });
      } catch (cause) {
        if (!(cause instanceof TypeError) || attempt >= retryDelays.length) throw cause;
        await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
      }
    }
  };

  try {
    const response = await fetchWithTransientRetries();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `HTTP ${response.status}: ${errorData.detail ||
          errorData.message ||
          response.statusText || "Error de servidor."}`,
      );
    }
    return response;
  } catch (cause) {
    if (cause instanceof TypeError) {
      throw new Error(
        `No se pudo conectar con la API en ${API_URL}. Verifica que el backend esté activo y que CORS permita este origen.`,
      );
    }
    throw cause;
  }
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
  token: string,
  input:
    | { tipo: "AUTOMATICA_NUEVO"; radicado_id: number; consulta_id: number }
    | { tipo: "MANUAL"; radicado_id: number }
    | { tipo: "MANUAL"; radicado_ids: number[] },
): Promise<{ workflow_run_id: string }> {
  const response = await fetch("/workflow-admin/consultas/radicado", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.detail || "No fue posible iniciar el Workflow de consulta.");
  }
  return result as { workflow_run_id: string };
}

export async function fetchBlobApi(
  endpoint: string,
  options: FetchOptions = {},
): Promise<Blob> {
  return (await apiRequest(endpoint, options)).blob();
}

export async function getCurrentUser(token: string) {
  return fetchApi("/api/auth/me", {
    method: "GET",
    token,
  });
}
