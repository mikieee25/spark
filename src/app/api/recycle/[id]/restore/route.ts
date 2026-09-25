import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { getFileService } from "@/features/files/file-runtime";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401, headers: noStore }
    );
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "INVALID_ORIGIN" },
      { status: 403, headers: noStore }
    );
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is valid */
  }
  const parsed = z
    .object({
      conflict: z.enum(["fail", "replace", "rename", "skip"]).optional(),
    })
    .safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers: noStore }
    );
  try {
    return NextResponse.json(
      await getFileService().restoreFromRecycle(user, {
        id: (await context.params).id,
        conflict: parsed.data.conflict,
      }),
      { headers: noStore }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "FILESYSTEM_ERROR" },
      { status: 409, headers: noStore }
    );
  }
}
