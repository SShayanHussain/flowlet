import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import {
  createRun,
  err,
  ok,
  runSteps,
  workflowRuns,
  workflows,
} from "@flowlet/shared";
import { requireAuth } from "../auth";
import type { ApiContext } from "./index";

export function registerRunRoutes(app: FastifyInstance, ctx: ApiContext) {
  const deps = { db: ctx.db, queues: ctx.queues };
  const { db } = ctx;

  // Run history across the workspace. Optional ?workflowId filter; capped list.
  app.get("/api/runs", { preHandler: requireAuth }, async (request) => {
    const q = request.query as { workflowId?: string; limit?: string };
    const limit = Math.min(Number(q.limit) || 50, 200);
    const filters = [eq(workflowRuns.workspaceId, request.auth!.workspaceId)];
    if (q.workflowId) filters.push(eq(workflowRuns.workflowId, q.workflowId));

    const rows = await db
      .select({
        id: workflowRuns.id,
        workflowId: workflowRuns.workflowId,
        triggerType: workflowRuns.triggerType,
        status: workflowRuns.status,
        costCents: workflowRuns.costCents,
        createdAt: workflowRuns.createdAt,
        startedAt: workflowRuns.startedAt,
        finishedAt: workflowRuns.finishedAt,
      })
      .from(workflowRuns)
      .where(and(...filters))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(limit);
    return ok({ runs: rows });
  });

  // Run trace — the run + its per-node steps (input/output/latency/status/error).
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

  // Replay — re-run the CURRENT workflow with the original trigger payload as a
  // fresh event (new run; no deliveryId so it always creates). Runs are jobs.
  app.post("/api/runs/:id/replay", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, id), eq(workflowRuns.workspaceId, request.auth!.workspaceId)))
      .limit(1);
    if (!run) return reply.code(404).send(err("NOT_FOUND", "Run not found"));

    const [wf] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, run.workflowId))
      .limit(1);
    if (!wf) return reply.code(404).send(err("NOT_FOUND", "Workflow no longer exists"));

    const result = await createRun(deps, {
      workflow: wf,
      triggerType: "manual",
      triggerPayload: run.triggerPayload ?? {},
    });
    return reply.code(202).send(ok({ runId: result.runId }));
  });
}
