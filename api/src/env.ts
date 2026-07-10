import { z } from "zod";

/**
 * API environment validation (PLAYBOOK: fail fast with a named list of missing vars).
 * Only imported by the entrypoint (index.ts) so unit tests can build the server
 * without a full production env.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  // Shared with web/ — api verifies the tokens web issues.
  JWT_ACCESS_SECRET: z.string().min(32, "Secret must be at least 32 chars"),
  QUEUE_PREFIX: z.string().default("flowlet"),
  WORKER_URL: z.string().url().optional(),
  // Connection-credential encryption (AES-256-GCM). api encrypts on create;
  // worker decrypts at step execution. Same key both sides.
  CREDENTIALS_ENC_KEY: z.string().min(1, "CREDENTIALS_ENC_KEY is required"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid API environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
})();
