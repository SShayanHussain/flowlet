/**
 * Per-workspace concurrency lease (design 03 §6, approved decision B).
 *
 * Bounds each tenant to `cap` concurrently-executing steps so one workspace's
 * burst cannot starve others. Crash-safe: each lease entry carries an expiry
 * (ZSET score); stale entries from crashed workers are reaped on every acquire,
 * so capacity can never leak permanently.
 */

/** Minimal structural Redis surface (an ioredis instance satisfies it via cast). */
export interface LeaseRedis {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  zrem(key: string, member: string): Promise<unknown>;
}

const ACQUIRE_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local cap = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZCARD', key) < cap then
  redis.call('ZADD', key, now + ttl, member)
  redis.call('PEXPIRE', key, ttl * 2)
  return 1
end
return 0
`;

export interface WorkspaceLease {
  /** true → slot granted; false → tenant at cap, caller should delay the job. */
  acquire(workspaceId: string, member: string): Promise<boolean>;
  release(workspaceId: string, member: string): Promise<void>;
}

export function createWorkspaceLease(
  redis: LeaseRedis,
  opts: { cap: number; ttlMs: number; prefix?: string }
): WorkspaceLease {
  const prefix = opts.prefix ?? "flowlet";
  const keyOf = (ws: string) => `${prefix}:lease:${ws}`;

  return {
    async acquire(workspaceId, member) {
      const granted = await redis.eval(
        ACQUIRE_LUA,
        1,
        keyOf(workspaceId),
        Date.now(),
        opts.ttlMs,
        opts.cap,
        member
      );
      return granted === 1;
    },
    async release(workspaceId, member) {
      await redis.zrem(keyOf(workspaceId), member);
    },
  };
}
