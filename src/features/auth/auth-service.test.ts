// @vitest-environment node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { authenticate } from "./auth-service";
import { hashPassword } from "./password";

let database: Database.Database;
let directory: string;

async function insertUser(disabled = false): Promise<void> {
  const now = new Date("2026-09-21T00:00:00Z").toISOString();
  database
    .prepare(
      `INSERT INTO users
    (id, username, display_name, password_hash, role, disabled_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      "Alice",
      "Alice DOE",
      await hashPassword("correct-password"),
      "user",
      disabled ? now : null,
      now,
      now
    );
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-auth-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("authenticate", () => {
  it("authenticates usernames case-insensitively without credential fields", async () => {
    await insertUser();
    const result = await authenticate(
      database,
      "alice",
      "correct-password",
      new Date("2026-09-21T01:00:00Z")
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual(
        expect.objectContaining({ username: "Alice" })
      );
      expect(result.user).not.toHaveProperty("password_hash");
      expect(result.token).toBeTruthy();
    }
    expect(
      database
        .prepare(
          "SELECT action, outcome FROM activity_events ORDER BY occurred_at DESC LIMIT 1"
        )
        .get()
    ).toEqual({ action: "sign_in", outcome: "success" });
  });

  it("rejects unknown, incorrect, and disabled accounts", async () => {
    await insertUser();
    await expect(
      authenticate(database, "missing", "incorrect-pass", new Date())
    ).resolves.toEqual({ ok: false, reason: "invalid_credentials" });
    await expect(
      authenticate(database, "Alice", "incorrect-pass", new Date())
    ).resolves.toEqual({ ok: false, reason: "invalid_credentials" });
    expect(
      database
        .prepare(
          "SELECT action, outcome FROM activity_events ORDER BY occurred_at DESC LIMIT 1"
        )
        .get()
    ).toEqual({ action: "failed_authentication", outcome: "failure" });
    database
      .prepare("UPDATE users SET disabled_at = ? WHERE username = ?")
      .run(new Date().toISOString(), "Alice");
    await expect(
      authenticate(database, "Alice", "correct-password", new Date())
    ).resolves.toEqual({ ok: false, reason: "disabled" });
  });
});
