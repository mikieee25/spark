// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { beginOperation } from "./operation-repository";
import { reconcileStorageOperations } from "./recovery-service";

let database: Database.Database;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-recovery-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  database.prepare(`INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("user-1", "alex", "Alex DOE", "test-hash", "user", "2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("storage recovery", () => {
  it("clears stale locks and flags pending operations for review", () => {
    const operation = beginOperation(database, { actorUserId: "user-1", type: "upload", paths: ["a.txt"] });
    database.prepare("INSERT INTO operation_path_locks(path, operation_id, created_at) VALUES (?, ?, ?)")
      .run("a.txt", operation.id, "2026-09-22T00:00:00.000Z");

    const result = reconcileStorageOperations(database);

    expect(result.flaggedOperationIds).toEqual([operation.id]);
    expect(database.prepare("SELECT count(*) count FROM operation_path_locks").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT state, error_code FROM file_operations WHERE id = ?").get(operation.id))
      .toEqual({ state: "recovery_required", error_code: "RESTART_RECOVERY_REQUIRED" });
  });
});
