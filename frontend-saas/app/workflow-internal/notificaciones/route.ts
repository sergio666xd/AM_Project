import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { deliverNotifications } from "@/workflows/consultation-sweep";

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