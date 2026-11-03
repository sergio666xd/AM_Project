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

export type UsuarioDeSesion = { id: number; rol: string };

/**
 * Valida la sesión contra `GET /api/v2/sesion` y devuelve el usuario, o la
 * respuesta de error lista para devolver. La API ya rechaza cuentas inactivas
 * y a quien todavía debe cambiar la contraseña temporal no lo deja trabajar.
 */
export async function usuarioDeSesion(request: Request): Promise<UsuarioDeSesion | Response> {
  const headers = encabezadosDeSesion(request);
  if (headers instanceof Response) return headers;
  let response: Response;
  try {
    response = await fetch(new URL("/api/v2/sesion", request.url), { headers, cache: "no-store" });
  } catch {
    return Response.json({ detail: "No fue posible validar la sesión." }, { status: 502 });
  }
  if (response.status === 403) return Response.json({ detail: "La cuenta no está activa." }, { status: 403 });
  if (!response.ok) return Response.json({ detail: "Sesión inválida o expirada." }, { status: 401 });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ detail: "La validación recibió HTML en lugar de JSON; revise la protección del Preview." }, { status: 502 });
  }
  const usuario = (await response.json().catch(() => null)) as { id?: unknown; rol?: unknown; debe_cambiar_password?: unknown } | null;
  if (!usuario || typeof usuario.id !== "number" || typeof usuario.rol !== "string") {
    return Response.json({ detail: "No fue posible leer el usuario de la sesión." }, { status: 502 });
  }
  if (usuario.debe_cambiar_password === true) {
    return Response.json({ detail: "Debe cambiar la contraseña temporal antes de continuar." }, { status: 403 });
  }
  return { id: usuario.id, rol: usuario.rol };
}
