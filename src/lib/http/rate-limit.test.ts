import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";
describe("rate limiter", () => {
  it("bounds a key and reports retry time", () => {
    let now = 0;
    const limiter = createRateLimiter({
      windowMs: 1_000,
      max: 2,
      now: () => now,
    });
    expect(limiter.check("ip")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("ip")).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    now = 1_001;
    expect(limiter.check("ip")).toMatchObject({ allowed: true, remaining: 1 });
  });
});
