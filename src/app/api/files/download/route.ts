import path from "node:path";
import { NextResponse } from "next/server";
import { authorizeCapability } from "@/features/access/access-policy";
import { getFileStorage } from "@/features/files/file-runtime";
import { createFolderArchive } from "@/features/files/folder-download";
import { addRecentItem } from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";
import { recordActivity } from "@/features/activity/activity-repository";
import {
  anonymousReadRateLimiter,
  rateLimitKey,
} from "@/lib/http/request-rate-limits";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request): Promise<Response> {
  let access: Awaited<ReturnType<typeof authorizeCapability>>;
  try {
    access = await authorizeCapability(request, "download");
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return NextResponse.json(
      { error: code },
      { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }
    );
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
  const logicalPath = new URL(request.url).searchParams.get("path") ?? "";
  try {
    const storage = getFileStorage();
    const item = await storage.stat(logicalPath);
    const database = getDatabase();
    if (item.kind === "folder") {
      const archive = await createFolderArchive(storage, logicalPath);
      if (access.user) addRecentItem(database, access.user.id, logicalPath);
      recordActivity(database, {
        actorUserId: access.user?.id,
        actorType: access.user ? "user" : "anonymous",
        action: "file_download",
        paths: [logicalPath],
        outcome: "success",
        metadata: { itemType: "folder", archive: archive.filename },
      });
      return new Response(archive.body as unknown as BodyInit, {
        headers: {
          ...noStore,
          "Content-Type": "application/zip",
          "Content-Length": String(archive.body.byteLength),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
        },
      });
    }
    const body = await storage.readFile(logicalPath);
    if (access.user) addRecentItem(database, access.user.id, logicalPath);
    recordActivity(database, {
      actorUserId: access.user?.id,
      actorType: access.user ? "user" : "anonymous",
      action: "file_download",
      paths: [logicalPath],
      outcome: "success",
      metadata: { itemType: "file" },
    });
    return new Response(body as unknown as BodyInit, {
      headers: {
        ...noStore,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.posix.basename(logicalPath))}`,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FILESYSTEM_ERROR";
    return NextResponse.json(
      { error: code },
      {
        status:
          code === "NOT_FOUND" ? 404 : code === "ARCHIVE_TOO_LARGE" ? 413 : 400,
        headers: noStore,
      }
    );
  }
}
