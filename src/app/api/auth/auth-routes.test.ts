// @vitest-environment node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { hashPassword } from "@/features/auth/password";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  cookies: new Map<string, { value: string; options?: object }>(),
}));

vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mocks.cookies.get(name),
    set: (name: string, value: string, options: object) =>
      mocks.cookies.set(name, { value, options }),
    delete: (name: string) => mocks.cookies.delete(name),
  }),
}));

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";

let database: Database.Database;
let directory: string;

beforeAll(async () => {
  process.env.SPARK_ORIGIN = "http://localhost:3000";
  process.env.SPARK_DATA_DIR = path.resolve("route-test-data");
  process.env.SPARK_FILES_ROOT = path.resolve("route-test-files");
  process.env.SPARK_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.SPARK_TRUST_PROXY = "false";
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "spark-routes-"));
  database = openDatabase(path.join(directory, "spark.db"));
  migrate(database);
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO users
    (id, username, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', ?, ?)`
    )
    .run(
      randomUUID(),
      "admin",
      "Administrator",
      await hashPassword("correct-password"),
      now,
      now
    );
  mocks.getDatabase.mockReturnValue(database);
});

beforeEach(() => mocks.cookies.clear());

afterAll(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function request(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body,
  });
}

describe("authentication routes", () => {
  it("rejects cross-origin mutations and invalid JSON", async () => {
    expect((await login(request("{}", "http://evil.test"))).status).toBe(403);
    expect((await login(request("not-json"))).status).toBe(400);
  });

  it("returns a generic error for invalid credentials", async () => {
    const response = await login(
      request(
        JSON.stringify({
          username: "admin",
          password: "wrong-password",
        })
      )
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_CREDENTIALS",
    });
  });

  it("sets a hardened cookie and exposes only safe session data", async () => {
    const response = await login(
      request(
        JSON.stringify({
          username: "admin",
          password: "correct-password",
        })
      )
    );
    expect(response.status).toBe(200);
    const cookie = mocks.cookies.get("spark_session");
    expect(cookie?.options).toEqual(
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
    const current = await session();
    const body = await current.json();
    expect(body.user).toEqual(
      expect.objectContaining({ username: "admin", role: "admin" })
    );
    expect(body.user).not.toHaveProperty("password_hash");
    expect(current.headers.get("cache-control")).toBe("private, no-store");

    expect((await logout(request("{}"))).status).toBe(200);
    expect((await session()).status).toBe(401);
    expect(
      database
        .prepare(
          "SELECT action, outcome FROM activity_events ORDER BY occurred_at DESC, id DESC LIMIT 1"
        )
        .get()
    ).toEqual({ action: "sign_out", outcome: "success" });
  });
});
