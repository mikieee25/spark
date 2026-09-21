// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import {
  createSession,
  resolveSession,
  revokeSession,
} from "./session-repository";

let database: Database.Database;
let directory: string;
let userId: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-session-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  userId = randomUUID();
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, "admin", "Administrator", "unused", "admin", now, now);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("sessions", () => {
  it("stores only the SHA-256 token hash", () => {
    const session = createSession(database, userId, new Date("2026-09-21T00:00:00Z"));
    const stored = database.prepare("SELECT id_hash FROM sessions").get() as {
      id_hash: string;
    };
    expect(stored.id_hash).not.toBe(session.token);
    expect(stored.id_hash).toBe(
      createHash("sha256").update(session.token).digest("hex"),
    );
  });

  it("resolves active sessions but rejects expired and revoked sessions", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    const active = createSession(database, userId, now);
    expect(resolveSession(database, active.token, new Date("2026-09-21T01:00:00Z")))
      .toMatchObject({ username: "admin", role: "admin" });

    expect(resolveSession(database, active.token, new Date("2026-09-22T00:00:01Z")))
      .toBeNull();

    const revoked = createSession(database, userId, now);
    revokeSession(database, revoked.token, now);
    expect(resolveSession(database, revoked.token, now)).toBeNull();
  });
});
