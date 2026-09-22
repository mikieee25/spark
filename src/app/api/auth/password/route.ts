import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { changePassword } from "@/features/auth/password-service";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ currentPassword: z.string().max(128), newPassword: z.string().min(12).max(128) });

export async function POST(request: Request): Promise<Response> {
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  try { await changePassword(getDatabase(), user.id, parsed.data.currentPassword, parsed.data.newPassword); return NextResponse.json({ ok: true }, { headers }); }
  catch (error) { const code = error instanceof Error ? error.message : "PASSWORD_CHANGE_FAILED"; return NextResponse.json({ error: code === "INVALID_CREDENTIALS" ? code : "INVALID_PASSWORD" }, { status: code === "INVALID_CREDENTIALS" ? 401 : 400, headers }); }
}
