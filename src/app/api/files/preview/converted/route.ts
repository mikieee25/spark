import path from "node:path";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/features/access/access-policy";
import { anonymousReadRateLimiter, rateLimitKey } from "@/lib/http/request-rate-limits";
import { createDocumentConverter } from "@/features/discovery/document-converter";
import { addRecentItem } from "@/features/discovery/discovery-repository";
import { createPreviewService } from "@/features/discovery/preview-service";
import { getDatabase } from "@/lib/db/runtime";
import { recordActivity } from "@/features/activity/activity-repository";
import { getFileStorage } from "@/features/files/file-runtime";
import { normalizeLogicalPath } from "@/features/files/path-policy";
import { loadConfig } from "@/lib/config/load-config";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const clientErrors = new Set(["INVALID_PATH", "NOT_FOUND", "NOT_A_FILE", "UNSUPPORTED_PREVIEW", "PREVIEW_CONVERTER_DISABLED", "PREVIEW_CONVERTER_UNAVAILABLE", "PREVIEW_CONVERTER_INVALID_RESPONSE", "PREVIEW_TOO_LARGE"]);

function errorResponse(error: unknown): Response {
  const raw = error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "NOT_FOUND" : error instanceof Error ? error.message : "PREVIEW_ERROR";
  const status = raw === "NOT_FOUND" ? 404 : raw === "PREVIEW_TOO_LARGE" ? 413 : clientErrors.has(raw) ? 400 : 500;
  return NextResponse.json({ error: clientErrors.has(raw) || status !== 500 ? raw : "PREVIEW_ERROR" }, { status, headers: noStore });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const access = await authorizeCapability(request, "preview");
    if (access.actorType === "anonymous") {
      const rate = anonymousReadRateLimiter.check(rateLimitKey(request));
      if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...noStore, "Retry-After": String(rate.retryAfterSeconds) } });
    }
    const rawPath = new URL(request.url).searchParams.get("path");
    if (!rawPath) return NextResponse.json({ error: "INVALID_PATH" }, { status: 400, headers: noStore });
    const config = loadConfig();
    const service = createPreviewService(getFileStorage(), { converter: config.previewConverterUrl ? createDocumentConverter(config.previewConverterUrl) : undefined, dataDirectory: config.dataDirectory });
    const logicalPath = normalizeLogicalPath(rawPath);
    const result = await service.convert(logicalPath);
    if (access.user) addRecentItem(getDatabase(), access.user.id, logicalPath);
    else recordActivity(getDatabase(), { actorType: "anonymous", action: "file_preview", paths: [logicalPath], outcome: "success" });
    const headers = new Headers(noStore);
    headers.set("Content-Type", result.mimeType);
    headers.set("Content-Length", String(result.body?.byteLength ?? result.totalBytes));
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`${path.posix.basename(logicalPath)}.pdf`)}`);
    return new Response(result.body ? (new Uint8Array(result.body) as unknown as BodyInit) : null, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
