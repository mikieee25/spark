import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { searchFiles } from "@/features/discovery/search-repository";
import { getDatabase } from "@/lib/db/runtime";
import { normalizeLogicalPath } from "@/features/files/path-policy";
import { recordActivity } from "@/features/activity/activity-repository";
import { anonymousReadRateLimiter, rateLimitKey } from "@/lib/http/request-rate-limits";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const schema = z.object({
  q: z.string().trim().min(1).max(256),
  path: z.string().trim().max(4_096).refine((value) => { try { normalizeLogicalPath(value); return true; } catch { return false; } }).optional(),
  kind: z.enum(["file", "folder"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(512).optional(),
});

export async function GET(request: Request): Promise<Response> {
  let access; try { access = await authorizeCapability(request, "search"); } catch (error) { const code = error instanceof Error ? error.message : "UNAUTHENTICATED"; return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }); }
  if (access.actorType === "anonymous") { const rate = anonymousReadRateLimiter.check(rateLimitKey(request)); if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) } }); }
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  try {
    const result = searchFiles(getDatabase(), { query: parsed.data.q, pathPrefix: parsed.data.path, kind: parsed.data.kind, limit: parsed.data.limit, cursor: parsed.data.cursor });
    if (access.actorType === "anonymous") recordActivity(getDatabase(), { actorType: "anonymous", action: "search", paths: parsed.data.path ? [parsed.data.path] : [], outcome: "success" });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error && ["INVALID_CURSOR", "INVALID_QUERY", "INVALID_PATH"].includes(error.message) ? error.message : "SEARCH_ERROR";
    return NextResponse.json({ error: code }, { status: code === "SEARCH_ERROR" ? 500 : 400, headers: noStore });
  }
}
