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
  it("applies migration 1 idempotently with safe pragmas", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-db-"));
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, "spark.db"));

    migrate(database);
    migrate(database);

    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(
      database.prepare("select max(version) version from schema_migrations").get(),
    ).toEqual({ version: 1 });

    const tables = database
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining(["schema_migrations", "users", "sessions", "settings"]),
    );

    database.close();
  });
});
