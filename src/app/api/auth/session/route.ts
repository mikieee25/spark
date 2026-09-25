import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/request-auth";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  return NextResponse.json(
    { user },
    {
      status: user ? 200 : 401,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
