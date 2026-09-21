import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { revokeSession } from "@/features/auth/session-repository";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (token) revokeSession(getDatabase(), token, new Date());
  jar.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true }, { headers });
}
