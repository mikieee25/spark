// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { recordActivity, listActivity } from "./activity-repository";

let database: Database.Database;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-activity-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  database.prepare(`INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', ?, ?)`)
    .run("user-1", "admin", "SPARK Administrator", "test-hash", "2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("activity repository", () => {
  it("records append-only events, redacts sensitive metadata, and lists newest first", () => {
    recordActivity(database, {
      actorUserId: "user-1",
      actorType: "user",
      action: "file_upload",
      paths: ["Shared/report.pdf"],
      operationId: "op-1",
      outcome: "success",
      occurredAt: new Date("2026-09-22T01:00:00.000Z"),
      metadata: { size: 42, password: "never-store", content: "never-store" },
    });
    recordActivity(database, {
      actorType: "system",
      action: "recovery_check",
      paths: [],
      outcome: "failure",
      errorCode: "STALE_OPERATION",
      occurredAt: new Date("2026-09-22T02:00:00.000Z"),
    });

    const events = listActivity(database);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(expect.objectContaining({
      action: "recovery_check",
      outcome: "failure",
      actorType: "system",
    }));
    expect(events[1]).toEqual(expect.objectContaining({
      action: "file_upload",
      actorUsername: "admin",
      paths: ["Shared/report.pdf"],
      metadata: { size: 42 },
    }));
    expect(database.prepare("SELECT count(*) count FROM activity_events").get()).toEqual({ count: 2 });
  });

  it("bounds the requested page size", () => {
    for (let index = 0; index < 3; index += 1) {
      recordActivity(database, {
        actorType: "anonymous",
        action: "failed_authentication",
        paths: [],
        outcome: "failure",
      });
    }
    expect(listActivity(database, { limit: 2 })).toHaveLength(2);
    expect(listActivity(database, { limit: 0 })).toHaveLength(1);
    expect(listActivity(database, { limit: 999 })).toHaveLength(3);
  });
});
