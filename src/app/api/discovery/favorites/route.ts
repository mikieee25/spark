import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/features/access/access-policy";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import { addFavorite, listFavorites, removeFavorite } from "@/features/discovery/discovery-repository";
import { getDatabase } from "@/lib/db/runtime";
import { normalizeLogicalPath } from "@/features/files/path-policy";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const path = z.string().trim().min(1).max(4_096).refine((value) => { try { normalizeLogicalPath(value); return true; } catch { return false; } });

export async function GET(request: Request = new Request("http://spark.local")): Promise<Response> {
  const user = await (async () => { try { return (await authorizeCapability(request, "favorite")).user; } catch { return null; } })();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: noStore });
  return NextResponse.json({ items: listFavorites(getDatabase(), user.id) }, { headers: noStore });
}

export async function PUT(request: Request): Promise<Response> {
  let user: NonNullable<Awaited<ReturnType<typeof authorizeCapability>>["user"]>;
  try { const access = await authorizeCapability(request, "favorite"); if (!access.user) throw new Error("UNAUTHENTICATED"); user = access.user; } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNAUTHENTICATED" }, { status: 403, headers: noStore }); }
  if (!hasValidMutationOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore }); }
  const parsed = z.object({ path, favorite: z.boolean() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400, headers: noStore });
  const logicalPath = normalizeLogicalPath(parsed.data.path);
  const database = getDatabase();
  if (parsed.data.favorite) return NextResponse.json({ favorite: addFavorite(database, user.id, logicalPath) }, { headers: noStore });
  removeFavorite(database, user.id, logicalPath);
  return NextResponse.json({ favorite: null }, { headers: noStore });
}
