import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { ok, workflowRuns, workflows } from "@flowlet/shared";
import { requireAuth } from "../auth";
import type { ApiContext } from "./index";

/**
 * Dashboard aggregates (PRD §0b): runs today, success/failure rate, active
 * workflows, cost this month, recent failures — all tenant-scoped.
 */
export function registerDashboardRoutes(app: FastifyInstance, ctx: ApiContext) {
  const { db } = ctx;

  app.get("/api/dashboard/stats", { preHandler: requireAuth }, async (request) => {
    const ws = request.auth!.workspaceId;

    const aggRows = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int              AS runs_today,
        count(*) FILTER (WHERE status = 'succeeded' AND created_at >= now() - interval '30 days')::int AS succeeded_30d,
        count(*) FILTER (WHERE status = 'failed'    AND created_at >= now() - interval '30 days')::int AS failed_30d,
        coalesce(sum(cost_cents) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::int      AS cost_cents_month
      FROM workflow_runs
      WHERE workspace_id = ${ws}
    `);
    const agg = aggRows[0] as {
      runs_today: number;
      succeeded_30d: number;
      failed_30d: number;
      cost_cents_month: number;
    };

    const [{ active }] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(workflows)
      .where(and(eq(workflows.workspaceId, ws), eq(workflows.enabled, true)));

    const recentFailures = await db
      .select({
        id: workflowRuns.id,
        workflowId: workflowRuns.workflowId,
        workflowName: workflows.name,
        error: workflowRuns.error,
        finishedAt: workflowRuns.finishedAt,
      })
      .from(workflowRuns)
      .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
      .where(and(eq(workflowRuns.workspaceId, ws), eq(workflowRuns.status, "failed")))
      .orderBy(desc(workflowRuns.finishedAt))
      .limit(5);

    const totalRated = agg.succeeded_30d + agg.failed_30d;
    return ok({
      runsToday: agg.runs_today,
      successRate: totalRated === 0 ? null : Math.round((agg.succeeded_30d / totalRated) * 100),
      activeWorkflows: active,
      costCentsThisMonth: agg.cost_cents_month,
      recentFailures,
    });
  });
}
