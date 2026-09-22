import type Database from "better-sqlite3";
import { recordActivity } from "@/features/activity/activity-repository";
import { hashPassword, verifyPassword } from "./password";

export async function changePassword(database: Database.Database, userId: string, currentPassword: string, newPassword: string, now = new Date()): Promise<void> {
  const user = database.prepare("SELECT password_hash FROM users WHERE id = ? AND disabled_at IS NULL").get(userId) as { password_hash: string } | undefined;
  if (!user || !(await verifyPassword(user.password_hash, currentPassword))) throw new Error("INVALID_CREDENTIALS");
  const passwordHash = await hashPassword(newPassword);
  database.transaction(() => {
    database.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").run(passwordHash, now.toISOString(), userId);
    recordActivity(database, { actorUserId: userId, actorType: "user", action: "password_changed", paths: [], outcome: "success", occurredAt: now });
  })();
}
