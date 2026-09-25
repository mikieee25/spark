import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { loadConfig } from "@/lib/config/load-config";
import { getDatabase } from "@/lib/db/runtime";
import { recordActivity } from "@/features/activity/activity-repository";
import { mintTerminalToken } from "@/features/terminal/token-repository";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({
  ttlSeconds: z.number().int().min(1).max(900).default(60),
});

export async function POST(request: Request): Promise<Response> {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "INVALID_ORIGIN" },
      { status: 403, headers }
    );
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  if (user.mustChangePassword)
    return NextResponse.json(
      { error: "PASSWORD_CHANGE_REQUIRED" },
      { status: 403, headers }
    );
  if (!loadConfig().terminalEnabled)
    return NextResponse.json(
      { error: "TERMINAL_DISABLED" },
      { status: 409, headers }
    );
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body uses default TTL */
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  const database = getDatabase();
  const now = new Date();
  const token = mintTerminalToken(
    database,
    user.id,
    now,
    parsed.data.ttlSeconds * 1_000
  );
  recordActivity(database, {
    actorUserId: user.id,
    actorType: "user",
    action: "terminal_token_issued",
    paths: [],
    outcome: "success",
    occurredAt: now,
    metadata: { expiresInSeconds: parsed.data.ttlSeconds },
  });
  return NextResponse.json(
    { token, expiresInSeconds: parsed.data.ttlSeconds },
    { status: 201, headers }
  );
}
