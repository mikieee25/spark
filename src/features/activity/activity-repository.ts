import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ActivityActorType = "user" | "anonymous" | "system";
export type ActivityOutcome = "success" | "failure";
export type ActivityMetadata = Record<string, unknown>;

export type ActivityEventInput = {
  actorUserId?: string | null;
  actorType: ActivityActorType;
  action: string;
  paths: readonly string[];
  operationId?: string | null;
  outcome: ActivityOutcome;
  errorCode?: string | null;
  metadata?: ActivityMetadata;
  occurredAt?: Date;
};

export type ActivityEvent = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorType: ActivityActorType;
  actorUsername: string | null;
  actorDisplayName: string | null;
  action: string;
  paths: string[];
  operationId: string | null;
  outcome: ActivityOutcome;
  errorCode: string | null;
  metadata: Record<string, unknown>;
};

const SENSITIVE_KEY = /password|secret|token|credential|authorization|cookie|content/i;

function redactMetadata(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactMetadata(item)).filter((item) => item !== undefined);
  if (typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([entryKey, entryValue]) => {
      const safeValue = redactMetadata(entryValue, entryKey);
      return safeValue === undefined ? [] : [[entryKey, safeValue]];
    }),
  );
}

function parseJson<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid activity ${field}`, { cause: error });
  }
}

export function recordActivity(
  database: Database.Database,
  input: ActivityEventInput,
): ActivityEvent {
  const event: ActivityEvent = {
    id: randomUUID(),
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType,
    actorUsername: null,
    actorDisplayName: null,
    action: input.action,
    paths: [...input.paths],
    operationId: input.operationId ?? null,
    outcome: input.outcome,
    errorCode: input.errorCode ?? null,
    metadata: (redactMetadata(input.metadata ?? {}) ?? {}) as Record<string, unknown>,
  };

  database.prepare(`INSERT INTO activity_events
    (id, occurred_at, actor_user_id, actor_type, action, paths_json, operation_id,
      outcome, error_code, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      event.id,
      event.occurredAt,
      event.actorUserId,
      event.actorType,
      event.action,
      JSON.stringify(event.paths),
      event.operationId,
      event.outcome,
      event.errorCode,
      JSON.stringify(event.metadata),
    );
  return event;
}

export function listActivity(
  database: Database.Database,
  options: { limit?: number; before?: Date } = {},
): ActivityEvent[] {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
  const before = options.before?.toISOString() ?? null;
  const rows = database.prepare(`SELECT
      e.id, e.occurred_at, e.actor_user_id, e.actor_type, e.action,
      e.paths_json, e.operation_id, e.outcome, e.error_code, e.metadata_json,
      u.username actor_username, u.display_name actor_display_name
    FROM activity_events e
    LEFT JOIN users u ON u.id = e.actor_user_id
    WHERE (? IS NULL OR e.occurred_at < ?)
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ?`).all(before, before, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    occurredAt: row.occurred_at as string,
    actorUserId: row.actor_user_id as string | null,
    actorType: row.actor_type as ActivityActorType,
    actorUsername: row.actor_username as string | null,
    actorDisplayName: row.actor_display_name as string | null,
    action: row.action as string,
    paths: parseJson<string[]>(row.paths_json as string, "paths"),
    operationId: row.operation_id as string | null,
    outcome: row.outcome as ActivityOutcome,
    errorCode: row.error_code as string | null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json as string, "metadata"),
  }));
}
