import { and, eq, inArray, sql } from "drizzle-orm";
import {
  runSteps,
  workflowRuns,
  type RunStep,
  type WorkflowGraph,
  type WorkflowRun,
} from "../db/schema";
import { queueForNode, stepJobOptions, type StepJobData, DEFAULT_STEP_ATTEMPTS } from "../queues";
import type { Db, DbLike, EngineDeps } from "./deps";
import { StepError, toStepError } from "./errors";
import { nodeById, predecessorsOf, successorsOf } from "./graph";
import { defaultExecutors, deliveredTargets, type StepResult } from "./nodes";

/**
 * Step executor (design 03 §4–§10). One invocation = one BullMQ step job.
 *
 * Guarantee: at-least-once execution, exactly-once EFFECTS —
 *  - the atomic claim (queued/pending → running) dedupes concurrent duplicates;
 *  - the atomic pending→queued fan-out claim makes joins fire exactly once;
 *  - output nodes claim an idempotency key before sending.
 */

export interface StepJobMeta {
  /** BullMQ job.attemptsMade at processing time (0 on first attempt). */
  attemptsMade: number;
  /** BullMQ job.opts.attempts. */
  maxAttempts: number;
}

export type StepOutcome =
  | { outcome: "completed" }
  | { outcome: "not-claimable" } // duplicate delivery or already-terminal step — safe no-op
  | { outcome: "run-not-active" }
  | { outcome: "retry"; error: string } // caller rethrows so BullMQ retries with backoff
  | { outcome: "failed"; error: string }; // terminal — step + run failed

const TERMINAL_STEP = ["succeeded", "skipped"] as const;

