const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.78.226:8000";

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function fetchApi(endpoint: string, options: FetchOptions = {}) {
  const { token, headers, ...rest } = options;

  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers as Record<string, string>),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...rest,
    headers: defaultHeaders,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Error en la petición: ${response.statusText}`);
  }

  // Si la respuesta es vacía (ej. 204 No Content)
  if (response.status === 204) return null;

  return response.json();
}

export async function getCurrentUser(token: string) {
  return fetchApi("/api/auth/me", {
    method: "GET",
    token,
  });
}