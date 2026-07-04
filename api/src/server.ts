import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ok, err } from "@flowlet/shared";
import { requireAuth } from "./auth";

/**
 * Build the Fastify app. Kept free of side effects (no DB/Redis connections at
 * import time) so unit tests can spin it up with `.inject()`.
 *
 * HARD RULE (CLAUDE.md): the API NEVER executes a workflow run inline. Trigger
 * endpoints only persist + enqueue a job; the worker executes it. The enqueue
 * wiring lands in Phase 1.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  // --- Liveness ---
  app.get("/health", async () => ok({ status: "ok", service: "api" }));

  // --- Domain (protected). Stubs until Phase 1 lands the engine + schema. ---
  app.get("/api/workflows", { preHandler: requireAuth }, async (request) => {
    // Tenant-scoped by request.auth.workspaceId once the schema exists.
    return ok({ workflows: [], workspaceId: request.auth!.workspaceId });
  });

  // --- Inbound webhook trigger (public; rate-limited at nginx). ---
  // Phase 1: validate token → dedupe via idempotency key → enqueue a run job.
  app.post("/api/webhooks/:token", async (_request, reply) => {
    return reply
      .code(501)
      .send(err("NOT_IMPLEMENTED", "Webhook ingestion + run enqueue lands in Phase 1"));
  });

  return app;
}
