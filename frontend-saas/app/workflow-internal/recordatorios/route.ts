import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { taskReminderWorkflow } from "@/workflows/task-reminder";

function authorized(request: Request): boolean {
  const expected = process.env.WORKFLOW_SERVICE_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected) return false;
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ detail: "Credencial interna inválida." }, { status: 401 });
  }

  let body: { recordatorio_id?: number; version?: number; programado_para?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ detail: "Solicitud inválida." }, { status: 400 });
  }

  const scheduledAt = body.programado_para ? new Date(body.programado_para) : null;
  if (
    !Number.isInteger(body.recordatorio_id) || body.recordatorio_id! <= 0
    || !Number.isInteger(body.version) || body.version! <= 0
    || !scheduledAt || !Number.isFinite(scheduledAt.getTime())
  ) {
    return Response.json({ detail: "Recordatorio inválido." }, { status: 400 });
  }

  try {
    const run = await start(taskReminderWorkflow, [{
      recordatorio_id: body.recordatorio_id!,
      version: body.version!,
      programado_para: scheduledAt.toISOString(),
    }]);
    return Response.json({ workflow_run_id: run.runId }, { status: 202 });
  } catch {
    return Response.json({ detail: "No fue posible iniciar el Workflow de recordatorio." }, { status: 503 });
  }
}