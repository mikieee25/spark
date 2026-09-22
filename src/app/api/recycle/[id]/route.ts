import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { getFileService } from "@/features/files/file-runtime";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: noStore });
  if (user.role !== "admin") return NextResponse.json({ error: "ADMIN_REQUIRED" }, { status: 403, headers: noStore });
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  try { return NextResponse.json(await getFileService().purgeRecycleContent(user, (await context.params).id), { headers: noStore }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "FILESYSTEM_ERROR" }, { status: 409, headers: noStore }); }
}
