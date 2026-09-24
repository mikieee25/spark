import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { addRecentItem } from "@/features/discovery/discovery-repository";
import { getFileService, getFileStorage } from "@/features/files/file-runtime";
import { createSelectionArchive } from "@/features/files/folder-download";
import { normalizeLogicalPath } from "@/features/files/path-policy";
import { recordActivity } from "@/features/activity/activity-repository";
import { getDatabase } from "@/lib/db/runtime";
import { anonymousReadRateLimiter, rateLimitKey } from "@/lib/http/request-rate-limits";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const requestSchema = z.object({
  action: z.enum(["download", "recycle"]),
  paths: z.array(z.string().min(1).max(4_096)).min(1).max(1_000),
});

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "FILESYSTEM_ERROR";
}

function hasOverlappingPaths(paths: readonly string[]): boolean {
  const selected = new Set(paths);
  return selected.size !== paths.length || paths.some((path) => {
    let separator = path.lastIndexOf("/");
    while (separator >= 0) {
      if (selected.has(path.slice(0, separator))) return true;
      separator = path.lastIndexOf("/", separator - 1);
    }
    return false;
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });

  let paths: string[];
  try { paths = parsed.data.paths.map(normalizeLogicalPath); }
  catch { return NextResponse.json({ error: "INVALID_SELECTION" }, { status: 400, headers: noStore }); }
  if (paths.some((path) => !path) || hasOverlappingPaths(paths)) return NextResponse.json({ error: "INVALID_SELECTION" }, { status: 400, headers: noStore });

  const { action } = parsed.data;
  let access: Awaited<ReturnType<typeof authorizeCapability>>;
  try { access = await authorizeCapability(request, action === "download" ? "download" : "mutate"); }
  catch (error) {
    const code = errorCode(error);
    return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore });
  }
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  if (action === "recycle" && !access.user) return NextResponse.json({ error: "ANONYMOUS_READ_ONLY" }, { status: 403, headers: noStore });
  if (action === "download" && access.actorType === "anonymous") {
    const rate = anonymousReadRateLimiter.check(rateLimitKey(request));
    if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) } });
  }

  if (action === "download") {
    try {
      const archive = await createSelectionArchive(getFileStorage(), paths);
      const database = getDatabase();
      for (const path of paths) if (access.user) addRecentItem(database, access.user.id, path);
      recordActivity(database, { actorUserId: access.user?.id, actorType: access.user ? "user" : "anonymous", action: "file_download", paths, outcome: "success", metadata: { itemType: "batch", archive: archive.filename } });
      return new Response(archive.body as unknown as BodyInit, { headers: { ...noStore, "Content-Type": "application/zip", "Content-Length": String(archive.body.byteLength), "Content-Disposition": `attachment; filename="${archive.filename}"` } });
    } catch (error) {
      const code = errorCode(error);
      const status = code === "NOT_FOUND" ? 404 : code === "ARCHIVE_TOO_LARGE" ? 413 : 400;
      return NextResponse.json({ error: code }, { status, headers: noStore });
    }
  }

  const succeeded: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const service = getFileService();
  for (const path of paths) {
    try { await service.deleteToRecycle(access.user!, { path }); succeeded.push(path); }
    catch (error) { failed.push({ path, error: errorCode(error) }); }
  }
  return NextResponse.json({ succeeded, failed }, { headers: noStore });
}