export async function handleStepJob(
  deps: EngineDeps,
  data: StepJobData,
  meta: StepJobMeta = { attemptsMade: 0, maxAttempts: deps.maxAttempts ?? DEFAULT_STEP_ATTEMPTS }
): Promise<StepOutcome> {
  const { db } = deps;

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, data.runId))
    .limit(1);
  if (!run) throw new Error(`Run ${data.runId} not found`);
  if (run.status !== "queued" && run.status !== "running") {
    return { outcome: "run-not-active" };
  }
  const graph = run.graphSnapshot as WorkflowGraph;

  // --- Claim (dedupe layer 2): atomic queued/pending → running -------------
  const claimed = await db
    .update(runSteps)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${runSteps.attempts} + 1`,
    })
    .where(
      and(
        eq(runSteps.runId, data.runId),
        eq(runSteps.nodeId, data.nodeId),
        inArray(runSteps.status, ["queued", "pending"])
      )
    )
    .returning();
  if (claimed.length === 0) return { outcome: "not-claimable" };
  const step = claimed[0];

  // First step activates the run (idempotent guard on status).
  await db
    .update(workflowRuns)
    .set({ status: "running", startedAt: sql`coalesce(${workflowRuns.startedAt}, now())` })
    .where(and(eq(workflowRuns.id, run.id), eq(workflowRuns.status, "queued")));

  // --- Gather inputs from delivering predecessors ---------------------------
  const inputs = await gatherInputs(db, run.id, graph, data.nodeId);
  const node = nodeById(graph, data.nodeId);
  const executors = { ...defaultExecutors, ...deps.executors };
  const startedAt = Date.now();

  let result: StepResult;
  try {
    result = await withTimeout(
      (signal) =>
        executors[node.type]({
          node,
          graph,
          inputs,
          triggerPayload: run.triggerPayload,
          signal,
          db,
          runId: run.id,
          workspaceId: run.workspaceId,
          llm: deps.llm,
          aiRateLimiter: deps.aiRateLimiter,
        }),
      deps.stepTimeoutMs ?? 30_000
    );
  } catch (err) {
    return await handleStepFailure(db, run, step, inputs, toStepError(err), meta);
  }

  // --- Success: record trace, fan out, check completion ---------------------
  await db
    .update(runSteps)
    .set({
      status: "succeeded",
      input: inputs,
      output: { value: result.value, ...(result.taken ? { taken: result.taken } : {}) },
      costCents: result.costCents ?? 0,
      latencyMs: Date.now() - startedAt,
      finishedAt: new Date(),
    })
    .where(eq(runSteps.id, step.id));

  if (result.costCents) {
    await db
      .update(workflowRuns)
      .set({ costCents: sql`${workflowRuns.costCents} + ${result.costCents}` })
      .where(eq(workflowRuns.id, run.id));
  }

  const delivered = new Set(deliveredTargets(graph, node, result));
  for (const successorId of successorsOf(graph, node.id)) {
    await evaluateNode(deps, run, graph, successorId, delivered.has(successorId));
  }

  await checkRunCompletion(db, run.id);
  return { outcome: "completed" };
}

// ---------------------------------------------------------------------------
// Fan-out: decide queue-or-skip for a node whose predecessor just terminalized.
// ---------------------------------------------------------------------------

/**
 * `hint` — whether the just-finished predecessor delivered to this node. Other
 * predecessors are re-read from the DB; their terminal states can't regress, so
 * reading them outside the atomic claim is safe. The contended pending→queued /
 * pending→skipped transition is a single atomic UPDATE — the loser matches 0 rows.
 */
async function evaluateNode(
  deps: EngineDeps,
  run: WorkflowRun,
  graph: WorkflowGraph,
  nodeId: string,
  hint: boolean
): Promise<void> {
  const { db } = deps;
  const predIds = predecessorsOf(graph, nodeId);

  const predSteps = predIds.length
    ? await db
        .select()
        .from(runSteps)
        .where(and(eq(runSteps.runId, run.id), inArray(runSteps.nodeId, predIds)))
    : [];

  // Wait until every predecessor is terminal (a later completion re-evaluates).
  if (predSteps.some((p) => !TERMINAL_STEP.includes(p.status as (typeof TERMINAL_STEP)[number]))) {
    return;
  }

  const isDelivered = hint || predSteps.some((p) => deliversTo(graph, p, nodeId));

  if (isDelivered) {
    // Join-safe claim (design 03 §5 layer 2): pending→queued exactly once, with the
    // all-predecessors-terminal predicate INSIDE the statement.
    const rows = await db.execute(sql`
      UPDATE run_steps SET status = 'queued'
      WHERE run_id = ${run.id} AND node_id = ${nodeId} AND status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM run_steps p
          WHERE p.run_id = ${run.id}
            AND p.node_id IN (${sql.join(predIds.map((id) => sql`${id}`), sql`, `)})
            AND p.status NOT IN ('succeeded', 'skipped'))
      RETURNING id
    `);
    if (rows.length > 0) {
      const node = nodeById(graph, nodeId);
      await queueForNode(deps.queues, node).add(
        "step",
        { runId: run.id, workspaceId: run.workspaceId, nodeId },
        stepJobOptions(run.id, nodeId, deps.maxAttempts)
      );
    }
  } else {
    // No predecessor delivers → dead branch. Skip and propagate (design 03 §9).
    const skipped = await db
      .update(runSteps)
      .set({ status: "skipped", finishedAt: new Date() })
      .where(
        and(eq(runSteps.runId, run.id), eq(runSteps.nodeId, nodeId), eq(runSteps.status, "pending"))
      )
      .returning({ id: runSteps.id });
    if (skipped.length > 0) {
      for (const successorId of successorsOf(graph, nodeId)) {
        await evaluateNode(deps, run, graph, successorId, false);
      }
    }
  }
}

/** Did terminal predecessor `p` deliver to `nodeId`? (skipped delivers nothing) */
function deliversTo(graph: WorkflowGraph, p: RunStep, nodeId: string): boolean {
  if (p.status !== "succeeded") return false;
  const predNode = nodeById(graph, p.nodeId);
  if (predNode.type !== "branch") return true;
  const taken = (p.output as { taken?: string[] } | null)?.taken ?? [];
  return taken.includes(nodeId);
}

async function gatherInputs(
  db: DbLike,
  runId: string,
  graph: WorkflowGraph,
  nodeId: string
): Promise<Record<string, unknown>> {
  const predIds = predecessorsOf(graph, nodeId);
  if (predIds.length === 0) return {};
  const preds = await db
    .select()
    .from(runSteps)
    .where(and(eq(runSteps.runId, runId), inArray(runSteps.nodeId, predIds)));

  const inputs: Record<string, unknown> = {};
  for (const p of preds) {
    if (!deliversTo(graph, p, nodeId)) continue;
    inputs[p.nodeId] = (p.output as { value?: unknown } | null)?.value;
  }
  return inputs;
}

// ---------------------------------------------------------------------------
// Failure handling (design 03 §10) + run completion (§9)
// ---------------------------------------------------------------------------

async function handleStepFailure(
  db: Db,
  run: WorkflowRun,
  step: RunStep,
  inputs: Record<string, unknown>,
  err: StepError,
  meta: StepJobMeta
): Promise<StepOutcome> {
  const errorJson = { message: err.message, retryable: err.retryable };
  const attemptsLeft = meta.attemptsMade + 1 < meta.maxAttempts;

  if (err.retryable && attemptsLeft) {
    // Back to 'queued' so the BullMQ retry can re-claim it; caller rethrows.
    await db
      .update(runSteps)
      .set({ status: "queued", input: inputs, error: errorJson })
      .where(eq(runSteps.id, step.id));
    return { outcome: "retry", error: err.message };
  }

  // Terminal (or retries exhausted): fail step + run, skip everything still pending.
  await db.transaction(async (tx) => {
    await tx
      .update(runSteps)
      .set({ status: "failed", input: inputs, error: errorJson, finishedAt: new Date() })
      .where(eq(runSteps.id, step.id));
    await tx
      .update(workflowRuns)
      .set({
        status: "failed",
        error: { nodeId: step.nodeId, message: err.message },
        finishedAt: new Date(),
      })
      .where(and(eq(workflowRuns.id, run.id), inArray(workflowRuns.status, ["queued", "running"])));
    await tx
      .update(runSteps)
      .set({ status: "skipped", finishedAt: new Date() })
      .where(and(eq(runSteps.runId, run.id), inArray(runSteps.status, ["pending", "queued"])));
  });
  return { outcome: "failed", error: err.message };
}

export async function checkRunCompletion(db: Db, runId: string): Promise<void> {
  const rows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('pending', 'queued', 'running'))::int AS active,
      count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM run_steps WHERE run_id = ${runId}
  `);
  const agg = rows[0] as { active: number; failed: number };
  if (agg.active > 0) return;
  await db
    .update(workflowRuns)
    .set({ status: agg.failed > 0 ? "failed" : "succeeded", finishedAt: new Date() })
    .where(and(eq(workflowRuns.id, runId), inArray(workflowRuns.status, ["queued", "running"])));
}

// ---------------------------------------------------------------------------
// Per-step timeout (design 03 §7): the work is CANCELED via AbortSignal, not
// abandoned. Timeout classifies as retryable.
// ---------------------------------------------------------------------------

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new StepError(`Step timed out after ${ms}ms`, { retryable: true }));
    }, ms);
  });
  try {
    return await Promise.race([fn(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
