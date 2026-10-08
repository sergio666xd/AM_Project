import { start } from "workflow/api";
import { taskReminderWorkflow } from "@/workflows/task-reminder";
import { workflowAuthFailure, workflowUnauthorized } from "@/lib/workflow-service-auth";

export async function POST(request: Request) {
  const authFailure = workflowAuthFailure(request);
  if (authFailure) return workflowUnauthorized(authFailure);

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