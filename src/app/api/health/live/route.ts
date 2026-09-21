import { NextResponse } from "next/server";
import { checkLiveness } from "@/features/system/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return NextResponse.json(checkLiveness(), {
    headers: { "Cache-Control": "no-store" },
  });
}
