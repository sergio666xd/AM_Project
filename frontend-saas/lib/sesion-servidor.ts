/**
 * Encabezados para validar la sesión del navegador desde un route handler.
 *
 * La sesión viaja en la cookie httpOnly `am_sesion`; también se acepta un
 * `Authorization: Bearer` con un token real. Como la cookie va sola, un cambio
 * autenticado solo con ella debe traer `X-AM-Solicitud: 1` (protección CSRF,
 * igual que en la API).
 */
const MARCADORES_SIN_TOKEN = new Set(["", "cookie", "null", "undefined"]);

export function encabezadosDeSesion(request: Request): Headers | Response {
  const headers = new Headers();
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const cookie = request.headers.get("cookie");

  if (!MARCADORES_SIN_TOKEN.has(token)) {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (!cookie?.includes("am_sesion=")) {
    return Response.json({ detail: "Autenticación requerida." }, { status: 401 });
  } else if (request.method !== "GET" && request.headers.get("x-am-solicitud") !== "1") {
    return Response.json({ detail: "La solicitud se rechazó por seguridad." }, { status: 403 });
  }
  if (cookie) headers.set("cookie", cookie);
  return headers;
}
