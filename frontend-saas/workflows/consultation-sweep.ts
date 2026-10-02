import { getStepMetadata, RetryableError } from "workflow";

type WorkflowClaimConsulta = {
  clave_idempotencia: string;
  token_lanzamiento: string;
  tipo: "AUTOMATICA" | "MANUAL" | "AUTOMATICA_NUEVO";
  fecha_local: string;
  hora_local: "12:00" | "17:00" | "MANUAL" | "NUEVO";
  solicitada_por_id?: number;
  radicado_id?: number;
  radicado_ids?: number[];
  consulta_id?: number;
};

type ClaimResult = {
  debe_ejecutar: boolean;
  motivo?: string;
  ejecucion?: { id: string; total_radicados: number };
};

type RadicadoPage = {
  radicados: Array<{ id: number; numero: string }>;
  siguiente_cursor: number | null;
};

type PendingNotificationPage = {
  entrega_ids: number[];
  siguiente_cursor: number | null;
};

type RadicadoResult = {
  estado: string;
  actuaciones_nuevas?: number;
  resultado?: {
    estado?: string;
    actuaciones_nuevas?: ActuacionNueva[];
  };
};

type ActuacionNueva = {
  orden: number;
  fecha_actuacion: string;
  actuacion: string;
  anotacion: string;
  fecha_inicia_termino: string;
  fecha_finaliza_termino: string;
  fecha_registro: string;
  es_fijacion: boolean;
};

type EventoActuaciones = {
  radicado_id: number;
  actuaciones_nuevas: ActuacionNueva[];
};

const PAGE_SIZE = 50;
const PARALLEL_RADICADOS = 5;

