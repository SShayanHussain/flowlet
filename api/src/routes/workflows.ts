import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  createRun,
  err,
  GraphValidationError,
  ok,
  syncCronSchedule,
  validateGraph,
  workflows,
  type WorkflowGraph,
} from "@flowlet/shared";
import { requireAuth } from "../auth";
import type { ApiContext } from "./index";

function newWebhookToken(): string {
  return `whk_${randomBytes(24).toString("hex")}`;
}

export function registerWorkflowRoutes(app: FastifyInstance, ctx: ApiContext) {
  const deps = { db: ctx.db, queues: ctx.queues };
  const { db } = ctx;

  async function syncCron(wf: { id: string; enabled: boolean; graph: unknown }) {
    if (!ctx.cronQueue) return;
    await syncCronSchedule(ctx.cronQueue, wf);
  }

  // List — tenant-scoped by the verified JWT's workspaceId, enriched with
  // 30-day run/success/cost aggregates per workflow (cost-per-workflow, Phase 4).
  app.get("/api/workflows", { preHandler: requireAuth }, async (request) => {
    const ws = request.auth!.workspaceId;
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.workspaceId, ws))
      .orderBy(desc(workflows.updatedAt));

    const statRows = await db.execute(sql`
      SELECT workflow_id,
        count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS runs_30d,
        count(*) FILTER (WHERE status = 'succeeded' AND created_at >= now() - interval '30 days')::int AS succeeded_30d,
        count(*) FILTER (WHERE status = 'failed'    AND created_at >= now() - interval '30 days')::int AS failed_30d,
        coalesce(sum(cost_cents) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::int AS cost_30d
      FROM workflow_runs WHERE workspace_id = ${ws} GROUP BY workflow_id
    `);
    const byWf = new Map(
      (statRows as unknown as {
        workflow_id: string;
        runs_30d: number;
        succeeded_30d: number;
        failed_30d: number;
        cost_30d: number;
      }[]).map((r) => [r.workflow_id, r])
    );

    const enriched = rows.map((wf) => {
      const s = byWf.get(wf.id);
      const rated = (s?.succeeded_30d ?? 0) + (s?.failed_30d ?? 0);
      return {
        ...wf,
        stats: {
          runs30d: s?.runs_30d ?? 0,
          costCents30d: s?.cost_30d ?? 0,
          successRate: rated === 0 ? null : Math.round(((s?.succeeded_30d ?? 0) / rated) * 100),
        },
      };
    });
    return ok({ workflows: enriched });
  });

  app.get("/api/workflows/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [wf] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.workspaceId, request.auth!.workspaceId)))
      .limit(1);
    if (!wf) return reply.code(404).send(err("NOT_FOUND", "Workflow not found"));
    return ok({ workflow: wf });
  });

  app.post("/api/workflows", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { name?: string; graph?: WorkflowGraph; enabled?: boolean };
    if (!body?.name || !body?.graph) {
      return reply.code(400).send(err("VALIDATION_ERROR", "name and graph are required"));
    }
    try {
      validateGraph(body.graph);
    } catch (e) {
      if (e instanceof GraphValidationError) return reply.code(400).send(err("INVALID_GRAPH", e.message));
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
        if (e instanceof GraphValidationError) return reply.code(400).send(err("INVALID_GRAPH", e.message));
        throw e;
      }
    }

    const [wf] = await db
      .update(workflows)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.graph !== undefined ? { graph: body.graph, version: sql`${workflows.version} + 1` } : {}),
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

  app.delete("/api/workflows/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [deleted] = await db
      .delete(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.workspaceId, request.auth!.workspaceId)))
      .returning({ id: workflows.id });
    if (!deleted) return reply.code(404).send(err("NOT_FOUND", "Workflow not found"));
    // Tear down any cron scheduler for the deleted workflow.
    if (ctx.cronQueue) await syncCronSchedule(ctx.cronQueue, { id, enabled: false, graph: { nodes: [], edges: [] } });
    return ok({ deleted: true });
  });

  app.post("/api/workflows/:id/duplicate", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [src] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.workspaceId, request.auth!.workspaceId)))
      .limit(1);
    if (!src) return reply.code(404).send(err("NOT_FOUND", "Workflow not found"));

    // Copies start disabled — a duplicate should never silently start firing.
    const [copy] = await db
      .insert(workflows)
      .values({
        workspaceId: src.workspaceId,
        name: `${src.name} (copy)`,
        graph: src.graph,
        enabled: false,
        webhookToken: newWebhookToken(),
      })
      .returning();
    return reply.code(201).send(ok({ workflow: copy }));
  });

  // Manual trigger. Optional Idempotency-Key header dedupes accidental resubmits.
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

  // Inbound webhook trigger (public; rate-limited at nginx). Addressed by the
  // workflow's unguessable token, never the raw id. X-Delivery-Id → layer-1 dedupe.
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
