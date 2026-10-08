import { getStepMetadata, RetryableError, sleep } from "workflow";

type TaskReminderInput = {
  recordatorio_id: number;
  version: number;
  programado_para: string;
};

type PreparedReminder = {
  estado: string;
  entrega_ids: number[];
  programado_para?: string;
};

function backendUrl(path: string): URL {
  const backend = process.env.BACKEND_SERVICE_URL ?? (
    process.env.NODE_ENV === "development"
      ? process.env.WORKFLOW_BACKEND_URL ?? "http://localhost:8000"
      : undefined
  );
  if (!backend) throw new Error("BACKEND_SERVICE_URL binding is not configured");
  return new URL(path.replace(/^\//, ""), backend.endsWith("/") ? backend : `${backend}/`);
}

async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.WORKFLOW_SERVICE_TOKEN;
  if (!token) throw new Error("WORKFLOW_SERVICE_TOKEN is not configured");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(backendUrl(path), { ...init, headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Workflow backend returned ${response.status}`);
  return response;
}

async function prepareReminder(input: TaskReminderInput): Promise<PreparedReminder> {
  "use step";
  try {
    const response = await backendFetch(
      `/api/internal/workflows/recordatorios/${input.recordatorio_id}/preparar`,
      { method: "POST", body: JSON.stringify({ version: input.version }) },
    );
    return response.json() as Promise<PreparedReminder>;
  } catch (error) {
    const { attempt } = getStepMetadata();
    throw new RetryableError(
      error instanceof Error ? error.message : "No fue posible validar el recordatorio.",
      { retryAfter: Math.min(attempt ** 2 * 5_000, 30_000) },
    );
  }
}

prepareReminder.maxRetries = 3;

async function sendDelivery(deliveryId: number): Promise<void> {
  "use step";
  try {
    await backendFetch(`/api/internal/workflows/notificaciones/${deliveryId}/enviar`, {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    const { attempt } = getStepMetadata();
    throw new RetryableError(
      error instanceof Error ? error.message : `No fue posible enviar la entrega ${deliveryId}`,
      { retryAfter: Math.min(attempt ** 2 * 5_000, 30_000) },
    );
  }
}

sendDelivery.maxRetries = 2;

async function reconcileReminderLaunches(): Promise<void> {
  "use step";
  await backendFetch("/api/internal/workflows/recordatorios/reconciliar", {
    method: "POST",
    body: "{}",
  });
}

export async function taskReminderWorkflow(input: TaskReminderInput) {
  "use workflow";
  await reconcileReminderLaunches();
  const scheduledAt = new Date(input.programado_para);
  const delayMs = scheduledAt.getTime() - Date.now();
  if (delayMs > 0) await sleep(delayMs);

  let prepared = await prepareReminder(input);
  while (prepared.estado === "TODAVIA_NO_VENCE" && prepared.programado_para) {
    const nextDelay = new Date(prepared.programado_para).getTime() - Date.now();
    if (nextDelay > 0) await sleep(nextDelay);
    prepared = await prepareReminder(input);
  }
  const results = await Promise.allSettled(prepared.entrega_ids.map(sendDelivery));
  return {
    estado: prepared.estado,
    errores: results.filter((result) => result.status === "rejected").length,
  };
}