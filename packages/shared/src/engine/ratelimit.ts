import type { AiRateLimiter } from "./llm";

/** Minimal structural Redis surface (an ioredis instance satisfies it via cast). */
export interface RateLimitRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/**
 * Fixed-window counter in Redis — the LLM-boundary rate limit (design 03 §7).
 * Keyed per workspace: one tenant cannot drain the shared LLM budget. This is a
 * DIFFERENT limit from nginx's per-IP webhook zone — two limits, two reasons.
 */
export function createFixedWindowLimiter(
  redis: RateLimitRedis,
  opts: { limit: number; windowSeconds: number; prefix?: string }
): AiRateLimiter {
  const prefix = opts.prefix ?? "flowlet";
  return {
    async take(workspaceId: string) {
      const window = Math.floor(Date.now() / (opts.windowSeconds * 1000));
      const key = `${prefix}:rl:llm:${workspaceId}:${window}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, opts.windowSeconds * 2);
      }
      return count <= opts.limit;
    },
  };
}
