// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { createBackup, restoreBackup, verifyBackup } from "./backup";

let directory: string;
let dataDirectory: string;
let databasePath: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "spark-backup-"));
  dataDirectory = path.join(directory, "data");
  databasePath = path.join(dataDirectory, "spark.db");
  const database = openDatabase(databasePath);
  migrate(database);
  database.close();
  await fs.mkdir(path.join(dataDirectory, "recycle"), { recursive: true });
  await fs.mkdir(path.join(dataDirectory, "versions"), { recursive: true });
  await fs.writeFile(path.join(dataDirectory, "recycle", "one"), "recycled");
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("SPARK backups", () => {
  it("creates and verifies a manifest-backed private-data snapshot", async () => {
    const destination = path.join(directory, "backups");
    const backupPath = await createBackup(
      { dataDirectory, databasePath },
      destination,
      new Date("2026-09-22T01:00:00.000Z")
    );
    expect(await verifyBackup(backupPath)).toEqual(
      expect.objectContaining({ valid: true, files: expect.any(Number) })
    );
  });

  it("requires confirmation before restoring a snapshot", async () => {
    const destination = path.join(directory, "backups");
    const backupPath = await createBackup(
      { dataDirectory, databasePath },
      destination,
      new Date("2026-09-22T01:00:00.000Z")
    );
    const restoreTarget = path.join(directory, "restored-data");
    await expect(restoreBackup(backupPath, restoreTarget)).rejects.toThrow(
      "RESTORE_CONFIRMATION_REQUIRED"
    );
    await restoreBackup(backupPath, restoreTarget, true);
    expect(
      await fs.readFile(path.join(restoreTarget, "recycle", "one"), "utf8")
    ).toBe("recycled");
  });
});
