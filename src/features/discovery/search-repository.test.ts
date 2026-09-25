// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrations";
import { searchFiles } from "./search-repository";

const databases: Database.Database[] = [];

afterEach(() => databases.splice(0).forEach((database) => database.close()));

function createDatabase() {
  const database = new Database(":memory:");
  migrate(database);
  databases.push(database);
  const now = "2026-09-22T00:00:00.000Z";
  const add = (
    path: string,
    name: string,
    kind: "file" | "folder",
    text = ""
  ) => {
    database
      .prepare(
        `INSERT INTO file_index_entries
      (logical_path, parent_path, name, kind, size_bytes, modified_at, extension, mime_type, text_indexed, generation, indexed_at)
      VALUES (?, ?, ?, ?, 1, ?, '', 'text/plain', ?, 1, ?)`
      )
      .run(
        path,
        path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
        name,
        kind,
        now,
        text ? 1 : 0,
        now
      );
    database
      .prepare(
        "INSERT INTO file_index_fts(logical_path, name, text_content) VALUES (?, ?, ?)"
      )
      .run(path, name, text);
  };
  add("docs/alpha.txt", "alpha.txt", "file", "quarterly report");
  add("docs/beta.md", "beta.md", "file", "quarterly notes");
  add("photos/alpha.png", "alpha.png", "file");
  add("reports", "reports", "folder");
  add("docs/Activity Calendar", "Activity Calendar", "folder");
  return { database, add };
}

describe("search repository", () => {
  it("matches filename and content with path and type filters", () => {
    const { database } = createDatabase();
    expect(
      searchFiles(database, {
        query: "quarterly",
        pathPrefix: "docs",
        kind: "file",
        limit: 10,
      }).items.map((item) => item.logicalPath)
    ).toEqual(["docs/alpha.txt", "docs/beta.md"]);
  });

  it("includes folder names in the default search", () => {
    const { database } = createDatabase();
    expect(
      searchFiles(database, { query: "reports", limit: 10 }).items
    ).toEqual([
      expect.objectContaining({
        logicalPath: "reports",
        name: "reports",
        kind: "folder",
      }),
    ]);
    expect(
      searchFiles(database, { query: "Activity Calendar", limit: 10 }).items
    ).toEqual([
      expect.objectContaining({
        logicalPath: "docs/Activity Calendar",
        name: "Activity Calendar",
        kind: "folder",
      }),
    ]);
  });

  it("returns bounded deterministic pages with an opaque cursor", () => {
    const { database } = createDatabase();
    const first = searchFiles(database, { query: "alpha", limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.nextCursor).not.toContain("docs/");
    if (!first.nextCursor) throw new Error("expected cursor");
    expect(
      searchFiles(database, {
        query: "alpha",
        limit: 1,
        cursor: first.nextCursor,
      }).items.map((item) => item.logicalPath)
    ).toEqual(["photos/alpha.png"]);
  });

  it("rejects malformed cursors and unsafe FTS operators", () => {
    const { database } = createDatabase();
    expect(() =>
      searchFiles(database, { query: "alpha OR *", cursor: "not-a-cursor" })
    ).toThrow("INVALID_CURSOR");
    expect(
      searchFiles(database, { query: "alpha OR *" }).items.map(
        (item) => item.logicalPath
      )
    ).toEqual(["docs/alpha.txt", "photos/alpha.png"]);
  });

  it.each(["../secret", "a//b", "a\\b", "/absolute", "CON/file.txt"])(
    "rejects unsafe path %s",
    (pathPrefix) => {
      const { database } = createDatabase();
      expect(() =>
        searchFiles(database, { query: "alpha", pathPrefix })
      ).toThrow("INVALID_PATH");
    }
  );

  it("rejects unsafe decoded cursor paths", () => {
    const { database } = createDatabase();
    const cursor = Buffer.from(
      JSON.stringify({ logicalPath: "../secret" })
    ).toString("base64url");
    expect(() => searchFiles(database, { query: "alpha", cursor })).toThrow(
      "INVALID_CURSOR"
    );
  });
});
