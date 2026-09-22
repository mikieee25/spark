import { createRateLimiter } from "./rate-limit";
export const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 60 });
export const anonymousReadRateLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
export function rateLimitKey(request: Request): string { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local"; }
