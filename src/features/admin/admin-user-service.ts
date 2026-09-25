import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordActivity } from "@/features/activity/activity-repository";
import { hashPassword } from "@/features/auth/password";
import {
  listSessions,
  revokeUserSessions,
  type SessionRecord,
} from "@/features/auth/session-repository";
import type { SessionUser } from "@/features/auth/types";

export type AdminActor = Readonly<{ id: string; role: "admin" | "user" }>;
export type AdminUser = SessionUser &
  Readonly<{ disabledAt: string | null; createdAt: string; updatedAt: string }>;

function requireAdmin(actor: AdminActor): void {
  if (actor.role !== "admin") throw new Error("ADMIN_REQUIRED");
}

function toUser(row: Record<string, unknown>): AdminUser {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    role: row.role as "user" | "admin",
    mustChangePassword: Boolean(row.must_change_password),
    disabledAt: row.disabled_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const userSelect =
  "id, username, display_name, role, must_change_password, disabled_at, created_at, updated_at";

export function listUsers(
  database: Database.Database,
  actor?: AdminActor
): AdminUser[] {
  if (actor) requireAdmin(actor);
  return (
    database
      .prepare(
        `SELECT ${userSelect} FROM users ORDER BY username COLLATE NOCASE`
      )
      .all() as Array<Record<string, unknown>>
  ).map(toUser);
}

export async function createUser(
  database: Database.Database,
  actor: AdminActor,
  input: {
    username: string;
    displayName: string;
    password: string;
    role?: "user" | "admin";
  },
  now = new Date()
): Promise<AdminUser> {
  requireAdmin(actor);
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (
    !username ||
    username.length > 128 ||
    !displayName ||
    displayName.length > 160
  )
    throw new Error("INVALID_USER");
  const id = randomUUID();
  const role = input.role ?? "user";
  const passwordHash = await hashPassword(input.password);
  try {
    database.transaction(() => {
      database
        .prepare(
          `INSERT INTO users (id, username, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          username,
          displayName,
          passwordHash,
          role,
          now.toISOString(),
          now.toISOString()
        );
      recordActivity(database, {
        actorUserId: actor.id,
        actorType: "user",
        action: "account_created",
        paths: [],
        outcome: "success",
        occurredAt: now,
        metadata: { userId: id, role },
      });
    })();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    )
      throw new Error("USERNAME_EXISTS", { cause: error });
    throw error;
  }
  return toUser(
    database
      .prepare(`SELECT ${userSelect} FROM users WHERE id = ?`)
      .get(id) as Record<string, unknown>
  );
}

export async function setUserDisabled(
  database: Database.Database,
  actor: AdminActor,
  userId: string,
  disabled: boolean,
  now = new Date()
): Promise<void> {
  requireAdmin(actor);
  const target = database
    .prepare("SELECT id, role, disabled_at FROM users WHERE id = ?")
    .get(userId) as
    | { id: string; role: "user" | "admin"; disabled_at: string | null }
    | undefined;
  if (!target) throw new Error("USER_NOT_FOUND");
  if (disabled && target.role === "admin" && !target.disabled_at) {
    const activeAdmins = database
      .prepare(
        "SELECT count(*) count FROM users WHERE role = 'admin' AND disabled_at IS NULL"
      )
      .get() as { count: number };
    if (activeAdmins.count <= 1) throw new Error("LAST_ADMIN");
  }
  database.transaction(() => {
    database
      .prepare("UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?")
      .run(disabled ? now.toISOString() : null, now.toISOString(), userId);
    if (disabled) revokeUserSessions(database, userId, now);
    recordActivity(database, {
      actorUserId: actor.id,
      actorType: "user",
      action: disabled ? "account_disabled" : "account_reactivated",
      paths: [],
      outcome: "success",
      occurredAt: now,
      metadata: { userId },
    });
  })();
}

export function setUserRole(
  database: Database.Database,
  actor: AdminActor,
  userId: string,
  role: "user" | "admin",
  now = new Date()
): void {
  requireAdmin(actor);
  const target = database
    .prepare("SELECT id, role, disabled_at FROM users WHERE id = ?")
    .get(userId) as
    | { id: string; role: "user" | "admin"; disabled_at: string | null }
    | undefined;
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.role === role) return;
  if (target.role === "admin" && role === "user" && !target.disabled_at) {
    const activeAdmins = database
      .prepare(
        "SELECT count(*) count FROM users WHERE role = 'admin' AND disabled_at IS NULL"
      )
      .get() as { count: number };
    if (activeAdmins.count <= 1) throw new Error("LAST_ADMIN");
  }
  database.transaction(() => {
    database
      .prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
      .run(role, now.toISOString(), userId);
    recordActivity(database, {
      actorUserId: actor.id,
      actorType: "user",
      action: "account_role_changed",
      paths: [],
      outcome: "success",
      occurredAt: now,
      metadata: { userId, from: target.role, to: role },
    });
  })();
}

export async function resetUserPassword(
  database: Database.Database,
  actor: AdminActor,
  userId: string,
  temporaryPassword: string,
  now = new Date()
): Promise<void> {
  requireAdmin(actor);
  const passwordHash = await hashPassword(temporaryPassword);
  database.transaction(() => {
    const result = database
      .prepare(
        "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?"
      )
      .run(passwordHash, now.toISOString(), userId);
    if (!result.changes) throw new Error("USER_NOT_FOUND");
    revokeUserSessions(database, userId, now);
    recordActivity(database, {
      actorUserId: actor.id,
      actorType: "user",
      action: "password_reset",
      paths: [],
      outcome: "success",
      occurredAt: now,
      metadata: { userId },
    });
  })();
}

export function listUserSessions(
  database: Database.Database,
  actor: AdminActor,
  userId: string
): SessionRecord[] {
  requireAdmin(actor);
  return listSessions(database, userId);
}
