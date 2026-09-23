import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { getFileService } from "@/features/files/file-runtime";
import { addRecentItem } from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";
import { recordActivity } from "@/features/activity/activity-repository";
import { anonymousReadRateLimiter, rateLimitKey } from "@/lib/http/request-rate-limits";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const pathSchema = z.string().max(4_096);
const conflictSchema = z.enum(["fail", "replace", "rename", "skip"]).optional();

function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message : "FILESYSTEM_ERROR";
  const status = code === "NOT_FOUND" || code === "RECYCLE_ENTRY_NOT_ACTIVE" ? 404
    : code === "CONFLICT" || code === "CONFLICT_LIMIT" ? 409
      : code === "ADMIN_REQUIRED" ? 403 : 400;
  return NextResponse.json({ error: /^[A-Z0-9_]+$/.test(code) ? code : "FILESYSTEM_ERROR" }, { status, headers: noStore });
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  let access: Awaited<ReturnType<typeof authorizeCapability>>;
  try { access = await authorizeCapability(request, "browse"); } catch (error) { const code = error instanceof Error ? error.message : "UNAUTHENTICATED"; return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }); }
  const authMs = performance.now() - startedAt;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (access.actorType === "anonymous") { const rate = anonymousReadRateLimiter.check(rateLimitKey(request)); if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) } }); }
  const parsed = pathSchema.safeParse(path);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  try {
    const listStartedAt = performance.now();
    let listTiming: { pathValidationMs: number; directoryStatMs: number; cache: "hit" | "miss" | "bypass"; readdirMs: number; metadataMs: number; sortMs: number; entryCount: number } | undefined;
    const entries = await getFileService().list(parsed.data, { onTiming: (timing) => { listTiming = timing; } });
    const listMs = performance.now() - listStartedAt;
    const recentStartedAt = performance.now();
    if (access.user) addRecentItem(getDatabase(), access.user.id, parsed.data);
    else recordActivity(getDatabase(), { actorType: "anonymous", action: "browse", paths: [parsed.data], outcome: "success" });
    const recentMs = performance.now() - recentStartedAt;
    const totalMs = performance.now() - startedAt;
    const phaseTiming = listTiming ? `path;dur=${listTiming.pathValidationMs.toFixed(1)}, directory;dur=${listTiming.directoryStatMs.toFixed(1)}, readdir;dur=${listTiming.readdirMs.toFixed(1)}, metadata;dur=${listTiming.metadataMs.toFixed(1)}, sort;dur=${listTiming.sortMs.toFixed(1)}, ` : "";
    const serverTiming = `auth;dur=${authMs.toFixed(1)}, ${phaseTiming}list;dur=${listMs.toFixed(1)}, recent;dur=${recentMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`;
    return NextResponse.json({ path: parsed.data, entries }, { headers: { ...noStore, "Server-Timing": serverTiming } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let access; try { access = await authorizeCapability(request, "mutate"); } catch (error) { const code = error instanceof Error ? error.message : "UNAUTHENTICATED"; return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }); } const user = access.user; if (!user) return NextResponse.json({ error: "ANONYMOUS_READ_ONLY" }, { status: 403, headers: noStore });
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore }); }
  const parsed = z.object({ source: pathSchema, destination: pathSchema, conflict: conflictSchema }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await getFileService().moveFile(user, parsed.data), { headers: noStore });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request): Promise<Response> {
  let access; try { access = await authorizeCapability(request, "mutate"); } catch (error) { const code = error instanceof Error ? error.message : "UNAUTHENTICATED"; return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }); } const user = access.user; if (!user) return NextResponse.json({ error: "ANONYMOUS_READ_ONLY" }, { status: 403, headers: noStore });
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  const path = new URL(request.url).searchParams.get("path");
  const parsed = pathSchema.safeParse(path);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await getFileService().deleteToRecycle(user, { path: parsed.data }), { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
