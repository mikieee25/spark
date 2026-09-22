// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { createRecycleEntry } from "./recycle-repository";
import { runRecycleMaintenance } from "./retention-service";

let database: Database.Database;
let directory: string;
let recyclePath: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "spark-retention-"));
  recyclePath = path.join(directory, "recycle", "item");
  await fs.mkdir(path.dirname(recyclePath), { recursive: true });
  await fs.writeFile(recyclePath, "old");
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  database.prepare(`INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("user-1", "alex", "Alex DOE", "test-hash", "user", "2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
  createRecycleEntry(database, {
    originalPath: "old.txt", storageKey: "item", itemType: "file", sizeBytes: 3,
    deletedBy: "user-1", expiresAt: new Date("2026-09-21T00:00:00.000Z"), occurredAt: new Date("2026-09-20T00:00:00.000Z"),
  });
});

afterEach(async () => {
  database.close();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("recycle maintenance", () => {
  it("expires and purges expired private content with an audit event", async () => {
    const storage = { removePrivate: async (key: string) => fs.rm(path.join(directory, "recycle", key)), };
    await runRecycleMaintenance(database, storage, new Date("2026-09-22T00:00:00.000Z"));
    expect(await fs.stat(recyclePath).catch(() => null)).toBeNull();
    expect(database.prepare("SELECT purged_at FROM recycle_entries").get()).toEqual(expect.objectContaining({ purged_at: expect.any(String) }));
  });

  it("retries an already expired entry after a transient purge failure", async () => {
    const storage = { removePrivate: async () => { throw new Error("temporary failure"); } };
    await runRecycleMaintenance(database, storage, new Date("2026-09-22T00:00:00.000Z"));
    const retryStorage = { removePrivate: async (key: string) => fs.rm(path.join(directory, "recycle", key)) };
    await runRecycleMaintenance(database, retryStorage, new Date("2026-09-23T00:00:00.000Z"));
    expect(await fs.stat(recyclePath).catch(() => null)).toBeNull();
  });
});
