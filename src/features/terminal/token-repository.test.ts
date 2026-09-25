// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { mintTerminalToken, redeemTerminalToken } from "./token-repository";

let db: Database.Database;
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-terminal-"));
  db = openDatabase(path.join(root, "spark.db"));
  migrate(db);
  db.prepare(
    "INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)"
  ).run(
    "admin-1",
    "admin",
    "Admin",
    "unused",
    new Date().toISOString(),
    new Date().toISOString()
  );
});
afterEach(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("terminal capability tokens", () => {
  it("stores only a hash and permits one redemption", () => {
    const now = new Date("2026-09-22T00:00:00Z");
    const token = mintTerminalToken(db, "admin-1", now, 60_000);
    expect(redeemTerminalToken(db, token, "admin-1", now)).toMatchObject({
      userId: "admin-1",
    });
    expect(redeemTerminalToken(db, token, "admin-1", now)).toBeNull();
    const row = db
      .prepare("SELECT token_hash, used_at FROM terminal_tokens")
      .get() as { token_hash: string; used_at: string | null };
    expect(row.token_hash).not.toBe(token);
    expect(row.used_at).not.toBeNull();
  });
  it("rejects a different user and expired token", () => {
    const now = new Date("2026-09-22T00:00:00Z");
    const token = mintTerminalToken(db, "admin-1", now, 60_000);
    expect(redeemTerminalToken(db, token, "other", now)).toBeNull();
    expect(
      redeemTerminalToken(
        db,
        token,
        "admin-1",
        new Date("2026-09-22T00:01:01Z")
      )
    ).toBeNull();
  });
});
