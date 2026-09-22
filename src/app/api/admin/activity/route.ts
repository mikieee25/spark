import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/request-auth";
import { queryActivity } from "@/features/activity/activity-query";
import { getDatabase } from "@/lib/db/runtime";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request): Promise<Response> { const user = await getCurrentUser(); if (!user || user.role !== "admin") return NextResponse.json({ error: "ADMIN_REQUIRED" }, { status: 403, headers }); const p = new URL(request.url).searchParams; try { return NextResponse.json(queryActivity(getDatabase(), { limit: Number(p.get("limit") ?? 50), cursor: p.get("cursor") ?? undefined, action: p.get("action") ?? undefined, outcome: (p.get("outcome") as "success" | "failure" | null) ?? undefined, actorUserId: p.get("actorUserId") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, path: p.get("path") ?? undefined }), { headers }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ACTIVITY_QUERY_FAILED" }, { status: 400, headers }); } }
