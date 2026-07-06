import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";
import type { EngineQueues } from "../queues";
import type { EngineCache } from "./cache";
import type { AiRateLimiter, LlmClient } from "./llm";
import type { ExecutorRegistry } from "./nodes";

export type Db = PostgresJsDatabase<typeof schema>;
/** The transaction handle drizzle passes to `db.transaction(cb)` — shares the query API. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

/**
 * Everything the engine needs, injected — the engine itself opens no connections,
 * so api/, worker/, and tests wire their own db/queues.
 */
export interface EngineDeps {
  db: Db;
  queues: EngineQueues;
  /** Override node executors (tests inject failures/fakes). */
  executors?: Partial<ExecutorRegistry>;
  /** Per-step timeout (STEP_TIMEOUT_MS). Default 30s. */
  stepTimeoutMs?: number;
  /** BullMQ attempts per step job. Default DEFAULT_STEP_ATTEMPTS. */
  maxAttempts?: number;
  /**
   * LLM client for AI steps — wired by worker/ only. Absent → AI steps fail
   * terminally with a configuration error (fail loud; never fake an AI result).
   */
  llm?: LlmClient;
  /** Per-workspace LLM-boundary rate limiter (LLM_RATE_LIMIT_PER_USER). */
  aiRateLimiter?: AiRateLimiter;
  /** Cache backend for AI-output + connector-response caching (Phase 4). */
  cache?: EngineCache;
  /** Default TTL for AI-output cache entries (seconds). */
  aiCacheTtlSec?: number;
  /** LLM model id — part of the AI cache key so a model change busts the cache. */
  modelId?: string;
  /** Prefix for cache keys (defaults to "flowlet"). */
  cachePrefix?: string;
}
