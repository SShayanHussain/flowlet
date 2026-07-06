import { and, eq, sql } from "drizzle-orm";
import { workflowRuns, workflows } from "./db/schema";
import { workspaces } from "./db/shell";
import type { DbLike } from "./engine/deps";

/**
 * Plan gating (PRD Definition of Done): cap active-workflow count and monthly
 * runs per plan. Enforced at every trigger path (manual / webhook / cron) and on
 * workflow enable — one workspace can't exceed its plan on any surface.
 */
export type PlanId = "free" | "pro" | "team";

export interface PlanLimits {
  /** Max simultaneously-enabled workflows. */
  activeWorkflows: number;
  /** Max runs created per calendar month. */
  runsPerMonth: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { activeWorkflows: 2, runsPerMonth: 100 },
  pro: { activeWorkflows: Infinity, runsPerMonth: 10_000 },
  team: { activeWorkflows: Infinity, runsPerMonth: 100_000 },
};

export function planLimitsFor(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as PlanId)] ?? PLAN_LIMITS.free;
}

/** Resolve a workspace's plan (defaults to free if the row is missing). */
export async function getWorkspacePlan(db: DbLike, workspaceId: string): Promise<PlanId> {
  const [row] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const plan = (row?.plan as PlanId) ?? "free";
  return plan in PLAN_LIMITS ? plan : "free";
}

export async function activeWorkflowCount(db: DbLike, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workflows)
    .where(and(eq(workflows.workspaceId, workspaceId), eq(workflows.enabled, true)));
  return row?.n ?? 0;
}

export async function runsThisMonth(db: DbLike, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workspaceId, workspaceId),
        sql`${workflowRuns.createdAt} >= date_trunc('month', now())`
      )
    );
  return row?.n ?? 0;
}

export interface QuotaCheck {
  allowed: boolean;
  plan: PlanId;
  used: number;
  limit: number;
}

/** Would creating one more run exceed the monthly run limit? */
export async function checkRunQuota(db: DbLike, workspaceId: string): Promise<QuotaCheck> {
  const plan = await getWorkspacePlan(db, workspaceId);
  const limit = planLimitsFor(plan).runsPerMonth;
  const used = await runsThisMonth(db, workspaceId);
  return { allowed: used < limit, plan, used, limit };
}

/** Would enabling one more workflow exceed the active-workflow limit? */
export async function checkWorkflowQuota(db: DbLike, workspaceId: string): Promise<QuotaCheck> {
  const plan = await getWorkspacePlan(db, workspaceId);
  const limit = planLimitsFor(plan).activeWorkflows;
  const used = await activeWorkflowCount(db, workspaceId);
  return { allowed: used < limit, plan, used, limit };
}
