import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/features/access/access-policy";
import { createPreviewService } from "@/features/discovery/preview-service";
import { getFileStorage } from "@/features/files/file-runtime";
import { normalizeLogicalPath } from "@/features/files/path-policy";
import { addRecentItem } from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";
import { recordActivity } from "@/features/activity/activity-repository";
import {
  anonymousReadRateLimiter,
  rateLimitKey,
} from "@/lib/http/request-rate-limits";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const clientErrors = new Set([
  "INVALID_PATH",
  "NOT_FOUND",
  "NOT_A_FILE",
  "UNSUPPORTED_PREVIEW",
  "INVALID_RANGE",
  "RANGE_NOT_SATISFIABLE",
  "RANGE_TOO_LARGE",
  "ARCHIVE_UNSAFE_ENTRY",
  "INVALID_ARCHIVE",
  "UNSUPPORTED_ARCHIVE",
  "INVALID_DOCUMENT_PREVIEW",
  "INVALID_SPREADSHEET_PREVIEW",
]);

function errorResponse(error: unknown): Response {
  const rawCode =
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "ENOENT"
      : error instanceof Error
        ? error.message
        : "PREVIEW_ERROR";
  const code = rawCode === "ENOENT" ? "NOT_FOUND" : rawCode;
  const status =
    code === "PREVIEW_TOO_LARGE" || code === "ARCHIVE_TOO_LARGE"
      ? 413
      : code === "RANGE_NOT_SATISFIABLE"
        ? 416
        : code === "NOT_FOUND"
          ? 404
          : clientErrors.has(code)
            ? 400
            : 500;
  return NextResponse.json(
    {
      error: clientErrors.has(code) || status !== 500 ? code : "PREVIEW_ERROR",
    },
    { status, headers: noStore }
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    let access;
    try {
      access = await authorizeCapability(request, "preview");
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
      if (code === "UNAUTHENTICATED" || code === "ANONYMOUS_ACCESS_EXPIRED")
        return NextResponse.json(
          { error: code },
          { status: 401, headers: noStore }
        );
      throw error;
    }
    if (access.actorType === "anonymous") {
      const rate = anonymousReadRateLimiter.check(rateLimitKey(request));
      if (!rate.allowed)
        return NextResponse.json(
          { error: "RATE_LIMITED" },
          {
            status: 429,
            headers: {
              ...noStore,
              "Retry-After": String(rate.retryAfterSeconds),
            },
          }
        );
    }
    const url = new URL(request.url);
    const logicalPath = url.searchParams.get("path");
    if (!logicalPath)
      return NextResponse.json(
        { error: "INVALID_PATH" },
        { status: 400, headers: noStore }
      );
    const normalizedPath = normalizeLogicalPath(logicalPath);
    const result = await createPreviewService(getFileStorage()).preview(
      normalizedPath,
      request.headers.get("range") ?? undefined
    );
    if (access.user)
      addRecentItem(getDatabase(), access.user.id, normalizedPath);
    else
      recordActivity(getDatabase(), {
        actorType: "anonymous",
        action: "file_preview",
        paths: [normalizedPath],
        outcome: "success",
      });
    if (result.kind !== "media")
      return NextResponse.json(result, { headers: noStore });
    const headers = new Headers(noStore);
    headers.set("Content-Type", result.mimeType);
    headers.set(
      "Content-Length",
      String(
        result.partial ? (result.body?.byteLength ?? 0) : result.totalBytes
      )
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(path.posix.basename(result.logicalPath))}`
    );
    if (result.partial)
      headers.set(
        "Content-Range",
        `bytes ${result.start}-${result.end}/${result.totalBytes}`
      );
    const body =
      result.body ?? (result.stream ? Readable.toWeb(result.stream) : null);
    if (!body) throw new Error("PREVIEW_ERROR");
    return new Response(body as unknown as BodyInit, {
      status: result.partial ? 206 : 200,
      headers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
