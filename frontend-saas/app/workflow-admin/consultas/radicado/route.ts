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

export async function POST(request: Request) {
  const user = await usuarioDeSesion(request);
  if (user instanceof Response) return user;

  let body: {
    consulta_id?: number;
    radicado_id?: number;
    radicado_ids?: number[];
    tipo?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ detail: "Solicitud inválida." }, { status: 400 });
  }

  const automaticNew = body.tipo === "AUTOMATICA_NUEVO";
  const manual = body.tipo === "MANUAL";
  if (!automaticNew && !manual) {
    return Response.json({ detail: "Tipo de consulta no permitido." }, { status: 400 });
  }
  const selectedIds = body.radicado_ids ?? (
    typeof body.radicado_id === "number" ? [body.radicado_id] : []
  );
  if (!selectedIds.length || selectedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return Response.json({ detail: "Radicado requerido." }, { status: 400 });
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    return Response.json({ detail: "La selección contiene radicados repetidos." }, { status: 400 });
  }
  if (manual && user.rol !== "ADMIN") {
    return Response.json({ detail: "Se requiere una cuenta ADMIN." }, { status: 403 });
  }
  if (automaticNew && !["ABOGADO", "ABOGADO_ADMIN", "ADMIN"].includes(user.rol)) {
    return Response.json({ detail: "Esta cuenta no puede consultar radicados." }, { status: 403 });
  }
  if (automaticNew && typeof body.consulta_id !== "number") {
    return Response.json({ detail: "Falta la consulta del radicado nuevo." }, { status: 400 });
  }
  if (automaticNew && selectedIds.length !== 1) {
    return Response.json({ detail: "La consulta inmediata solo admite el nuevo radicado." }, { status: 400 });
  }

  const token = randomUUID();
  const consultaTipo = automaticNew ? "AUTOMATICA_NUEVO" : "MANUAL";
  const consultaKey = automaticNew
    ? `NUEVO:${body.consulta_id}`
    : `MANUAL_RADICADO:${token}`;
  try {
    const run = await start(consultationSweep, [{
      clave_idempotencia: consultaKey,
      token_lanzamiento: token,
      tipo: consultaTipo,
      fecha_local: fechaColombia(new Date()),
      hora_local: automaticNew ? "NUEVO" : "MANUAL",
      solicitada_por_id: user.id,
      radicado_id: body.radicado_id,
      radicado_ids: body.radicado_ids,
      consulta_id: automaticNew ? body.consulta_id : undefined,
    }]);
    return Response.json({ workflow_run_id: run.runId }, { status: 202 });
  } catch {
    return Response.json({ detail: "No fue posible iniciar el Workflow de consulta." }, { status: 503 });
  }
}