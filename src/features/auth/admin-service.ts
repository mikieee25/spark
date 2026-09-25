import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordActivity } from "@/features/activity/activity-repository";
import { hashPassword } from "./password";
import type { SessionUser } from "./types";

export async function createAdministrator(
  database: Database.Database,
  input: { username: string; displayName: string; password: string },
  now = new Date()
): Promise<SessionUser> {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (!username || username.length > 128)
    throw new Error("Username is required");
  if (!displayName || displayName.length > 160)
    throw new Error("Display name is required");

  const user: SessionUser = {
    id: randomUUID(),
    username,
    displayName,
    role: "admin",
    mustChangePassword: false,
  };
  try {
    database
      .prepare(
        `INSERT INTO users
      (id, username, display_name, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, ?)`
      )
      .run(
        user.id,
        user.username,
        user.displayName,
        await hashPassword(input.password),
        now.toISOString(),
        now.toISOString()
      );
    recordActivity(database, {
      actorUserId: user.id,
      actorType: "user",
      action: "account_created",
      paths: [],
      outcome: "success",
      occurredAt: now,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      throw new Error(`Username already exists: ${username}`, { cause: error });
    }
    throw error;
  }
  return user;
}
