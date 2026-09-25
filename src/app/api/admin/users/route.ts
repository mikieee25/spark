import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/request-auth";
import { hasValidMutationOrigin } from "@/features/auth/origin";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserDisabled,
  setUserRole,
} from "@/features/admin/admin-user-service";
import { getDatabase } from "@/lib/db/runtime";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const userSchema = z.object({
  username: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(160),
  password: z.string().min(12).max(128),
  role: z.enum(["user", "admin"]).optional(),
});
function errorResponse(error: unknown): Response {
  const code =
    error instanceof Error ? error.message : "ADMIN_OPERATION_FAILED";
  const status =
    code === "ADMIN_REQUIRED"
      ? 403
      : code === "USER_NOT_FOUND"
        ? 404
        : code === "USERNAME_EXISTS"
          ? 409
          : code === "LAST_ADMIN"
            ? 409
            : 400;
  return NextResponse.json(
    { error: /^[A-Z0-9_]+$/.test(code) ? code : "ADMIN_OPERATION_FAILED" },
    { status, headers }
  );
}
async function admin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

export async function GET(): Promise<Response> {
  const user = await admin();
  if (!user)
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  return NextResponse.json(
    { users: listUsers(getDatabase(), user) },
    { headers }
  );
}
export async function POST(request: Request): Promise<Response> {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "INVALID_ORIGIN" },
      { status: 403, headers }
    );
  const user = await admin();
  if (!user)
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  }
  const parsed = userSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  try {
    return NextResponse.json(
      { user: await createUser(getDatabase(), user, parsed.data) },
      { status: 201, headers }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request): Promise<Response> {
  if (!hasValidMutationOrigin(request))
    return NextResponse.json(
      { error: "INVALID_ORIGIN" },
      { status: 403, headers }
    );
  const user = await admin();
  if (!user)
    return NextResponse.json(
      { error: "ADMIN_REQUIRED" },
      { status: 403, headers }
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  }
  const parsed = z
    .object({
      userId: z.string().uuid(),
      disabled: z.boolean().optional(),
      temporaryPassword: z.string().min(12).max(128).optional(),
      role: z.enum(["user", "admin"]).optional(),
    })
    .refine(
      (value) =>
        [
          value.temporaryPassword !== undefined,
          value.disabled !== undefined,
          value.role !== undefined,
        ].filter(Boolean).length === 1
    )
    .safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers }
    );
  try {
    if (parsed.data.temporaryPassword !== undefined)
      await resetUserPassword(
        getDatabase(),
        user,
        parsed.data.userId,
        parsed.data.temporaryPassword
      );
    else if (parsed.data.role !== undefined)
      setUserRole(getDatabase(), user, parsed.data.userId, parsed.data.role);
    else
      await setUserDisabled(
        getDatabase(),
        user,
        parsed.data.userId,
        parsed.data.disabled!
      );
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(): Promise<Response> {
  return NextResponse.json(
    { error: "ACCOUNT_DELETE_DISABLED" },
    { status: 405, headers }
  );
}
