import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/request-auth";
import { getFileService } from "@/features/files/file-runtime";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(): Promise<Response> {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: noStore });
  const service = getFileService();
  await service.runMaintenance();
  return NextResponse.json({ entries: service.listRecycleEntries() }, { headers: noStore });
}
