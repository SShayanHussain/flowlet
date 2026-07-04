import { Worker } from "bullmq";
import IORedis from "ioredis";
import { QUEUES, QUEUE_PREFIX } from "@flowlet/shared";
import { env } from "./env";
import { processRun } from "./processor";

// BullMQ requires maxRetriesPerRequest: null on the blocking connection.
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// Fast queue: run orchestration + non-AI steps.
const runsWorker = new Worker(QUEUES.RUNS, (job) => processRun(job.data), {
  connection,
  prefix: QUEUE_PREFIX,
  concurrency: env.WORKER_CONCURRENCY,
});

// Isolated queue: slow LLM / slow-HTTP steps, so one slow call cannot starve the
// fast pool (DECISIONS.md: separate queue + concurrency for AI/slow steps).
const aiWorker = new Worker(QUEUES.AI_STEPS, (job) => processRun(job.data), {
  connection,
  prefix: QUEUE_PREFIX,
  concurrency: env.AI_QUEUE_CONCURRENCY,
});

for (const [name, w] of [
  [QUEUES.RUNS, runsWorker],
  [QUEUES.AI_STEPS, aiWorker],
] as const) {
  w.on("ready", () => console.log(`[worker] ${name} ready`));
  w.on("failed", (job, err) => console.error(`[worker] ${name} job ${job?.id} failed:`, err));
}

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all([runsWorker.close(), aiWorker.close()]);
  await connection.quit();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] Flowlet worker started");
