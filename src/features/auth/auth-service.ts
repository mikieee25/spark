import type Database from "better-sqlite3";
import type { UserRecord } from "@/lib/db/types";
import { createSession } from "./session-repository";
import { hashPassword, verifyPassword } from "./password";
import type { AuthResult, SessionUser } from "./types";

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1_000;
const dummyHash = hashPassword("spark-invalid-credential-padding");

export async function authenticate(
  database: Database.Database,
  username: string,
  password: string,
  now: Date,
): Promise<AuthResult> {
  const user = database.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username.trim()) as UserRecord | undefined;

  if (!user) {
    await verifyPassword(await dummyHash, password);
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.disabled_at) return { ok: false, reason: "disabled" };
  if (user.locked_until && new Date(user.locked_until).getTime() > now.getTime()) {
    return { ok: false, reason: "locked" };
  }

  if (!(await verifyPassword(user.password_hash, password))) {
    const failures = user.failed_login_count + 1;
    const lockedUntil = failures >= MAX_FAILURES
      ? new Date(now.getTime() + LOCKOUT_MS).toISOString()
      : null;
    database.prepare(`UPDATE users
      SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
      .run(failures, lockedUntil, now.toISOString(), user.id);
    return { ok: false, reason: "invalid_credentials" };
  }

  database.prepare(`UPDATE users
    SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?`)
    .run(now.toISOString(), user.id);
  const session = createSession(database, user.id, now);
  const safeUser: SessionUser = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
  return { ok: true, user: safeUser, ...session };
}
