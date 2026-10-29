import { timingSafeEqual } from "node:crypto";

const SCHEDULE = "0 13 * * *";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected) return false;
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ detail: "Cron no autorizado." }, { status: 401 });
  }
  if (request.headers.get("x-vercel-cron-schedule") !== SCHEDULE) {
    return Response.json({ detail: "Slot Cron inválido." }, { status: 400 });
  }

  const backend = process.env.BACKEND_SERVICE_URL;
  const token = process.env.WORKFLOW_SERVICE_TOKEN;
  if (!backend || !token) {
    return Response.json({ detail: "Bindings de servicio no configurados." }, { status: 503 });
  }

  try {
    const response = await fetch(new URL("/api/internal/workflows/recordatorios-documentos", backend), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json({ detail: "El backend no pudo enviar los recordatorios." }, { status: 502 });
    }
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ detail: "No fue posible contactar el backend." }, { status: 502 });
  }
}
