import "server-only";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db/runtime";
import { resolveSession } from "./session-repository";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import type { SessionUser } from "./types";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? resolveSession(getDatabase(), token, new Date()) : null;
}
