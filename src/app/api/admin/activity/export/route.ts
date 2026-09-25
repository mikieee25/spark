import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/request-auth";
import { queryActivity } from "@/features/activity/activity-query";
import { activityCsv } from "@/features/activity/activity-export";
import { getDatabase } from "@/lib/db/runtime";
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=SPARK-activity.csv",
  };
  if (!user || user.role !== "admin")
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  const p = new URL(request.url).searchParams;
  const result = queryActivity(getDatabase(), {
    limit: Math.min(100, Number(p.get("limit") ?? 100)),
    action: p.get("action") ?? undefined,
    actorUserId: p.get("actorUserId") ?? undefined,
    outcome: (p.get("outcome") as "success" | "failure" | null) ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    path: p.get("path") ?? undefined,
  });
  return new Response(activityCsv(result.items), { headers });
}
