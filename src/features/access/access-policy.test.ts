// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { setSetting } from "@/features/admin/settings-repository";
import { getAccessState } from "./access-policy";

let db: Database.Database;
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-access-"));
  db = openDatabase(path.join(root, "spark.db"));
  migrate(db);
});
afterEach(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});
describe("access policy", () => {
  it("locks anonymous access by default", () =>
    expect(getAccessState(db, new Date("2026-09-22T00:00:00Z"))).toMatchObject({
      requireSignIn: true,
      anonymous: false,
    }));
  it("allows anonymous only during the persisted window", () => {
    setSetting(db, "require_sign_in", false, null);
    setSetting(
      db,
      "anonymous_access_expires_at",
      "2026-09-22T01:00:00.000Z",
      null
    );
    expect(getAccessState(db, new Date("2026-09-22T00:30:00Z"))).toMatchObject({
      requireSignIn: false,
      anonymous: true,
    });
    expect(getAccessState(db, new Date("2026-09-22T02:00:00Z"))).toMatchObject({
      requireSignIn: true,
      anonymous: false,
    });
  });
});
