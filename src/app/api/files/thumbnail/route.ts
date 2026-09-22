import { NextResponse } from "next/server";
import { authorizeCapability } from "@/features/access/access-policy";
import { createThumbnailService } from "@/features/discovery/thumbnail-service";
import { getFileStorage } from "@/features/files/file-runtime";
import { normalizeLogicalPath } from "@/features/files/path-policy";
import { loadConfig } from "@/lib/config/load-config";
import { anonymousReadRateLimiter, rateLimitKey } from "@/lib/http/request-rate-limits";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request): Promise<Response> {
  try {
    let access;
    try { access = await authorizeCapability(request, "preview"); }
    catch (error) { const code = error instanceof Error ? error.message : "UNAUTHENTICATED"; if (code === "UNAUTHENTICATED" || code === "ANONYMOUS_ACCESS_EXPIRED") return NextResponse.json({ error: code }, { status: 401, headers: noStore }); throw error; }
    if (access.actorType === "anonymous") { const rate = anonymousReadRateLimiter.check(rateLimitKey(request)); if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) } }); }
    const logicalPath = new URL(request.url).searchParams.get("path");
    if (!logicalPath) return NextResponse.json({ error: "INVALID_PATH" }, { status: 400, headers: noStore });
    const normalizedPath = normalizeLogicalPath(logicalPath);
    const result = await createThumbnailService({ storage: getFileStorage(), dataDirectory: loadConfig().dataDirectory }).getThumbnail(normalizedPath);
    return new Response(result.buffer as unknown as BodyInit, { headers: { ...noStore, "Content-Type": result.mimeType, "Content-Length": String(result.buffer.byteLength) } });
  } catch (error) {
    const rawCode = error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "ENOENT" : error instanceof Error ? error.message : "THUMBNAIL_ERROR";
    const code = rawCode === "ENOENT" ? "NOT_FOUND" : rawCode;
    const status = code === "THUMBNAIL_TOO_LARGE" ? 413 : code === "NOT_FOUND" ? 404 : ["INVALID_PATH", "NOT_A_FILE", "UNSUPPORTED_THUMBNAIL"].includes(code) ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "THUMBNAIL_ERROR" : code }, { status, headers: noStore });
  }
}
