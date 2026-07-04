import { z } from "zod";

/** Worker environment. Concurrency knobs are the heart of the fairness story. */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  QUEUE_PREFIX: z.string().default("flowlet"),
  WORKER_CONCURRENCY: z.coerce.number().default(10), // global fast-queue concurrency
  AI_QUEUE_CONCURRENCY: z.coerce.number().default(5), // isolated AI/slow-step pool
  PER_USER_CONCURRENCY: z.coerce.number().default(3), // fairness cap (enforced in Phase 1)
  STEP_TIMEOUT_MS: z.coerce.number().default(30_000),
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
