import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  createFixedWindowLimiter,
  createWorkspaceLease,
  handleCronFire,
  QUEUES,
  type CronFireData,
  type EngineDeps,
  type EngineQueues,
  type LeaseRedis,
  type RateLimitRedis,
  type StepQueue,
} from "@flowlet/shared";
import { createRedisCache } from "./cache";
import { db } from "./db";
import { env } from "./env";
import { createAnthropicLlmClient } from "./llm";
import { makeStepProcessor } from "./processor";

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// The worker also PRODUCES: completing a step enqueues its successors.
const runsQueue = new Queue(QUEUES.RUNS, { connection, prefix: env.QUEUE_PREFIX });
const aiStepsQueue = new Queue(QUEUES.AI_STEPS, { connection, prefix: env.QUEUE_PREFIX });
const queues: EngineQueues = {
  runs: runsQueue as unknown as StepQueue,
  aiSteps: aiStepsQueue as unknown as StepQueue,
};

// LLM client — only when configured. Absent → AI steps fail loud, never fake.
const llm = env.LLM_API_KEY
  ? createAnthropicLlmClient({
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      maxTokens: env.LLM_MAX_TOKENS,
      thinking: env.LLM_THINKING,
      inputCostPerMTok: env.LLM_INPUT_COST_PER_MTOK,
      outputCostPerMTok: env.LLM_OUTPUT_COST_PER_MTOK,
    })
  : undefined;
if (!llm) {
  console.warn("[worker] LLM_API_KEY not set — AI steps will fail with a config error");
}

// Per-workspace LLM budget limit (distinct from nginx's per-IP webhook limit).
const aiRateLimiter = createFixedWindowLimiter(connection as unknown as RateLimitRedis, {
  limit: env.LLM_RATE_LIMIT_PER_USER,
  windowSeconds: 60,
  prefix: env.QUEUE_PREFIX,
});

// Fairness: per-workspace concurrency lease. TTL comfortably exceeds a step's
// worst case so only a crashed worker's lease ever expires.
const lease = createWorkspaceLease(connection as unknown as LeaseRedis, {
  cap: env.PER_USER_CONCURRENCY,
  ttlMs: env.STEP_TIMEOUT_MS * 2 + 30_000,
  prefix: env.QUEUE_PREFIX,
});

// Redis-backed cache: AI-output "semantic" cache + connector-response cache.
const cache = env.AI_CACHE_TTL_SEC > 0 ? createRedisCache(connection) : undefined;

const deps: EngineDeps = {
  db,
  queues,
  stepTimeoutMs: env.STEP_TIMEOUT_MS,
  llm,
  aiRateLimiter,
  cache,
  modelId: env.LLM_MODEL,
  aiCacheTtlSec: env.AI_CACHE_TTL_SEC,
  cachePrefix: env.QUEUE_PREFIX,
};
const processor = makeStepProcessor({ deps, lease });

// Two step pools (design 03 §3): fast steps, and isolated AI/slow steps.
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

// Cron firings → runs. The BullMQ scheduler job id is deterministic per tick and
// becomes the trigger idempotency key — a double fire still yields one run.
const cronWorker = new Worker<CronFireData>(
  QUEUES.CRON,
  async (job) => {
    const outcome = await handleCronFire(deps, job.data, job.id ?? `${job.data.workflowId}:${job.timestamp}`);
    if (outcome.outcome === "skipped") {
      console.warn(`[worker] cron fire for ${job.data.workflowId} skipped: ${outcome.reason}`);
    }
    return outcome;
  },
  { connection, prefix: env.QUEUE_PREFIX, concurrency: 2 }
);

for (const [name, w] of [
  [QUEUES.RUNS, runsWorker],
  [QUEUES.AI_STEPS, aiWorker],
  [QUEUES.CRON, cronWorker],
] as const) {
  w.on("ready", () => console.log(`[worker] ${name} ready`));
  w.on("failed", (job, err) => {
    console.error(`[worker] ${name} job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });
}

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all([runsWorker.close(), aiWorker.close(), cronWorker.close()]);
  await Promise.all([runsQueue.close(), aiStepsQueue.close()]);
  await connection.quit();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] Flowlet worker started");
