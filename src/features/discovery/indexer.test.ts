// @vitest-environment node
import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrations";
import { createStorageAdapter } from "@/features/files/storage-adapter";
import { getIndexState } from "./discovery-repository";
import { runIndexMaintenance } from "./indexer";
import { searchFiles } from "./search-repository";
import { beginFolderRead } from "./folder-read-priority";

let root: string;
let data: string;
let database: Database.Database;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "spark-index-files-"));
  data = await fs.mkdtemp(path.join(os.tmpdir(), "spark-index-data-"));
  database = new Database(":memory:");
  migrate(database);
});

afterEach(async () => {
  database.close();
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(data, { recursive: true, force: true });
});

describe("indexer", () => {
  it("walks sorted logical paths and resumes from its cursor", async () => {
    await fs.mkdir(path.join(root, "z"));
    await fs.writeFile(path.join(root, "b.txt"), "B");
    await fs.writeFile(path.join(root, "z", "a.ts"), "const a = 1");
    const storage = createStorageAdapter({ filesRoot: root, dataDirectory: data });

    const first = await runIndexMaintenance({ database, storage, maxEntries: 2 });
    expect(first.processed).toBe(2);
    expect(getIndexState(database)).toMatchObject({ status: "running", cursor: "z" });
    expect(await runIndexMaintenance({ database, storage, maxEntries: 10 })).toMatchObject({ completed: true });
    expect(database.prepare("SELECT logical_path FROM file_index_entries ORDER BY logical_path").pluck().all()).toEqual(["b.txt", "z", "z/a.ts"]);
  });

  it("removes rows absent from a completed generation", async () => {
    const storage = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    await fs.writeFile(path.join(root, "keep.txt"), "keep");
    await fs.writeFile(path.join(root, "gone.txt"), "gone");
    await runIndexMaintenance({ database, storage, maxEntries: 20 });
    await fs.rm(path.join(root, "gone.txt"));
    await runIndexMaintenance({ database, storage, maxEntries: 20 });
    expect(database.prepare("SELECT logical_path FROM file_index_entries ORDER BY logical_path").pluck().all()).toEqual(["keep.txt"]);
  });

  it("records an explicit failure without hiding the checkpoint", async () => {
    const storage = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    await fs.writeFile(path.join(root, "ok.txt"), "ok");
    await fs.symlink(path.join(data, "outside.txt"), path.join(root, "link.txt"));
    const result = await runIndexMaintenance({ database, storage, maxEntries: 20 });
    expect(result.completed).toBe(false);
    expect(getIndexState(database)).toMatchObject({ status: "error", error: expect.stringContaining("SYMLINK_NOT_ALLOWED") });
  });

  it("preserves the last successful checkpoint when a later read fails", async () => {
    await fs.writeFile(path.join(root, "a.txt"), "a");
    await fs.writeFile(path.join(root, "b.txt"), "b");
    const base = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    let failed = true;
    const storage = { ...base, readFile: async (logicalPath: string) => {
      if (failed && logicalPath === "b.txt") throw new Error("READ_FAILED");
      return base.readFile(logicalPath);
    } };
    await runIndexMaintenance({ database, storage, maxEntries: 20 });
    expect(getIndexState(database)).toMatchObject({ status: "error", cursor: "a.txt" });
    failed = false;
    expect(await runIndexMaintenance({ database, storage, maxEntries: 20 })).toMatchObject({ completed: true });
  });

  it("does bounded listing work per batch", async () => {
    await Promise.all(Array.from({ length: 30 }, async (_, index) => {
      const folder = path.join(root, `${String(index).padStart(2, "0")}`);
      await fs.mkdir(folder);
      await fs.writeFile(path.join(folder, "file.txt"), "x");
    }));
    const base = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    let listCalls = 0;
    const storage = { ...base, list: async (logicalPath: string) => { listCalls++; return base.list(logicalPath); } };
    await runIndexMaintenance({ database, storage, maxEntries: 3 });
    expect(listCalls).toBeLessThanOrEqual(3);
    expect(database.prepare("SELECT COUNT(*) FROM file_index_entries").pluck().get()).toBe(3);
  });

  it("yields before scanning a child directory when a folder read starts", async () => {
    await fs.mkdir(path.join(root, "Reports"));
    await fs.writeFile(path.join(root, "Reports", "brief.txt"), "x");
    const base = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    let listCalls = 0;
    let releaseFolderRead!: () => void;
    const storage = {
      ...base,
      list: async (logicalPath: string) => {
        listCalls += 1;
        const result = await base.list(logicalPath);
        if (!logicalPath) releaseFolderRead = beginFolderRead();
        return result;
      },
    };

    const indexing = runIndexMaintenance({ database, storage, maxEntries: 20 });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(listCalls).toBe(1);
    releaseFolderRead();
    await expect(indexing).resolves.toMatchObject({ completed: true });
    expect(listCalls).toBe(2);
  });

  it("indexes every filename while bounding text content", async () => {
    const storage = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    await fs.writeFile(path.join(root, "note.txt"), "needle");
    await fs.writeFile(path.join(root, "image.png"), Buffer.from([0, 1, 2]));
    await fs.mkdir(path.join(root, "folder-name"));
    await runIndexMaintenance({ database, storage, maxEntries: 20 });
    expect(database.prepare("SELECT text_content FROM file_index_fts WHERE logical_path = 'note.txt'").pluck().get()).toBe("needle");
    expect(database.prepare("SELECT name, text_content FROM file_index_fts WHERE logical_path = 'image.png'").get()).toEqual({ name: "image.png", text_content: "" });
    expect(database.prepare("SELECT name FROM file_index_fts WHERE file_index_fts MATCH '\"folder-name\"'").pluck().get()).toBe("folder-name");
    expect(searchFiles(database, { query: "image.png" }).items.map((item) => item.logicalPath)).toContain("image.png");
    expect(searchFiles(database, { query: "folder-name", kind: "folder" }).items.map((item) => item.logicalPath)).toContain("folder-name");
  });

  it("removes stale FTS content when a text file becomes binary", async () => {
    const storage = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    await fs.writeFile(path.join(root, "changing.txt"), "needle");
    await runIndexMaintenance({ database, storage, maxEntries: 20 });
    expect(database.prepare("SELECT COUNT(*) FROM file_index_fts WHERE logical_path = 'changing.txt'").pluck().get()).toBe(1);
    await fs.writeFile(path.join(root, "changing.txt"), Buffer.alloc(300 * 1024, 1));
    await runIndexMaintenance({ database, storage, maxEntries: 20 });
    expect(database.prepare("SELECT name, text_content FROM file_index_fts WHERE logical_path = 'changing.txt'").get()).toEqual({ name: "changing.txt", text_content: "" });
    expect(searchFiles(database, { query: "needle" }).items.map((item) => item.logicalPath)).not.toContain("changing.txt");
    expect(searchFiles(database, { query: "changing.txt" }).items.map((item) => item.logicalPath)).toContain("changing.txt");
  });
});
