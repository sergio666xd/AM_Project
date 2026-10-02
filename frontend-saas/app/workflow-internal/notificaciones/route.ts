import { start } from "workflow/api";
import { deliverNotifications } from "@/workflows/consultation-sweep";
import { workflowAuthFailure, workflowUnauthorized } from "@/lib/workflow-service-auth";

export async function POST(request: Request) {
  const authFailure = workflowAuthFailure(request);
  if (authFailure) return workflowUnauthorized(authFailure);
  let body: { entrega_ids?: number[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ detail: "Solicitud inválida." }, { status: 400 });
  }
  const ids = [...new Set(body.entrega_ids ?? [])];
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return Response.json({ detail: "Entregas inválidas." }, { status: 400 });
  }
  try {
    const run = await start(deliverNotifications, [ids]);
    return Response.json({ workflow_run_id: run.runId }, { status: 202 });
  } catch {
    return Response.json({ detail: "No fue posible iniciar el Workflow de notificaciones." }, { status: 503 });
  }
}