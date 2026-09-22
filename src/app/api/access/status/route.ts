import { NextResponse } from "next/server";
import { getAccessState } from "@/features/access/access-policy";
import { getDatabase } from "@/lib/db/runtime";
export const runtime = "nodejs";
export async function GET(): Promise<Response> { return NextResponse.json(getAccessState(getDatabase()), { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }); }
