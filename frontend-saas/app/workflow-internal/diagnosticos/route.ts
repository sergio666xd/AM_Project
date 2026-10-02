import { start } from "workflow/api";
import { integrationDiagnosticWorkflow } from "@/workflows/integration-diagnostic";
import { workflowAuthFailure, workflowUnauthorized } from "@/lib/workflow-service-auth";

export async function POST(request: Request) {
  const authFailure = workflowAuthFailure(request);
  if (authFailure) return workflowUnauthorized(authFailure);
  try {
    const run = await start(integrationDiagnosticWorkflow, []);
    return Response.json({ workflow_run_id: run.runId }, { status: 202 });
  } catch {
    return Response.json({ detail: "El motor Workflow no aceptó la ejecución de prueba." }, { status: 503 });
  }
}