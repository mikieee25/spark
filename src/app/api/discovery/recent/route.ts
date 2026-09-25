import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { listRecentItems } from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request): Promise<Response> {
  let user: NonNullable<
    Awaited<ReturnType<typeof authorizeCapability>>["user"]
  >;
  try {
    const access = await authorizeCapability(request, "favorite");
    if (!access.user) throw new Error("UNAUTHENTICATED");
    user = access.user;
  } catch {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401, headers: noStore }
    );
  }
  const parsed = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers: noStore }
    );
  return NextResponse.json(
    { items: listRecentItems(getDatabase(), user.id, parsed.data.limit) },
    { headers: noStore }
  );
}
