import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { listUserSessions } from "@/features/admin/admin-user-service";
import { getDatabase } from "@/lib/db/runtime";
import { revokeSessionByHash } from "@/features/auth/session-repository";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
async function admin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}
export async function GET(request: Request): Promise<Response> {
  const user = await admin();
  if (!user)
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  return NextResponse.json(
    { sessions: listUserSessions(getDatabase(), user, userId) },
    { headers }
  );
}
export async function DELETE(request: Request): Promise<Response> {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "INVALID_ORIGIN" },
      { status: 403, headers }
    );
  const user = await admin();
  if (!user)
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  }
  const parsed = z
    .object({ sessionId: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  revokeSessionByHash(getDatabase(), parsed.data.sessionId, new Date());
  return NextResponse.json({ ok: true }, { headers });
}
