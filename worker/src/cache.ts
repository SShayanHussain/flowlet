import type { Redis } from "ioredis";
import type { EngineCache } from "@flowlet/shared";

/**
 * Redis-backed engine cache (Phase 4): AI-output "semantic" cache + connector-
 * response cache. Keys are opaque and TTL'd by the caller; this is a thin
 * get/set-with-expiry over Redis.
 */
export function createRedisCache(redis: Redis): EngineCache {
  return {
    get: (key) => redis.get(key),
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, "EX", Math.max(1, Math.floor(ttlSeconds)));
    },
  };
}
