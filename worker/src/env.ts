import { z } from "zod";

/** Worker environment. Concurrency knobs are the heart of the fairness story. */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  QUEUE_PREFIX: z.string().default("flowlet"),
  WORKER_CONCURRENCY: z.coerce.number().default(10), // global fast-queue concurrency
  AI_QUEUE_CONCURRENCY: z.coerce.number().default(5), // isolated AI/slow-step pool
  PER_USER_CONCURRENCY: z.coerce.number().default(3), // fairness cap
  STEP_TIMEOUT_MS: z.coerce.number().default(30_000),

  // AI step (LLM). No key → AI steps fail terminally with a config error —
  // never a fake result. Model is env-config so a retirement is a config change.
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-opus-4-8"),
  LLM_MAX_TOKENS: z.coerce.number().default(16_000),
  LLM_THINKING: z.enum(["adaptive", "off"]).default("adaptive"),
  LLM_RATE_LIMIT_PER_USER: z.coerce.number().default(60), // requests/min per workspace
  LLM_INPUT_COST_PER_MTOK: z.coerce.number().default(5),
  LLM_OUTPUT_COST_PER_MTOK: z.coerce.number().default(25),

  // Caching (Phase 4). AI-output cache default TTL; 0 disables AI caching.
  AI_CACHE_TTL_SEC: z.coerce.number().default(3600),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid worker environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
})();
