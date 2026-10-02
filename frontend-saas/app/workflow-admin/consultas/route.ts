import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
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
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ detail: "Autenticación requerida." }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(new URL("/api/auth/me", request.url), {
      headers: { Authorization: authorization },
      cache: "no-store",
    });
  } catch {
    return Response.json({ detail: "No fue posible validar la sesión." }, { status: 502 });
  }
  if (!response.ok) {
    return Response.json({ detail: "Sesión inválida o expirada." }, { status: 401 });
  }

  const user = (await response.json()) as { id?: number; rol?: string };
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
