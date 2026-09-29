import { getRun, start } from "@workflow/core/runtime";
import { workflowProbe } from "@/workflows/workflow-probe";

async function requireAdmin(request: Request): Promise<Response | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ detail: "Autenticación requerida." }, { status: 401 });
  }

  const headers = new Headers({ Authorization: authorization });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

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

  const user = await response.json();
  if (user.rol !== "ADMIN") {
    return Response.json({ detail: "Se requiere una cuenta ADMIN." }, { status: 403 });
  }

  return null;
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const run = await start(workflowProbe);
  return Response.json({ run_id: run.runId, status: await run.status });
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const runId = new URL(request.url).searchParams.get("run_id");
  if (!runId) {
    return Response.json({ detail: "run_id es obligatorio." }, { status: 400 });
  }

  const run = getRun(runId);
  if (!(await run.exists)) {
    return Response.json({ detail: "Ejecución no encontrada." }, { status: 404 });
  }

  const status = await run.status;
  const result = status === "completed" ? await run.returnValue : null;
  return Response.json({ run_id: runId, status, result });
}