function workflowBackendUrl(path: string): URL {
  const backend = process.env.BACKEND_SERVICE_URL ?? (
    process.env.NODE_ENV === "development"
      ? process.env.WORKFLOW_BACKEND_URL ?? "http://localhost:8000"
      : undefined
  );
  if (!backend) throw new Error("BACKEND_SERVICE_URL binding is not configured");
  return new URL(path.replace(/^\//, ""), backend.endsWith("/") ? backend : `${backend}/`);
}

async function workflowBackendFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.WORKFLOW_SERVICE_TOKEN;
  if (!token) throw new Error("WORKFLOW_SERVICE_TOKEN is not configured");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(workflowBackendUrl(path), { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Workflow backend returned ${response.status}`);
  }
  return response;
}

async function claimSweep(input: WorkflowClaimConsulta): Promise<ClaimResult> {
  "use step";
  const response = await workflowBackendFetch("/api/internal/workflows/consultas/claim", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.json() as Promise<ClaimResult>;
}

async function listRadicados(executionId: string, afterId: number): Promise<RadicadoPage> {
  "use step";
  const params = new URLSearchParams({ despues_de: String(afterId), limite: String(PAGE_SIZE) });
  const response = await workflowBackendFetch(
    `/api/internal/workflows/consultas/${encodeURIComponent(executionId)}/radicados?${params}`,
    { method: "GET" },
  );
  return response.json() as Promise<RadicadoPage>;
}

async function processRadicado(executionId: string, radicadoId: number): Promise<RadicadoResult> {
  "use step";
  try {
    const response = await workflowBackendFetch(
      `/api/internal/workflows/consultas/${encodeURIComponent(executionId)}/radicados/${radicadoId}`,
      { method: "POST", body: "{}" },
    );
    const result = (await response.json()) as RadicadoResult;
    if (result.estado === "ERROR") {
      throw new Error(`Consulta fallida para radicado ${radicadoId}`);
    }
    return result;
  } catch (error) {
    const { attempt } = getStepMetadata();
    const retryAfter = Math.min(attempt ** 2 * 5_000, 30_000);
    throw new RetryableError(
      error instanceof Error ? error.message : `Consulta fallida para radicado ${radicadoId}`,
      { retryAfter },
    );
  }
}

processRadicado.maxRetries = 2;

async function finishSweep(executionId: string): Promise<unknown> {
  "use step";
  const response = await workflowBackendFetch(
    `/api/internal/workflows/consultas/${encodeURIComponent(executionId)}/finalizar`,
    { method: "POST", body: "{}" },
  );
  return response.json();
}

async function prepareActuationNotifications(
  executionId: string,
  eventos: EventoActuaciones[],
): Promise<number[]> {
  "use step";
  const response = await workflowBackendFetch(
    `/api/internal/workflows/consultas/${encodeURIComponent(executionId)}/notificaciones/preparar`,
    { method: "POST", body: JSON.stringify({ eventos }) },
  );
  const result = (await response.json()) as { entrega_ids: number[] };
  return result.entrega_ids;
}

async function sendNotification(deliveryId: number): Promise<void> {
  "use step";
  try {
    await workflowBackendFetch(`/api/internal/workflows/notificaciones/${deliveryId}/enviar`, {
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

sendNotification.maxRetries = 2;

async function listPendingNotifications(afterId: number): Promise<PendingNotificationPage> {
  "use step";
  const params = new URLSearchParams({ despues_de: String(afterId), limite: "100" });
  const response = await workflowBackendFetch(
    `/api/internal/workflows/notificaciones/pendientes?${params}`,
    { method: "GET" },
  );
  return response.json() as Promise<PendingNotificationPage>;
}

async function dispatchPendingNotifications(): Promise<number> {
  "use workflow";
  let cursor = 0;
  let errors = 0;
  while (true) {
    const page = await listPendingNotifications(cursor);
    if (page.entrega_ids.length === 0) break;
    for (let index = 0; index < page.entrega_ids.length; index += PARALLEL_RADICADOS) {
      const results = await Promise.allSettled(
        page.entrega_ids.slice(index, index + PARALLEL_RADICADOS).map(sendNotification),
      );
      errors += results.filter((result) => result.status === "rejected").length;
    }
    if (page.siguiente_cursor === null || page.siguiente_cursor <= cursor) break;
    cursor = page.siguiente_cursor;
  }
  return errors;
}

export async function consultationSweep(input: WorkflowClaimConsulta) {
  "use workflow";
  const claim = await claimSweep(input);
  if (!claim.debe_ejecutar || !claim.ejecucion) {
    const notificationErrors = await dispatchPendingNotifications();
    return {
      estado: "OMITIDO",
      motivo: claim.motivo ?? "CLAIM_RECHAZADO",
      errores_notificacion: notificationErrors,
    };
  }

  const executionId = claim.ejecucion.id;
  let cursor = 0;
  let totalErrors = 0;
  const eventosActuaciones: EventoActuaciones[] = [];
  let notificationErrors = 0;

  try {
    while (true) {
      const page = await listRadicados(executionId, cursor);
      if (page.radicados.length === 0) break;

      for (let index = 0; index < page.radicados.length; index += PARALLEL_RADICADOS) {
        const chunk = page.radicados.slice(index, index + PARALLEL_RADICADOS);
        const results = await Promise.allSettled(
          chunk.map((radicado) => processRadicado(executionId, radicado.id)),
        );
        totalErrors += results.filter((result) => result.status === "rejected").length;
        results.forEach((result, resultIndex) => {
          const nuevas = result.status === "fulfilled"
            ? result.value.resultado?.actuaciones_nuevas ?? []
            : [];
          if (nuevas.length > 0) {
            eventosActuaciones.push({
              radicado_id: chunk[resultIndex].id,
              actuaciones_nuevas: nuevas,
            });
          }
        });
      }

      const nextCursor = page.siguiente_cursor;
      if (nextCursor === null || nextCursor <= cursor) break;
      cursor = nextCursor;
    }

    if (eventosActuaciones.length > 0) {
      const deliveryIds = await prepareActuationNotifications(executionId, eventosActuaciones);
      const results = await Promise.allSettled(deliveryIds.map(sendNotification));
      notificationErrors = results.filter((result) => result.status === "rejected").length;
    }
    notificationErrors += await dispatchPendingNotifications();
  } finally {
    await finishSweep(executionId);
  }

  return {
    estado: totalErrors ? "COMPLETADA_CON_ERRORES" : "COMPLETADA",
    errores: totalErrors,
    errores_notificacion: notificationErrors,
  };
}

export async function deliverNotifications(deliveryIds: number[]) {
  "use workflow";
  const uniqueIds = [...new Set(deliveryIds)].filter((id) => Number.isInteger(id) && id > 0);
  let errores = 0;
  for (let index = 0; index < uniqueIds.length; index += PARALLEL_RADICADOS) {
    const results = await Promise.allSettled(
      uniqueIds.slice(index, index + PARALLEL_RADICADOS).map(sendNotification),
    );
    errores += results.filter((result) => result.status === "rejected").length;
  }
  return { estado: errores ? "COMPLETADA_CON_ERRORES" : "COMPLETADA", errores };
}
