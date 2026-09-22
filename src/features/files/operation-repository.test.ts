// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { beginOperation, completeOperation, failOperation, listIncompleteOperations, withPathLocks } from "./operation-repository";

let database: Database.Database;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-operation-"));
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

describe("operation repository", () => {
  it("persists pending, completed, and failed mutations", () => {
    const completed = beginOperation(database, { actorUserId: "user-1", type: "folder_create", paths: ["Reports"] });
    completeOperation(database, completed.id);
    const failed = beginOperation(database, { actorUserId: "user-1", type: "upload", paths: ["Reports/a.txt"] });
    failOperation(database, failed.id, "CONFLICT");

    expect(listIncompleteOperations(database)).toEqual([]);
    expect(database.prepare("SELECT state, error_code FROM file_operations ORDER BY created_at").all())
      .toEqual([{ state: "completed", error_code: null }, { state: "failed", error_code: "CONFLICT" }]);
  });

  it("locks paths deterministically for a mutation", async () => {
    const operation = beginOperation(database, { actorUserId: "user-1", type: "move", paths: ["b", "a"] });
    await withPathLocks(database, operation, ["b", "a"], async () => {
      expect(database.prepare("SELECT path FROM operation_path_locks ORDER BY path").all())
        .toEqual([{ path: "a" }, { path: "b" }]);
    });
    expect(database.prepare("SELECT count(*) count FROM operation_path_locks").get()).toEqual({ count: 0 });
  });
});
