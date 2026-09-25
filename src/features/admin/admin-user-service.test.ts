// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { createAdministrator } from "@/features/auth/admin-service";
import {
  createSession,
  resolveSession,
} from "@/features/auth/session-repository";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserDisabled,
  setUserRole,
} from "./admin-user-service";

let db: Database.Database;
let root: string;
let admin: {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "admin";
  mustChangePassword: boolean;
};
const actor = () => ({ id: admin.id, role: "admin" as const });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-admin-users-"));
  db = openDatabase(path.join(root, "spark.db"));
  migrate(db);
  admin = await createAdministrator(db, {
    username: "admin",
    displayName: "Admin",
    password: "correct-password",
  });
});
afterEach(() => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("admin user service", () => {
  it("creates users and prevents case-insensitive duplicates", async () => {
    const user = await createUser(db, actor(), {
      username: "alex",
      displayName: "Alex",
      password: "correct-password",
    });
    expect(user).toMatchObject({
      username: "alex",
      role: "user",
      mustChangePassword: false,
    });
    await expect(
      createUser(db, actor(), {
        username: "ALEX",
        displayName: "Alex 2",
        password: "correct-password",
      })
    ).rejects.toThrow("USERNAME_EXISTS");
  });
  it("protects the last active admin and revokes disabled sessions", async () => {
    const session = createSession(db, admin.id, new Date());
    await expect(setUserDisabled(db, actor(), admin.id, true)).rejects.toThrow(
      "LAST_ADMIN"
    );
    const second = await createUser(db, actor(), {
      username: "second",
      displayName: "Second",
      password: "correct-password",
      role: "admin",
    });
    await setUserDisabled(db, actor(), second.id, true);
    expect(resolveSession(db, session.token, new Date())).not.toBeNull();
    await setUserDisabled(db, actor(), admin.id, false);
    await setUserDisabled(db, actor(), second.id, false);
    await setUserDisabled(db, actor(), second.id, true);
    expect(listUsers(db)).toHaveLength(2);
  });
  it("resets a password with forced change and no stored plaintext", async () => {
    const user = await createUser(db, actor(), {
      username: "alex",
      displayName: "Alex",
      password: "correct-password",
    });
    await resetUserPassword(db, actor(), user.id, "temporary-password");
    expect(
      db
        .prepare(
          "SELECT must_change_password, password_hash FROM users WHERE id = ?"
        )
        .get(user.id)
    ).toMatchObject({ must_change_password: 1 });
    expect(
      db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id)
    ).not.toEqual({ password_hash: "temporary-password" });
  });
  it("changes roles while preserving one active administrator", async () => {
    const user = await createUser(db, actor(), {
      username: "alex",
      displayName: "Alex",
      password: "correct-password",
    });
    await setUserRole(db, actor(), user.id, "admin");
    expect(listUsers(db).find((item) => item.id === user.id)).toMatchObject({
      role: "admin",
    });
    await setUserRole(db, actor(), user.id, "user");
    expect(listUsers(db).find((item) => item.id === user.id)).toMatchObject({
      role: "user",
    });
    expect(() => setUserRole(db, actor(), admin.id, "user")).toThrow(
      "LAST_ADMIN"
    );
    expect(() =>
      setUserRole(db, { id: "user-1", role: "user" }, user.id, "admin")
    ).toThrow("ADMIN_REQUIRED");
  });
});
