import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import {
  getRetentionDays,
  setSetting,
} from "@/features/admin/settings-repository";
import { getDatabase } from "@/lib/db/runtime";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  return NextResponse.json(
    { retentionDays: getRetentionDays(getDatabase()) },
    { headers }
  );
}
export async function PATCH(request: Request): Promise<Response> {
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
    .object({ retentionDays: z.number().int().min(1).max(365) })
    .safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_SETTING" },
      { status: 400, headers }
    );
  setSetting(
    getDatabase(),
    "recycle_retention_days",
    parsed.data.retentionDays,
    user.id
  );
  return NextResponse.json(
    { retentionDays: parsed.data.retentionDays },
    { headers }
  );
}
