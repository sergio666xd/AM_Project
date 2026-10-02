import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { start } from "workflow/api";
import { taskReminderWorkflow } from "./task-reminder";

async function startBackendStub(preparedState: string) {
  let preparations = 0;
  let sends = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    request.resume();
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== "Bearer reminder-workflow-token") {
      response.writeHead(401).end(JSON.stringify({ detail: "unauthorized" }));
      return;
    }
    if (path.endsWith("/preparar")) {
      preparations += 1;
      response.end(JSON.stringify({
        estado: preparedState,
        entrega_ids: preparedState === "PREPARADO" ? [91] : [],
      }));
      return;
    }
    if (path.endsWith("/notificaciones/91/enviar")) {
      sends += 1;
      response.end(JSON.stringify({ estado: "ENVIADA" }));
      return;
    }
    response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  vi.stubEnv("BACKEND_SERVICE_URL", `http://127.0.0.1:${address.port}/`);
  vi.stubEnv("WORKFLOW_SERVICE_TOKEN", "reminder-workflow-token");
  return {
    server,
    get preparations() { return preparations; },
    get sends() { return sends; },
  };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("taskReminderWorkflow", () => {
  it("waits until its scheduled time, then prepares and sends the delivery", async () => {
    const backend = await startBackendStub("PREPARADO");
    try {
      const run = await start(taskReminderWorkflow, [{
        recordatorio_id: 19,
        version: 4,
        programado_para: new Date(Date.now() + 150).toISOString(),
      }]);
      await expect(run.returnValue).resolves.toEqual({ estado: "PREPARADO", errores: 0 });
      expect(backend.preparations).toBe(1);
      expect(backend.sends).toBe(1);
    } finally {
      await closeServer(backend.server);
    }
  });

  it("does not send when the backend invalidates a stale generation", async () => {
    const backend = await startBackendStub("CANCELADO");
    try {
      const run = await start(taskReminderWorkflow, [{
        recordatorio_id: 19,
        version: 3,
        programado_para: new Date(Date.now() - 1).toISOString(),
      }]);
      await expect(run.returnValue).resolves.toEqual({ estado: "CANCELADO", errores: 0 });
      expect(backend.preparations).toBe(1);
      expect(backend.sends).toBe(0);
    } finally {
      await closeServer(backend.server);
    }
  });
});