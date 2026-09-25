// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database";
import { migrate } from "./migrations";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("database migrations", () => {
  it("applies migrations idempotently with safe pragmas", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-db-"));
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, "spark.db"));

    migrate(database);
    migrate(database);

    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(
      database
        .prepare("select max(version) version from schema_migrations")
        .get()
    ).toEqual({ version: 7 });

    const tables = database
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "schema_migrations",
        "users",
        "sessions",
        "settings",
        "activity_events",
        "recycle_entries",
        "file_operations",
        "operation_path_locks",
        "file_versions",
        "file_index_entries",
        "file_index_state",
        "user_favorites",
        "user_recent_items",
        "terminal_tokens",
      ])
    );
    expect(database.prepare("PRAGMA table_info(users)").all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "must_change_password" }),
      ])
    );
    expect(
      database
        .prepare(
          "SELECT key, value_json FROM settings WHERE key IN ('require_sign_in', 'recycle_retention_days') ORDER BY key"
        )
        .all()
    ).toEqual([
      { key: "recycle_retention_days", value_json: "30" },
      { key: "require_sign_in", value_json: "true" },
    ]);

    expect(
      database.prepare("PRAGMA table_info(file_index_entries)").all()
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "logical_path" }),
        expect.objectContaining({ name: "text_indexed" }),
        expect.objectContaining({ name: "generation" }),
      ])
    );
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE name = 'file_index_fts'")
        .get()
    ).toEqual({
      name: "file_index_fts",
    });
    expect(() =>
      database.exec(
        "CREATE VIRTUAL TABLE temp.fts5_runtime_test USING fts5(value)"
      )
    ).not.toThrow();
    database.exec("DROP TABLE temp.fts5_runtime_test");

    database.close();
  });
});
