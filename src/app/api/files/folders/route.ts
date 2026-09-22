import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { getFileService } from "@/features/files/file-runtime";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request): Promise<Response> {
  let access; try { access = await authorizeCapability(request, "mutate"); } catch (error) { const code = error instanceof Error ? error.message : "UNAUTHENTICATED"; return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }); } const user = access.user; if (!user) return NextResponse.json({ error: "ANONYMOUS_READ_ONLY" }, { status: 403, headers: noStore });
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore }); }
  const parsed = z.object({ path: z.string().max(4_096) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  try { return NextResponse.json(await getFileService().createFolder(user, parsed.data), { headers: noStore }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "FILESYSTEM_ERROR" }, { status: 409, headers: noStore }); }
}
