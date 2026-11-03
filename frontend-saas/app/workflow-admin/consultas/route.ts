import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { usuarioDeSesion } from "@/lib/sesion-servidor";
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
  const usuario = await usuarioDeSesion(request);
  if (usuario instanceof Response) return usuario;
  if (usuario.rol !== "ADMIN") return Response.json({ detail: "Se requiere una cuenta ADMIN." }, { status: 403 });
  return usuario.id;
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
