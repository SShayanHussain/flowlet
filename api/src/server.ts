import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ok } from "@flowlet/shared";
import { registerRoutes, type ApiContext } from "./routes";

/**
 * Build the Fastify app. Side-effect free — db/queues are injected via ctx so
 * unit tests can pass fakes and `.inject()` without live connections.
 *
 * HARD RULE (CLAUDE.md): the API NEVER executes a workflow run inline. Trigger
 * endpoints persist + enqueue a job; the worker executes it.
 */
export function buildServer(ctx: ApiContext): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get("/health", async () => ok({ status: "ok", service: "api" }));

  registerRoutes(app, ctx);

  return app;
}
