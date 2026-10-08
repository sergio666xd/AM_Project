import { timingSafeEqual } from "node:crypto";

export type WorkflowAuthFailure =
  | "WORKFLOW_SERVICE_TOKEN_MISSING"
  | "AUTHORIZATION_HEADER_MISSING"
  | "WORKFLOW_SERVICE_TOKEN_MISMATCH";

export function workflowAuthFailure(request: Request): WorkflowAuthFailure | null {
  const expected = process.env.WORKFLOW_SERVICE_TOKEN?.trim() ?? "";
  if (!expected) return "WORKFLOW_SERVICE_TOKEN_MISSING";

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return "AUTHORIZATION_HEADER_MISSING";
  const received = authorization.slice("Bearer ".length).trim();
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return "WORKFLOW_SERVICE_TOKEN_MISMATCH";
  }
  return null;
}

export function workflowUnauthorized(failure: WorkflowAuthFailure): Response {
  return Response.json(
    { code: failure, detail: "Credencial interna inválida." },
    { status: 401 },
  );
}