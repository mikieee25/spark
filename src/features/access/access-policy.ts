import type Database from "better-sqlite3";
import { getAccessSettings } from "@/features/admin/settings-repository";
import { getDatabase } from "@/lib/db/runtime";
import { getCurrentUser } from "@/features/auth/request-auth";
import type { SessionUser } from "@/features/auth/types";

export type AccessCapability = "browse" | "search" | "preview" | "download" | "mutate" | "recycle" | "favorite" | "admin";
export type AccessState = { requireSignIn: boolean; anonymous: boolean; expiresAt: string | null; reason: string | null };

export function getAccessState(database: Database.Database, now = new Date()): AccessState {
  const settings = getAccessSettings(database, now);
  return { ...settings, anonymous: !settings.requireSignIn };
}

export async function authorizeCapability(request: Request, capability: AccessCapability): Promise<{ user: SessionUser | null; actorType: "user" | "anonymous" }> {
  const user = await getCurrentUser();
  if (user) {
    if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    if (capability === "admin" && user.role !== "admin") throw new Error("ADMIN_REQUIRED");
    return { user, actorType: "user" };
  }
  let state: AccessState;
  try { state = getAccessState(getDatabase()); } catch { throw new Error("UNAUTHENTICATED"); }
  if (state.anonymous && ["browse", "search", "preview", "download"].includes(capability)) return { user: null, actorType: "anonymous" };
  throw new Error(state.requireSignIn ? "UNAUTHENTICATED" : "ANONYMOUS_ACCESS_EXPIRED");
}
