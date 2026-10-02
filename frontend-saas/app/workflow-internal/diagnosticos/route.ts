import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { integrationDiagnosticWorkflow } from "@/workflows/integration-diagnostic";

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
  try {
    const run = await start(integrationDiagnosticWorkflow, []);
    return Response.json({ workflow_run_id: run.runId }, { status: 202 });
  } catch {
    return Response.json({ detail: "El motor Workflow no aceptó la ejecución de prueba." }, { status: 503 });
  }
}