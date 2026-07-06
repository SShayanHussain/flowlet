import { eq } from "drizzle-orm";
import { workflows, type WorkflowGraph } from "../db/schema";
import { checkRunQuota } from "../plans";
import { createRun, type CreateRunResult } from "./runs";
import type { EngineDeps } from "./deps";

/**
 * Cron triggers (ROADMAP Phase 2) — BullMQ job schedulers on the CRON queue.
 *
 * api/ syncs one scheduler per workflow (syncCronSchedule) whenever a workflow
 * is created/updated; the worker consumes firings and creates runs. Dedupe is
 * two-layer: BullMQ generates a deterministic job per tick, AND the fire id is
 * used as the run's trigger idempotency key — a double-fired tick still yields
 * exactly one run.
 */

/** Structural slice of a BullMQ Queue used for scheduler sync (api side). */
export interface CronSchedulerQueue {
  upsertJobScheduler(
    schedulerId: string,
    repeat: { pattern: string },
    template?: { name?: string; data?: unknown }
  ): Promise<unknown>;
  removeJobScheduler(schedulerId: string): Promise<unknown>;
}

export interface CronFireData {
  workflowId: string;
}

/** The cron schedule declared on a workflow's trigger node, if any. */
export function cronScheduleOf(graph: WorkflowGraph): string | null {
  for (const node of graph.nodes ?? []) {
    if (node.type !== "trigger") continue;
    const schedule = node.config?.schedule;
    if (typeof schedule === "string" && schedule.trim() !== "") return schedule;
  }
  return null;
}

export function cronSchedulerId(workflowId: string): string {
  return `wf-${workflowId}`;
}

/**
 * Reconcile the BullMQ scheduler with the workflow's current state. Called by
 * api/ after create/update/enable/disable. Invalid cron patterns throw — the
 * caller surfaces a 400.
 */
export async function syncCronSchedule(
  queue: CronSchedulerQueue,
  workflow: { id: string; enabled: boolean; graph: unknown }
): Promise<{ scheduled: boolean }> {
  const schedule = cronScheduleOf(workflow.graph as WorkflowGraph);
  const schedulerId = cronSchedulerId(workflow.id);

  if (workflow.enabled && schedule) {
    await queue.upsertJobScheduler(schedulerId, { pattern: schedule }, {
      name: "cron-fire",
      data: { workflowId: workflow.id } satisfies CronFireData,
    });
    return { scheduled: true };
  }
  await queue.removeJobScheduler(schedulerId);
  return { scheduled: false };
}

export type CronFireOutcome =
  | { outcome: "run-created"; runId: string; deduplicated: boolean }
  | { outcome: "skipped"; reason: string };

/**
 * Handle one cron firing (worker side). `fireId` must be deterministic per tick
 * (BullMQ scheduler job ids are) — it becomes the trigger idempotency key.
 */
export async function handleCronFire(
  deps: EngineDeps,
  data: CronFireData,
  fireId: string
): Promise<CronFireOutcome> {
  const [wf] = await deps.db
    .select()
    .from(workflows)
    .where(eq(workflows.id, data.workflowId))
    .limit(1);

  // Workflow deleted/disabled after the tick was scheduled — skip, never run.
  if (!wf) return { outcome: "skipped", reason: "workflow not found" };
  if (!wf.enabled) return { outcome: "skipped", reason: "workflow disabled" };

  // Plan gate: a scheduled tick over the monthly run limit is skipped, not run.
  const quota = await checkRunQuota(deps.db, wf.workspaceId);
  if (!quota.allowed) {
    return { outcome: "skipped", reason: `run quota exceeded (${quota.used}/${quota.limit})` };
  }

  const result: CreateRunResult = await createRun(deps, {
    workflow: wf,
    triggerType: "cron",
    triggerPayload: { firedAt: new Date().toISOString() },
    deliveryId: fireId,
  });
  return { outcome: "run-created", runId: result.runId, deduplicated: !result.created };
}
