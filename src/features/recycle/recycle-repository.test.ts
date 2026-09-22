// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import {
  createRecycleEntry,
  expireRecycleEntries,
  listRecycleEntries,
  purgeRecycleEntry,
  restoreRecycleEntry,
} from "./recycle-repository";

let database: Database.Database;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-recycle-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  database.prepare(`INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("user-1", "alex", "Alex DOE", "test-hash", "user", "2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
  database.prepare(`INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("admin-1", "admin", "SPARK Administrator", "test-hash", "admin", "2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("recycle repository", () => {
  it("registers entries and restores them without touching filesystem paths", () => {
    const entry = createRecycleEntry(database, {
      originalPath: "Shared/report.pdf",
      storageKey: "2026/09/22/op-1-report.pdf",
      itemType: "file",
      sizeBytes: 42,
      deletedBy: "user-1",
      operationId: "op-1",
      expiresAt: new Date("2026-10-22T00:00:00.000Z"),
      occurredAt: new Date("2026-09-22T01:00:00.000Z"),
    });

    expect(listRecycleEntries(database)).toEqual([expect.objectContaining({
      id: entry.id,
      originalPath: "Shared/report.pdf",
      state: "active",
    })]);

    const restored = restoreRecycleEntry(database, entry.id, "user-1", new Date("2026-09-22T02:00:00.000Z"));
    expect(restored.state).toBe("restored");
    expect(listRecycleEntries(database)).toEqual([]);
    expect(database.prepare("SELECT action FROM activity_events ORDER BY occurred_at DESC LIMIT 1").get())
      .toEqual({ action: "recycle_restore" });
  });

  it("requires an administrator for permanent purge", () => {
    const entry = createRecycleEntry(database, {
      originalPath: "Shared/folder",
      storageKey: "2026/09/22/op-2-folder",
      itemType: "folder",
      sizeBytes: 0,
      deletedBy: "user-1",
      operationId: "op-2",
      expiresAt: new Date("2026-10-22T00:00:00.000Z"),
    });

    expect(() => purgeRecycleEntry(database, entry.id, { id: "user-1", role: "user" }, new Date()))
      .toThrow("ADMIN_REQUIRED");
    expect(purgeRecycleEntry(database, entry.id, { id: "admin-1", role: "admin" }, new Date()).state)
      .toBe("purged");
  });

  it("marks expired entries and records retention activity", () => {
    createRecycleEntry(database, {
      originalPath: "Shared/old.txt",
      storageKey: "2026/09/22/op-3-old.txt",
      itemType: "file",
      sizeBytes: 10,
      deletedBy: "user-1",
      operationId: "op-3",
      expiresAt: new Date("2026-09-21T00:00:00.000Z"),
      occurredAt: new Date("2026-09-20T00:00:00.000Z"),
    });

    expect(expireRecycleEntries(database, new Date("2026-09-22T00:00:00.000Z"))).toHaveLength(1);
    expect(listRecycleEntries(database)).toEqual([]);
    expect(database.prepare("SELECT action FROM activity_events ORDER BY occurred_at DESC LIMIT 1").get())
      .toEqual({ action: "recycle_expire" });
  });
});
