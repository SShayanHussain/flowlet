import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  createWorkspaceLease,
  QUEUES,
  type EngineQueues,
  type LeaseRedis,
  type StepQueue,
} from "@flowlet/shared";
import { db } from "./db";
import { env } from "./env";
import { makeStepProcessor } from "./processor";

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// The worker also PRODUCES: completing a step enqueues its successors.
const runsQueue = new Queue(QUEUES.RUNS, { connection, prefix: env.QUEUE_PREFIX });
const aiStepsQueue = new Queue(QUEUES.AI_STEPS, { connection, prefix: env.QUEUE_PREFIX });
const queues: EngineQueues = {
  runs: runsQueue as unknown as StepQueue,
  aiSteps: aiStepsQueue as unknown as StepQueue,
};

// Fairness: per-workspace concurrency lease. TTL comfortably exceeds a step's
// worst case so only a crashed worker's lease ever expires.
const lease = createWorkspaceLease(connection as unknown as LeaseRedis, {
  cap: env.PER_USER_CONCURRENCY,
  ttlMs: env.STEP_TIMEOUT_MS * 2 + 30_000,
  prefix: env.QUEUE_PREFIX,
});

const processor = makeStepProcessor({
  deps: { db, queues, stepTimeoutMs: env.STEP_TIMEOUT_MS },
  lease,
});

// Two pools (design 03 §3): fast steps, and isolated AI/slow steps.
const runsWorker = new Worker(QUEUES.RUNS, processor, {
  connection,
  prefix: env.QUEUE_PREFIX,
  concurrency: env.WORKER_CONCURRENCY,
});
const aiWorker = new Worker(QUEUES.AI_STEPS, processor, {
  connection,
  prefix: env.QUEUE_PREFIX,
  concurrency: env.AI_QUEUE_CONCURRENCY,
});

for (const [name, w] of [
  [QUEUES.RUNS, runsWorker],
  [QUEUES.AI_STEPS, aiWorker],
] as const) {
  w.on("ready", () => console.log(`[worker] ${name} ready`));
  w.on("failed", (job, err) => {
    console.error(`[worker] ${name} step ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });
}

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all([runsWorker.close(), aiWorker.close()]);
  await Promise.all([runsQueue.close(), aiStepsQueue.close()]);
  await connection.quit();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] Flowlet worker started");
