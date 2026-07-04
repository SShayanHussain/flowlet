import { Redis } from 'ioredis';
import { env } from './env';

// Initialize Redis client using the provided connection string.
// We only initialize this on the server side.
let redis: Redis | null = null;
if (typeof window === 'undefined') {
  redis = new Redis(env.REDIS_URL || 'redis://localhost:6379');
}

/**
 * A simple token bucket rate limiter using Redis.
 * @param key The unique key for the rate limit (e.g., 'rate_limit:tenant_id:ip')
 * @param limit The maximum number of requests allowed in the window
 * @param window_seconds The time window in seconds
 * @returns True if allowed, false if rate limited
 */
export async function checkRateLimit(key: string, limit: number, window_seconds: number): Promise<boolean> {
  if (!redis) return true; // Skip if no redis (e.g. build time)

  const currentCount = await redis.incr(key);
  
  if (currentCount === 1) {
    // First request in the window, set expiry
    await redis.expire(key, window_seconds);
  }

  if (currentCount > limit) {
    return false;
  }

  return true;
}
