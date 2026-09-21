import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/features/auth/auth-service";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/features/auth/session-cookie";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().max(128),
});

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request): Promise<Response> {
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  }

  const result = await authenticate(
    getDatabase(), parsed.data.username, parsed.data.password, new Date(),
  );
  if (!result.ok) {
    const status = result.reason === "disabled" ? 403 : 401;
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status, headers: noStore });
  }

  (await cookies()).set(
    SESSION_COOKIE_NAME,
    result.token,
    sessionCookieOptions(result.expiresAt),
  );
  return NextResponse.json({ user: result.user }, { headers: noStore });
}
