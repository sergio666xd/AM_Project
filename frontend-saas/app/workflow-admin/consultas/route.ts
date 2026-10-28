import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { encabezadosDeSesion } from "@/lib/sesion-servidor";
import { consultationSweep } from "@/workflows/consultation-sweep";

function fechaColombia(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function adminId(request: Request): Promise<number | Response> {
  const headers = encabezadosDeSesion(request);
  if (headers instanceof Response) return headers;

  let response: Response;
  try {
    response = await fetch(new URL("/api/auth/me", request.url), {
      headers,
      cache: "no-store",
    });
  } catch {
    return Response.json({ detail: "No fue posible validar la sesión." }, { status: 502 });
  }
  if (!response.ok) {
    return Response.json({ detail: "Sesión inválida o expirada." }, { status: 401 });
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ detail: "La validación recibió HTML en lugar de JSON; verifica la protección del Preview." }, { status: 502 });
  }

  let user: { id?: number; rol?: string };
  try {
    user = (await response.json()) as { id?: number; rol?: string };
  } catch {
    return Response.json({ detail: "No fue posible leer el usuario autenticado." }, { status: 502 });
  }
  if (user.rol !== "ADMIN" || typeof user.id !== "number") {
    return Response.json({ detail: "Se requiere una cuenta ADMIN." }, { status: 403 });
  }
  return user.id;
}

export async function POST(request: Request) {
  const actorId = await adminId(request);
  if (actorId instanceof Response) return actorId;

  const date = fechaColombia(new Date());
  const token = randomUUID();
  try {
    const run = await start(consultationSweep, [
      {
        clave_idempotencia: `MANUAL:${token}`,
        token_lanzamiento: token,
        tipo: "MANUAL",
        fecha_local: date,
        hora_local: "MANUAL",
        solicitada_por_id: actorId,
      },
    ]);
    return Response.json({ workflow_run_id: run.runId, status: await run.status }, { status: 202 });
  } catch {
    return Response.json({ detail: "No fue posible iniciar la consulta manual." }, { status: 503 });
  }
}
