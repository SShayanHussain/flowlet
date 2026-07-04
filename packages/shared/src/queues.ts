/**
 * Queue topology — single source of truth for api/ (enqueue) and worker/ (consume).
 *
 * Two queues by design (see DECISIONS.md, PRD §7):
 *  - RUNS:     fast workflow-run orchestration / non-AI steps.
 *  - AI_STEPS: slow LLM + slow-HTTP steps, isolated so one slow call cannot
 *              starve the fast pool.
 */
export const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? "flowlet";

export const QUEUES = {
  RUNS: "runs",
  AI_STEPS: "ai-steps",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Job payload enqueued by the API when a trigger fires. Runs are jobs, not requests. */
export interface RunJobData {
  runId: string;
  workflowId: string;
  workspaceId: string;
  /** Per-(workflow, trigger event) idempotency key — prevents double-execution. */
  idempotencyKey: string;
}
