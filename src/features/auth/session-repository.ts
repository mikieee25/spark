import type Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import type { SessionUser } from "./types";

const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1_000;
const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1_000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

type SessionRow = {
  id: string;
  username: string;
  display_name: string;
  role: "user" | "admin";
  must_change_password: number;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  disabled_at: string | null;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(
  database: Database.Database,
  userId: string,
  now: Date,
): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);
  database.prepare(`INSERT INTO sessions
    (id_hash, user_id, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(tokenHash(token), userId, now.toISOString(), now.toISOString(), expiresAt.toISOString());
  return { token, expiresAt };
}

export function resolveSession(
  database: Database.Database,
  token: string,
  now: Date,
): SessionUser | null {
  if (!token) return null;
  const hash = tokenHash(token);
  const row = database.prepare(`SELECT
      u.id, u.username, u.display_name, u.role, u.must_change_password, u.disabled_at,
      s.last_seen_at, s.expires_at, s.revoked_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ?`)
    .get(hash) as SessionRow | undefined;

  if (!row || row.revoked_at || row.disabled_at) return null;
  const lastSeen = new Date(row.last_seen_at).getTime();
  if (now.getTime() > new Date(row.expires_at).getTime()) return null;
  if (now.getTime() - lastSeen > IDLE_TIMEOUT_MS) return null;

  if (now.getTime() - lastSeen >= TOUCH_INTERVAL_MS) {
    database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?")
      .run(now.toISOString(), hash);
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export function revokeSession(
  database: Database.Database,
  token: string,
  now: Date,
): void {
  if (!token) return;
  database.prepare("UPDATE sessions SET revoked_at = ? WHERE id_hash = ?")
    .run(now.toISOString(), tokenHash(token));
}

export function revokeUserSessions(database: Database.Database, userId: string, now: Date): number {
  return database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(now.toISOString(), userId).changes;
}

export type SessionRecord = {
  idHash: string;
  userId: string;
  username: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export function listSessions(database: Database.Database, userId: string): SessionRecord[] {
  const rows = database.prepare(`SELECT s.id_hash, s.user_id, u.username, s.created_at,
      s.last_seen_at, s.expires_at, s.revoked_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ? ORDER BY s.created_at DESC`).all(userId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    idHash: row.id_hash as string,
    userId: row.user_id as string,
    username: row.username as string,
    createdAt: row.created_at as string,
    lastSeenAt: row.last_seen_at as string,
    expiresAt: row.expires_at as string,
    revokedAt: row.revoked_at as string | null,
  }));
}

export function revokeSessionByHash(database: Database.Database, idHash: string, now: Date): boolean {
  return database.prepare("UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL")
    .run(now.toISOString(), idHash).changes > 0;
}
