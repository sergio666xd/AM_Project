export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export interface FetchOptions extends RequestInit {
  token?: string;
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
  try {
    const response = await fetch(url, {
      ...rest,
      headers: requestHeaders,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
          errorData.message ||
          `Error ${response.status}: ${response.statusText}`,
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
