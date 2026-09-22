// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { getAccessSettings, getRetentionDays, setSetting } from "./settings-repository";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function database() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-settings-"));
  roots.push(root);
  const database = openDatabase(path.join(root, "spark.db"));
  migrate(database);
  return database;
}

describe("settings repository", () => {
  it("returns locked defaults and 30-day retention", () => {
    const db = database();
    expect(getAccessSettings(db, new Date("2026-09-22T00:00:00Z"))).toEqual({ requireSignIn: true, expiresAt: null, reason: null });
    expect(getRetentionDays(db)).toBe(30);
    db.close();
  });

  it("rejects retention values outside the 1-365 day range", () => {
    const db = database();
    expect(() => setSetting(db, "recycle_retention_days", 0, null)).toThrow("INVALID_SETTING");
    expect(() => setSetting(db, "recycle_retention_days", 366, null)).toThrow("INVALID_SETTING");
    db.close();
  });

  it("reports anonymous access only while the persisted window is active", () => {
    const db = database();
    setSetting(db, "require_sign_in", false, null);
    setSetting(db, "anonymous_access_expires_at", "2026-09-22T01:00:00.000Z", null);
    expect(getAccessSettings(db, new Date("2026-09-22T00:30:00Z"))).toMatchObject({ requireSignIn: false, expiresAt: "2026-09-22T01:00:00.000Z" });
    expect(getAccessSettings(db, new Date("2026-09-22T02:00:00Z"))).toMatchObject({ requireSignIn: true, expiresAt: null });
    db.close();
  });
});
