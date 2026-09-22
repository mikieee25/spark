import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { resolveSession, revokeSession } from "@/features/auth/session-repository";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";
import { recordActivity } from "@/features/activity/activity-repository";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const now = new Date();
  if (token) {
    const database = getDatabase();
    const user = resolveSession(database, token, now);
    revokeSession(database, token, now);
    if (user) {
      recordActivity(database, {
        actorUserId: user.id,
        actorType: "user",
        action: "sign_out",
        paths: [],
        outcome: "success",
        occurredAt: now,
      });
    }
  }
  jar.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true }, { headers });
}
