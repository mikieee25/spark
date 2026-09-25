// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { createAdministrator } from "./admin-service";

let database: Database.Database;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-admin-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("createAdministrator", () => {
  it("records administrator creation without storing the password", async () => {
    const administrator = await createAdministrator(
      database,
      {
        username: "admin",
        displayName: "SPARK Administrator",
        password: "correct-password",
      },
      new Date("2026-09-22T03:00:00.000Z")
    );

    expect(
      database
        .prepare("SELECT password_hash FROM users WHERE id = ?")
        .get(administrator.id)
    ).toEqual(
      expect.objectContaining({
        password_hash: expect.not.stringContaining("correct-password"),
      })
    );
    expect(
      database
        .prepare("SELECT action, actor_user_id FROM activity_events")
        .get()
    ).toEqual({ action: "account_created", actor_user_id: administrator.id });
  });
});
