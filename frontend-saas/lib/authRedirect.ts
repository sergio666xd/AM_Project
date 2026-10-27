const LOGIN_PATH = "/login";

export function safeInternalRedirect(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid") {
      return null;
    }
    if (url.pathname === LOGIN_PATH || url.pathname.startsWith("/gestion-procesos/auth/") || ["/recuperar-password", "/restablecer-password", "/cambiar-password"].includes(url.pathname)) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function loginUrlForRedirect(path: string): string {
  return `${LOGIN_PATH}?redirect=${encodeURIComponent(path)}`;
}
