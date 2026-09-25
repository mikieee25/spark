import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { getFileService } from "@/features/files/file-runtime";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  let access;
  try {
    access = await authorizeCapability(request, "mutate");
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return NextResponse.json(
      { error: code },
      { status: code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore }
    );
  }
  const user = access.user;
  if (!user)
    return NextResponse.json(
      { error: "ANONYMOUS_READ_ONLY" },
      { status: 403, headers: noStore }
    );
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "INVALID_ORIGIN" },
      { status: 403, headers: noStore }
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers: noStore }
    );
  }
  const file = form.get("file");
  const parsed = z
    .object({
      directory: z.string().max(4_096),
      conflict: z.enum(["fail", "replace", "rename", "skip"]).optional(),
    })
    .safeParse({
      directory: form.get("directory") ?? "",
      conflict: form.get("conflict") ?? undefined,
    });
  if (
    !parsed.success ||
    !(file instanceof File) ||
    file.size > MAX_UPLOAD_BYTES
  )
    return NextResponse.json(
      { error: "INVALID_UPLOAD" },
      { status: 400, headers: noStore }
    );
  try {
    return NextResponse.json(
      await getFileService().uploadFile(user, {
        directory: parsed.data.directory,
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        conflict: parsed.data.conflict,
      }),
      { headers: noStore }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "FILESYSTEM_ERROR";
    return NextResponse.json(
      { error: code },
      { status: code === "CONFLICT" ? 409 : 400, headers: noStore }
    );
  }
}
