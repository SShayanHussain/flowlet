import type { GraphNode } from "./db/schema";

/**
 * Queue topology — single source of truth for api/ (enqueue) and worker/ (consume).
 *
 * Two queues by design (see DECISIONS.md, design 03 §3):
 *  - RUNS:     fast steps — trigger / transform / branch / fast http.
 *  - AI_STEPS: slow steps — ai, declared-slow http, output sends — isolated so one
 *              slow call cannot starve the fast pool.
 *
 * Job model (approved decision A): ONE JOB PER NODE. The run itself is a state
 * machine in Postgres; BullMQ only schedules step executions.
 */
export const QUEUE_PREFIX = process.env.QUEUE_PREFIX ?? "flowlet";

export const QUEUES = {
  RUNS: "runs",
  AI_STEPS: "ai-steps",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Payload of a step job. One BullMQ job per (run, node). */
export interface StepJobData {
  runId: string;
  workspaceId: string;
  nodeId: string;
}

/**
 * Deterministic job id — BullMQ dedupes on it (belt to the SQL claim's suspenders).
 * BullMQ forbids ':' in custom ids; runId is a UUID (hex + '-'), so '.' is unambiguous.
 */
export function stepJobId(runId: string, nodeId: string): string {
  return `${runId}.${nodeId}`;
}

/** Route a node to its queue. Slow/AI steps must never occupy a fast-pool slot. */
export function queueNameForNode(node: Pick<GraphNode, "type" | "config">): QueueName {
  if (node.type === "ai" || node.type === "output") return QUEUES.AI_STEPS;
  if (node.type === "http" && node.config?.slow === true) return QUEUES.AI_STEPS;
  return QUEUES.RUNS;
}

export const DEFAULT_STEP_ATTEMPTS = 3;

/** BullMQ job options for a step: bounded exponential retries + dedupe id. */
export function stepJobOptions(runId: string, nodeId: string, attempts = DEFAULT_STEP_ATTEMPTS) {
  return {
    jobId: stepJobId(runId, nodeId),
    attempts,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  };
}

/**
 * Structural queue interface so the engine (and its tests) don't hard-depend on
 * bullmq — a real `Queue` satisfies it; tests pass a recording fake.
 */
export interface StepQueue {
  add(name: string, data: StepJobData, opts?: Record<string, unknown>): Promise<unknown>;
}

export interface EngineQueues {
  runs: StepQueue;
  aiSteps: StepQueue;
}

export function queueForNode(queues: EngineQueues, node: Pick<GraphNode, "type" | "config">): StepQueue {
  return queueNameForNode(node) === QUEUES.AI_STEPS ? queues.aiSteps : queues.runs;
}
