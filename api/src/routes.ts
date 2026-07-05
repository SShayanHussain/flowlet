import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import {
  createRun,
  err,
  GraphValidationError,
  ok,
  runSteps,
  validateGraph,
  workflowRuns,
  workflows,
  type Db,
  type EngineQueues,
  type WorkflowGraph,
} from "@flowlet/shared";
import { requireAuth } from "./auth";

export interface ApiContext {
  db: Db;
  queues: EngineQueues;
}

/**
 * Domain routes. HARD RULE (CLAUDE.md): nothing here executes a run — trigger
 * endpoints persist + enqueue via createRun; the worker does the rest.
 */
export function registerRoutes(app: FastifyInstance, ctx: ApiContext) {
  const deps = { db: ctx.db, queues: ctx.queues };
  const { db } = ctx;

  // --- Workflows (tenant-scoped by the verified JWT's workspaceId) ----------
  app.get("/api/workflows", { preHandler: requireAuth }, async (request) => {
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.workspaceId, request.auth!.workspaceId))
      .orderBy(desc(workflows.updatedAt));
    return ok({ workflows: rows });
  });

  app.post("/api/workflows", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { name?: string; graph?: WorkflowGraph; enabled?: boolean };
    if (!body?.name || !body?.graph) {
      return reply.code(400).send(err("VALIDATION_ERROR", "name and graph are required"));
    }
    try {
      validateGraph(body.graph);
    } catch (e) {
      if (e instanceof GraphValidationError) {
        return reply.code(400).send(err("INVALID_GRAPH", e.message));
      }
      throw e;
    }
    const [wf] = await db
      .insert(workflows)
      .values({
        workspaceId: request.auth!.workspaceId,
        name: body.name,
        graph: body.graph,
        enabled: body.enabled ?? false,
      })
      .returning();
    return reply.code(201).send(ok({ workflow: wf }));
  });

  // --- Manual trigger --------------------------------------------------------
  // Optional Idempotency-Key header dedupes accidental double-submits; absent →
  // every click is a distinct trigger event by design.
  app.post("/api/workflows/:id/run", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [wf] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.workspaceId, request.auth!.workspaceId)))
      .limit(1);
    if (!wf) return reply.code(404).send(err("NOT_FOUND", "Workflow not found"));

    const result = await createRun(deps, {
      workflow: wf,
      triggerType: "manual",
      triggerPayload: request.body ?? {},
      deliveryId: request.headers["idempotency-key"] as string | undefined,
    });
    return reply.code(202).send(ok({ runId: result.runId, deduplicated: !result.created }));
  });

  // --- Run trace -------------------------------------------------------------
  app.get("/api/runs/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, id), eq(workflowRuns.workspaceId, request.auth!.workspaceId)))
      .limit(1);
    if (!run) return reply.code(404).send(err("NOT_FOUND", "Run not found"));
    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, id));
    return ok({ run, steps });
  });

  // --- Inbound webhook trigger (public; rate-limited at nginx) ---------------
  // X-Delivery-Id gives the trigger event its identity for dedupe (layer 1);
  // absent → no dedupe, every delivery runs. Phase 2 replaces the raw workflow
  // id in the path with an unguessable per-trigger token.
  app.post("/api/webhooks/:workflowId", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(workflowId)) {
      return reply.code(404).send(err("NOT_FOUND", "Unknown webhook"));
    }
    const [wf] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.enabled, true)))
      .limit(1);
    if (!wf) return reply.code(404).send(err("NOT_FOUND", "Unknown webhook"));

    const result = await createRun(deps, {
      workflow: wf,
      triggerType: "webhook",
      triggerPayload: request.body ?? {},
      deliveryId: request.headers["x-delivery-id"] as string | undefined,
    });
    return reply.code(202).send(ok({ runId: result.runId, deduplicated: !result.created }));
  });
}
