import { timingSafeEqual, randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { consultationSweep } from "@/workflows/consultation-sweep";

const SLOTS = {
  "12": { local: "12:00", schedule: "0 17 * * *" },
  "17": { local: "17:00", schedule: "0 22 * * *" },
} as const;

type RouteContext = { params: Promise<{ slot: string }> };

function sameSecret(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

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

export async function GET(request: Request, context: RouteContext) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected || !sameSecret(authorization, `Bearer ${expected}`)) {
    return Response.json({ detail: "Cron no autorizado." }, { status: 401 });
  }

  const { slot } = await context.params;
  const slotConfig = SLOTS[slot as keyof typeof SLOTS];
  if (!slotConfig || request.headers.get("x-vercel-cron-schedule") !== slotConfig.schedule) {
    return Response.json({ detail: "Slot Cron inválido." }, { status: 400 });
  }

  const token = randomUUID();
  const fechaLocal = fechaColombia(new Date());
  try {
    const run = await start(consultationSweep, [
      {
        clave_idempotencia: `AUTO:${fechaLocal}:${slotConfig.local}`,
        token_lanzamiento: token,
        tipo: "AUTOMATICA",
        fecha_local: fechaLocal,
        hora_local: slotConfig.local,
      },
    ]);
    return Response.json({ workflow_run_id: run.runId, status: await run.status }, { status: 202 });
  } catch {
    return Response.json({ detail: "No fue posible iniciar el barrido." }, { status: 503 });
  }
}