import type Database from "better-sqlite3";

export type SettingKey =
  | "require_sign_in"
  | "anonymous_access_expires_at"
  | "anonymous_access_reason"
  | "recycle_retention_days";

export type AccessSettings = {
  requireSignIn: boolean;
  expiresAt: string | null;
  reason: string | null;
};

const allowedKeys = new Set<SettingKey>([
  "require_sign_in",
  "anonymous_access_expires_at",
  "anonymous_access_reason",
  "recycle_retention_days",
]);

type SettingRow = { value_json: string };

function fail(message: string): never {
  const error = new Error(`INVALID_SETTING: ${message}`);
  error.name = "INVALID_SETTING";
  throw error;
}

function read(database: Database.Database, key: SettingKey): unknown {
  const row = database
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(key) as SettingRow | undefined;
  if (!row) fail(`Missing setting: ${key}`);
  try {
    return JSON.parse(row.value_json) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON setting: ${key}`, { cause: error });
  }
}

function validate(key: SettingKey, value: unknown): void {
  if (key === "require_sign_in" && typeof value !== "boolean") {
    fail("require_sign_in must be a boolean");
  }
  if (key === "anonymous_access_expires_at" && value !== null) {
    if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
      fail("anonymous_access_expires_at must be an ISO date or null");
    }
  }
  if (
    key === "anonymous_access_reason" &&
    value !== null &&
    (typeof value !== "string" || value.length > 500)
  ) {
    fail(
      "anonymous_access_reason must be a string up to 500 characters or null"
    );
  }
  if (
    key === "recycle_retention_days" &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 365)
  ) {
    fail("recycle_retention_days must be an integer from 1 to 365");
  }
}

export function setSetting(
  database: Database.Database,
  key: SettingKey,
  value: unknown,
  updatedBy: string | null,
  now = new Date()
): void {
  if (!allowedKeys.has(key)) fail(`Unknown setting: ${String(key)}`);
  validate(key, value);
  const result = database
    .prepare(
      `UPDATE settings
    SET value_json = ?, updated_at = ?, updated_by = ?
    WHERE key = ?`
    )
    .run(JSON.stringify(value), now.toISOString(), updatedBy, key);
  if (!result.changes) fail(`Missing setting: ${key}`);
}

export function getRetentionDays(database: Database.Database): number {
  const value = read(database, "recycle_retention_days");
  validate("recycle_retention_days", value);
  return value as number;
}

export function getAccessSettings(
  database: Database.Database,
  now = new Date()
): AccessSettings {
  const requireSignIn = read(database, "require_sign_in");
  validate("require_sign_in", requireSignIn);
  const expiry = read(database, "anonymous_access_expires_at");
  const reason = read(database, "anonymous_access_reason");
  validate("anonymous_access_expires_at", expiry);
  validate("anonymous_access_reason", reason);

  if (
    requireSignIn ||
    expiry === null ||
    new Date(expiry as string).getTime() <= now.getTime()
  ) {
    return { requireSignIn: true, expiresAt: null, reason: null };
  }
  return {
    requireSignIn: false,
    expiresAt: expiry as string,
    reason: reason as string | null,
  };
}
