import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  createRun,
  err,
  GraphValidationError,
  ok,
  runSteps,
  syncCronSchedule,
  validateGraph,
  workflowRuns,
  workflows,
  type CronSchedulerQueue,
  type Db,
  type EngineQueues,
  type WorkflowGraph,
} from "@flowlet/shared";
import { requireAuth } from "./auth";

export interface ApiContext {
  db: Db;
  queues: EngineQueues;
  /** Optional: cron trigger sync is skipped when absent (unit tests). */
  cronQueue?: CronSchedulerQueue;
}

function newWebhookToken(): string {
  return `whk_${randomBytes(24).toString("hex")}`;
}

/**
 * Domain routes. HARD RULE (CLAUDE.md): nothing here executes a run — trigger
 * endpoints persist + enqueue via createRun; the worker does the rest.
 */
export function registerRoutes(app: FastifyInstance, ctx: ApiContext) {
  const deps = { db: ctx.db, queues: ctx.queues };
  const { db } = ctx;

  async function syncCron(wf: { id: string; enabled: boolean; graph: unknown }) {
    if (!ctx.cronQueue) return;
    await syncCronSchedule(ctx.cronQueue, wf);
  }

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
        webhookToken: newWebhookToken(),
      })
      .returning();

    try {
      await syncCron(wf);
    } catch {
      return reply.code(400).send(err("INVALID_SCHEDULE", "Invalid cron expression on trigger node"));
    }
    return reply.code(201).send(ok({ workflow: wf }));
  });

  // Update name/graph/enabled. Graph changes bump `version`; in-flight runs are
  // untouched (they execute their graph_snapshot). Cron scheduler re-synced.
  app.patch("/api/workflows/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; graph?: WorkflowGraph; enabled?: boolean };

    const [existing] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.workspaceId, request.auth!.workspaceId)))
      .limit(1);
    if (!existing) return reply.code(404).send(err("NOT_FOUND", "Workflow not found"));

    if (body.graph) {
      try {
        validateGraph(body.graph);
      } catch (e) {
        if (e instanceof GraphValidationError) {
          return reply.code(400).send(err("INVALID_GRAPH", e.message));
        }
        throw e;
      }
    }

    const [wf] = await db
      .update(workflows)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.graph !== undefined
          ? { graph: body.graph, version: sql`${workflows.version} + 1` }
          : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, existing.id))
      .returning();

    try {
      await syncCron(wf);
    } catch {
      return reply.code(400).send(err("INVALID_SCHEDULE", "Invalid cron expression on trigger node"));
    }
    return ok({ workflow: wf });
  });

  // --- Manual trigger --------------------------------------------------------
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
  // Addressed by the workflow's unguessable token (whk_…), never the raw id.
  // X-Delivery-Id gives the trigger event its identity for dedupe (layer 1).
  app.post("/api/webhooks/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!/^whk_[0-9a-f]{48}$/i.test(token)) {
      return reply.code(404).send(err("NOT_FOUND", "Unknown webhook"));
    }
    const [wf] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.webhookToken, token), eq(workflows.enabled, true)))
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
