// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { createStorageAdapter } from "./storage-adapter";
import { createFileService, listFileVersions, type FileActor } from "./file-service";

let database: Database.Database;
let directory: string;
let filesRoot: string;
let dataDirectory: string;
let service: ReturnType<typeof createFileService>;
const user: FileActor = { id: "user-1", role: "user" };
const admin: FileActor = { id: "admin-1", role: "admin" };

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "spark-service-"));
  filesRoot = path.join(directory, "files");
  dataDirectory = path.join(directory, "data");
  await fs.mkdir(filesRoot);
  await fs.mkdir(dataDirectory);
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  for (const [id, username, role] of [["user-1", "alex", "user"], ["admin-1", "admin", "admin"]]) {
    database.prepare(`INSERT INTO users
      (id, username, display_name, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, username, username, "test-hash", role, "2026-09-22T00:00:00.000Z", "2026-09-22T00:00:00.000Z");
  }
  service = createFileService({ database, storage: createStorageAdapter({ filesRoot, dataDirectory }) });
});

afterEach(async () => {
  database.close();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("file service", () => {
  it("creates a folder and stages an upload", async () => {
    await service.createFolder(user, { path: "Reports" });
    await service.uploadFile(user, { directory: "Reports", name: "note.txt", bytes: Buffer.from("DOE") });
    expect(await fs.readFile(path.join(filesRoot, "Reports", "note.txt"), "utf8")).toBe("DOE");
  });

  it("requires an explicit conflict policy and captures a replacement version", async () => {
    await service.uploadFile(user, { directory: "", name: "a.txt", bytes: Buffer.from("one") });
    await expect(service.uploadFile(user, { directory: "", name: "a.txt", bytes: Buffer.from("two") })).rejects.toThrow("CONFLICT");
    await service.uploadFile(user, { directory: "", name: "a.txt", bytes: Buffer.from("two"), conflict: "replace" });
    expect(await fs.readFile(path.join(filesRoot, "a.txt"), "utf8")).toBe("two");
    expect(listFileVersions(database, "a.txt")).toHaveLength(1);
  });

  it("rejects moving a folder into its own descendant", async () => {
    await service.createFolder(user, { path: "Reports" });
    await expect(service.moveFile(user, { source: "Reports", destination: "Reports/Archive" })).rejects.toThrow("INVALID_DESTINATION");
  });

  it("moves deleted content into recycle and restores it", async () => {
    await service.uploadFile(user, { directory: "", name: "recover.txt", bytes: Buffer.from("recover") });
    const deleted = await service.deleteToRecycle(user, { path: "recover.txt" });
    expect(await fs.stat(path.join(filesRoot, "recover.txt")).catch(() => null)).toBeNull();
    const restored = await service.restoreFromRecycle(user, { id: deleted.id });
    expect(restored).toHaveProperty("entry");
    if ("entry" in restored) expect(restored.entry).toEqual(expect.objectContaining({ state: "restored" }));
    expect(await fs.readFile(path.join(filesRoot, "recover.txt"), "utf8")).toBe("recover");
  });

  it("enforces administrator-only permanent purge", async () => {
    await service.uploadFile(user, { directory: "", name: "purge.txt", bytes: Buffer.from("purge") });
    const deleted = await service.deleteToRecycle(user, { path: "purge.txt" });
    await expect(service.purgeRecycleContent(user, deleted.id)).rejects.toThrow("ADMIN_REQUIRED");
    await service.purgeRecycleContent(admin, deleted.id);
    expect(database.prepare("SELECT purged_at FROM recycle_entries WHERE id = ?").get(deleted.id)).toEqual(expect.objectContaining({ purged_at: expect.any(String) }));
  });
});
