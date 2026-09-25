import type Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const MAX_TTL_MS = 15 * 60_000;
export type TerminalGrant = { userId: string; expiresAt: string };
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintTerminalToken(
  database: Database.Database,
  userId: string,
  now = new Date(),
  ttlMs = 60_000
): string {
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_TTL_MS)
    throw new Error("INVALID_TERMINAL_TTL");
  const token = randomBytes(32).toString("base64url");
  database
    .prepare(
      "INSERT INTO terminal_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      randomUUID(),
      userId,
      hash(token),
      now.toISOString(),
      new Date(now.getTime() + ttlMs).toISOString()
    );
  return token;
}

export function redeemTerminalToken(
  database: Database.Database,
  token: string,
  userId: string,
  now = new Date()
): TerminalGrant | null {
  if (!token) return null;
  const tokenHash = hash(token);
  const result = database.transaction(() => {
    const row = database
      .prepare(
        "SELECT expires_at FROM terminal_tokens WHERE token_hash = ? AND user_id = ? AND used_at IS NULL"
      )
      .get(tokenHash, userId) as { expires_at: string } | undefined;
    if (!row || new Date(row.expires_at).getTime() <= now.getTime())
      return null;
    const updated = database
      .prepare(
        "UPDATE terminal_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL"
      )
      .run(now.toISOString(), tokenHash);
    return updated.changes ? { userId, expiresAt: row.expires_at } : null;
  })();
  return result;
}
