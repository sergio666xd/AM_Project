/**
 * Cliente tipado de la API v2.
 *
 * Los tipos salen de `esquema.ts`, generado desde el contrato OpenAPI del
 * backend (`npm run api:tipos`); no se escriben a mano. La sesión viaja en una
 * cookie httpOnly, así que aquí no se maneja ningún token.
 *
 *   const { data, error } = await api.GET("/api/v2/procesos", { params: { query: { q: "restrepo" } } });
 *   if (error) mostrar(error.mensaje);
 */
import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./esquema";

export type Esquemas = components["schemas"];
export type ErrorApi = Esquemas["ErrorRespuesta"];

/** Evento global cuando la API responde que no hay sesión, para llevar al ingreso. */
export const SESION_TERMINADA = "am:sesion-terminada";

const ENCABEZADO_CSRF = "X-AM-Solicitud";
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

const proteccion: Middleware = {
  onRequest({ request }) {
    // La API rechaza los cambios autenticados con cookie que no traen este
    // encabezado; un sitio ajeno no puede añadirlo.
    if (!METODOS_SEGUROS.has(request.method)) request.headers.set(ENCABEZADO_CSRF, "1");
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESION_TERMINADA));
    }
    return response;
  },
};

// Mismo origen siempre: en Vercel por vercel.json y en desarrollo por el
// rewrite de next.config.ts, así la cookie de sesión viaja sin CORS.
export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });
api.use(proteccion);

/** Mensaje para mostrar a partir de un error de la API, o uno genérico si no vino del backend. */
export function mensajeDeError(error: unknown): string {
  if (error && typeof error === "object" && "mensaje" in error && typeof error.mensaje === "string") {
    return error.mensaje;
  }
  return "No se pudo completar la solicitud. Revisa tu conexión e inténtalo de nuevo.";
}
