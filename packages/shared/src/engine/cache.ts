import { createHash } from "node:crypto";

/**
 * Cache abstraction (design 03 §caching; ROADMAP Phase 4). The engine defines
 * the interface; worker/ injects a Redis-backed implementation. Absent → caching
 * is simply off (never a correctness dependency).
 *
 * PLAYBOOK: a cache result must be DISTINGUISHABLE from a fresh one (StepResult
 * carries `cached: true`) and invalidation is built into the KEY — any change to
 * the model / prompt / schema / request produces a different key, so a config
 * change can never serve a stale value. TTL bounds staleness for repeated inputs.
 */
export interface EngineCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

function sha256(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * AI-output cache key — "semantic" in the input-repeat sense (PRD): identical
 * rendered prompt + system + schema + model → same key. Tenant-scoped so one
 * workspace's cache never serves another's.
 */
export function aiCacheKey(
  prefix: string,
  workspaceId: string,
  parts: { model: string; system?: string; prompt: string; schema: unknown }
): string {
  return `${prefix}:aicache:${workspaceId}:${sha256([parts.model, parts.system ?? "", parts.prompt, parts.schema])}`;
}

/** Connector-response cache key — for idempotent (GET) HTTP calls only. */
export function httpCacheKey(
  prefix: string,
  workspaceId: string,
  parts: { url: string; headers: Record<string, string>; connectionId?: string }
): string {
  return `${prefix}:httpcache:${workspaceId}:${sha256([parts.url, parts.headers, parts.connectionId ?? ""])}`;
}
