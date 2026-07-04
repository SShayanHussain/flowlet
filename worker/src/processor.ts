import type { RunJobData } from "@flowlet/shared";

export interface RunResult {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed";
}

/**
 * Execute one workflow run. Isolated from BullMQ wiring so it is unit-testable
 * without Redis.
 *
 * Phase 1 fills this in:
 *   - load the run + its workflow.graph (DAG)
 *   - resolve nodes in topological order, feeding each output to successors
 *   - per-step retries (retryable vs terminal) + timeouts
 *   - idempotency: skip if this (workflow, trigger event) already ran
 *   - write a run_steps trace row per node
 * For now it only acknowledges the job so the queue topology can be exercised.
 */
export async function processRun(data: RunJobData): Promise<RunResult> {
  return { runId: data.runId, status: "queued" };
}
