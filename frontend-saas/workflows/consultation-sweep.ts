type WorkflowClaimConsulta = {
  clave_idempotencia: string;
  token_lanzamiento: string;
  tipo: "AUTOMATICA" | "MANUAL";
  fecha_local: string;
  hora_local: "12:00" | "17:00" | "MANUAL";
  solicitada_por_id?: number;
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

type RadicadoResult = {
  estado: string;
  actuaciones_nuevas?: number;
  resultado?: { estado?: string };
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
  const response = await workflowBackendFetch(
    `/api/internal/workflows/consultas/${encodeURIComponent(executionId)}/radicados/${radicadoId}`,
    { method: "POST", body: "{}" },
  );
  const result = (await response.json()) as RadicadoResult;
  if (result.estado === "ERROR") {
    throw new Error(`Consulta fallida para radicado ${radicadoId}`);
  }
  return result;
}

async function finishSweep(executionId: string): Promise<unknown> {
  "use step";
  const response = await workflowBackendFetch(
    `/api/internal/workflows/consultas/${encodeURIComponent(executionId)}/finalizar`,
    { method: "POST", body: "{}" },
  );
  return response.json();
}

export async function consultationSweep(input: WorkflowClaimConsulta) {
  "use workflow";
  const claim = await claimSweep(input);
  if (!claim.debe_ejecutar || !claim.ejecucion) {
    return { estado: "OMITIDO", motivo: claim.motivo ?? "CLAIM_RECHAZADO" };
  }

  const executionId = claim.ejecucion.id;
  let cursor = 0;
  let totalErrors = 0;

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
      }

      const nextCursor = page.siguiente_cursor;
      if (nextCursor === null || nextCursor <= cursor) break;
      cursor = nextCursor;
    }
  } finally {
    await finishSweep(executionId);
  }

  return { estado: totalErrors ? "COMPLETADA_CON_ERRORES" : "COMPLETADA", errores: totalErrors };
}
