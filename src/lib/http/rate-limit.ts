export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  now?: () => number;
}) {
  const buckets = new Map<string, { startedAt: number; count: number }>();
  const now = options.now ?? Date.now;
  return {
    check(key: string): RateLimitResult {
      const current = now();
      const previous = buckets.get(key);
      const bucket =
        !previous || current - previous.startedAt >= options.windowMs
          ? { startedAt: current, count: 0 }
          : previous;
      bucket.count += 1;
      buckets.set(key, bucket);
      const allowed = bucket.count <= options.max;
      return {
        allowed,
        remaining: Math.max(0, options.max - bucket.count),
        retryAfterSeconds: allowed
          ? 0
          : Math.max(
              1,
              Math.ceil((bucket.startedAt + options.windowMs - current) / 1_000)
            ),
      };
    },
  };
}
