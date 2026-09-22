// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import {
  addFavorite,
  addRecentItem,
  getIndexState,
  listFavorites,
  listRecentItems,
  replaceIndexEntry,
  replaceIndexText,
  updateIndexState,
} from "./discovery-repository";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function database() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-discovery-"));
  directories.push(directory);
  const database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  database.prepare("INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("u1", "alice", "Alice", "hash", "user", "now", "now");
  database.prepare("INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("u2", "bob", "Bob", "hash", "user", "now", "now");
  return database;
}

describe("discovery repository", () => {
  it("stores index entries, bounded FTS content, and resumable state", () => {
    const db = database();
    replaceIndexEntry(db, { logicalPath: "docs/readme.md", parentPath: "docs", name: "readme.md", kind: "file", sizeBytes: 10, modifiedAt: "2026-01-01T00:00:00.000Z", extension: ".md", mimeType: "text/markdown", textIndexed: true, generation: 2, indexedAt: "2026-01-01T00:00:00.000Z" });
    replaceIndexText(db, "docs/readme.md", "hello spark");
    updateIndexState(db, { generation: 2, cursor: "docs/readme.md", status: "running", error: null });
    expect(getIndexState(db)).toMatchObject({ generation: 2, cursor: "docs/readme.md", status: "running" });
    expect(db.prepare("SELECT logical_path, name FROM file_index_fts WHERE file_index_fts MATCH 'spark'").get()).toEqual({ logical_path: "docs/readme.md", name: "readme.md" });
    replaceIndexEntry(db, { logicalPath: "docs/readme.md", parentPath: "docs", name: "guide.md", kind: "file", sizeBytes: 10, modifiedAt: "2026-01-02T00:00:00.000Z", extension: ".md", mimeType: "text/markdown", textIndexed: true, generation: 2, indexedAt: "2026-01-02T00:00:00.000Z" });
    expect(db.prepare("SELECT name FROM file_index_fts WHERE logical_path = ?").get("docs/readme.md")).toEqual({ name: "guide.md" });
    db.close();
  });

  it("rejects FTS content above the shared byte ceiling", () => {
    const db = database();
    replaceIndexEntry(db, { logicalPath: "docs/large.txt", parentPath: "docs", name: "large.txt", kind: "file", sizeBytes: 1, modifiedAt: "2026-01-01T00:00:00.000Z", extension: ".txt", mimeType: "text/plain", textIndexed: true, generation: 1, indexedAt: "2026-01-01T00:00:00.000Z" });
    expect(() => replaceIndexText(db, "docs/large.txt", "x".repeat(256 * 1024 + 1))).toThrowError("INDEX_TEXT_TOO_LARGE");
    db.close();
  });

  it("isolates favorites and keeps recent items newest-first", () => {
    const db = database();
    addFavorite(db, "u1", "a.txt");
    addFavorite(db, "u2", "b.txt");
    addRecentItem(db, "u1", "old.txt", "2026-01-01T00:00:00.000Z");
    addRecentItem(db, "u1", "new.txt", "2026-01-02T00:00:00.000Z");
    expect(listFavorites(db, "u1").map((item) => item.logicalPath)).toEqual(["a.txt"]);
    expect(listRecentItems(db, "u1").map((item) => item.logicalPath)).toEqual(["new.txt", "old.txt"]);
    db.close();
  });

  it("makes favorite writes idempotent and bounds recent rows", () => {
    const db = database();
    addFavorite(db, "u1", "same.txt", "2026-01-01T00:00:00.000Z");
    addFavorite(db, "u1", "same.txt", "2026-01-02T00:00:00.000Z");
    expect(listFavorites(db, "u1")).toHaveLength(1);
    for (let index = 0; index < 51; index += 1) addRecentItem(db, "u1", `file-${index}.txt`, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`);
    expect(listRecentItems(db, "u1")).toHaveLength(50);
    expect(listRecentItems(db, "u1").some((item) => item.logicalPath === "file-0.txt")).toBe(false);
    db.close();
  });
});
