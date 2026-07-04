import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";
import type { EngineQueues } from "../queues";
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
  /** Override node executors (tests inject failures; Phase 2 swaps in real http/ai). */
  executors?: Partial<ExecutorRegistry>;
  /** Per-step timeout (STEP_TIMEOUT_MS). Default 30s. */
  stepTimeoutMs?: number;
  /** BullMQ attempts per step job. Default DEFAULT_STEP_ATTEMPTS. */
  maxAttempts?: number;
}
