import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { start } from "workflow/api";
import { consultationSweep } from "./consultation-sweep";

const EXECUTION_ID = "retry-test-execution";
const RADICADO_TRANSIENTE_ID = 101;
const RADICADO_PERSISTENTE_ID = 202;

type BackendStub = {
  server: Server;
  processAttempts: Map<number, number>;
  successfulCalls: number[];
  finalizeCalls: number;
};

async function startBackendStub(): Promise<BackendStub> {
  const processAttempts = new Map<number, number>();
  const successfulCalls: number[] = [];
  let finalizeCalls = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    request.resume();
    response.setHeader("Content-Type", "application/json");

    if (request.headers.authorization !== "Bearer workflow-test-token") {
      response.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (path.endsWith("/consultas/claim")) {
      response.end(JSON.stringify({
        debe_ejecutar: true,
        ejecucion: { id: EXECUTION_ID, total_radicados: 1 },
      }));
      return;
    }

    if (path.endsWith(`/consultas/${EXECUTION_ID}/radicados`)) {
      response.end(JSON.stringify({
        radicados: [
          { id: RADICADO_TRANSIENTE_ID, numero: "12345678901234567890123" },
          { id: RADICADO_PERSISTENTE_ID, numero: "12345678901234567890124" },
        ],
        siguiente_cursor: null,
      }));
      return;
    }

    const processMatch = path.match(new RegExp(`/consultas/${EXECUTION_ID}/radicados/(\\d+)$`));
    if (processMatch) {
      const radicadoId = Number(processMatch[1]);
      const attempts = (processAttempts.get(radicadoId) ?? 0) + 1;
      processAttempts.set(radicadoId, attempts);
      const failed = radicadoId === RADICADO_PERSISTENTE_ID || attempts <= 2;
      if (!failed) successfulCalls.push(radicadoId);
      response.end(JSON.stringify(failed
        ? { estado: "ERROR", resultado: { estado: "error_api: simulated" } }
        : { estado: "COMPLETADA", actuaciones_nuevas: 1, resultado: { estado: "ok" } }));
      return;
    }

    if (path.endsWith(`/consultas/${EXECUTION_ID}/finalizar`)) {
      finalizeCalls += 1;
      response.end(JSON.stringify({ estado: "COMPLETADA" }));
      return;
    }

    if (path.endsWith("/notificaciones/pendientes")) {
      response.end(JSON.stringify({ entrega_ids: [], siguiente_cursor: null }));
      return;
    }

    response.writeHead(404).end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  vi.stubEnv("BACKEND_SERVICE_URL", `http://127.0.0.1:${address.port}/`);
  vi.stubEnv("WORKFLOW_SERVICE_TOKEN", "workflow-test-token");

  return {
    server,
    processAttempts,
    successfulCalls,
    get finalizeCalls() { return finalizeCalls; },
  };
}

async function closeBackendStub(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

describe("consultationSweep durable retries", () => {
  it("recovers one case and isolates another after exhausting retries", async () => {
    const backend = await startBackendStub();
    try {
      const startedAt = Date.now();
      const run = await start(consultationSweep, [{
        clave_idempotencia: "MANUAL:retry-test",
        token_lanzamiento: "test-launch-token",
        tipo: "MANUAL",
        fecha_local: "2026-10-01",
        hora_local: "MANUAL",
      }]);

      await expect(run.returnValue).resolves.toEqual({
        estado: "COMPLETADA_CON_ERRORES",
        errores: 1,
        errores_notificacion: 0,
      });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20_000);
      expect([...backend.processAttempts.entries()].sort()).toEqual([
        [RADICADO_TRANSIENTE_ID, 3],
        [RADICADO_PERSISTENTE_ID, 3],
      ]);
      expect(backend.successfulCalls).toEqual([RADICADO_TRANSIENTE_ID]);
      expect(backend.finalizeCalls).toBe(1);
    } finally {
      await closeBackendStub(backend.server);
      vi.unstubAllEnvs();
    }
  });
});