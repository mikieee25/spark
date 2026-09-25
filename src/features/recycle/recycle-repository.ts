import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordActivity } from "@/features/activity/activity-repository";

export type RecycleItemType = "file" | "folder";
export type RecycleState = "active" | "restored" | "expired" | "purged";
export type RecycleActor = { id: string; role: "user" | "admin" };

export type RecycleEntryInput = {
  originalPath: string;
  storageKey: string;
  itemType: RecycleItemType;
  sizeBytes: number;
  deletedBy: string;
  operationId?: string | null;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type RecycleEntry = {
  id: string;
  originalPath: string;
  storageKey: string;
  itemType: RecycleItemType;
  sizeBytes: number;
  deletedAt: string;
  expiresAt: string;
  deletedBy: string | null;
  operationId: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  expiredAt: string | null;
  purgedAt: string | null;
  purgedBy: string | null;
  metadata: Record<string, unknown>;
  state: RecycleState;
};

type RecycleRow = Record<string, unknown>;

function parseMetadata(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}

function stateOf(row: RecycleRow): RecycleState {
  if (row.restored_at) return "restored";
  if (row.expired_at) return "expired";
  if (row.purged_at) return "purged";
  return "active";
}

function toEntry(row: RecycleRow): RecycleEntry {
  return {
    id: row.id as string,
    originalPath: row.original_path as string,
    storageKey: row.storage_key as string,
    itemType: row.item_type as RecycleItemType,
    sizeBytes: row.size_bytes as number,
    deletedAt: row.deleted_at as string,
    expiresAt: row.expires_at as string,
    deletedBy: row.deleted_by as string | null,
    operationId: row.operation_id as string | null,
    restoredAt: row.restored_at as string | null,
    restoredBy: row.restored_by as string | null,
    expiredAt: row.expired_at as string | null,
    purgedAt: row.purged_at as string | null,
    purgedBy: row.purged_by as string | null,
    metadata: parseMetadata(row.metadata_json as string),
    state: stateOf(row),
  };
}

export function getRecycleEntry(
  database: Database.Database,
  id: string
): RecycleEntry | null {
  const row = database
    .prepare("SELECT * FROM recycle_entries WHERE id = ?")
    .get(id) as RecycleRow | undefined;
  return row ? toEntry(row) : null;
}

export function createRecycleEntry(
  database: Database.Database,
  input: RecycleEntryInput
): RecycleEntry {
  const id = randomUUID();
  const deletedAt = (input.occurredAt ?? new Date()).toISOString();
  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO recycle_entries
      (id, original_path, storage_key, item_type, size_bytes, deleted_at, expires_at,
        deleted_by, operation_id, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.originalPath,
        input.storageKey,
        input.itemType,
        input.sizeBytes,
        deletedAt,
        input.expiresAt.toISOString(),
        input.deletedBy,
        input.operationId ?? null,
        JSON.stringify(input.metadata ?? {})
      );
    recordActivity(database, {
      actorUserId: input.deletedBy,
      actorType: "user",
      action: "recycle_registered",
      paths: [input.originalPath],
      operationId: input.operationId,
      outcome: "success",
      occurredAt: input.occurredAt,
    });
  })();
  return getRecycleEntry(database, id) as RecycleEntry;
}

export function listRecycleEntries(
  database: Database.Database,
  options: { includeFinalized?: boolean } = {}
): RecycleEntry[] {
  const where = options.includeFinalized
    ? ""
    : "WHERE restored_at IS NULL AND expired_at IS NULL AND purged_at IS NULL";
  const rows = database
    .prepare(
      `SELECT * FROM recycle_entries ${where} ORDER BY deleted_at DESC, id DESC`
    )
    .all() as RecycleRow[];
  return rows.map(toEntry);
}

export function restoreRecycleEntry(
  database: Database.Database,
  id: string,
  actorUserId: string,
  now = new Date()
): RecycleEntry {
  const entry = getRecycleEntry(database, id);
  if (!entry || entry.state !== "active")
    throw new Error("RECYCLE_ENTRY_NOT_ACTIVE");
  database.transaction(() => {
    database
      .prepare(
        "UPDATE recycle_entries SET restored_at = ?, restored_by = ? WHERE id = ?"
      )
      .run(now.toISOString(), actorUserId, id);
    recordActivity(database, {
      actorUserId,
      actorType: "user",
      action: "recycle_restore",
      paths: [entry.originalPath],
      operationId: entry.operationId,
      outcome: "success",
      occurredAt: now,
    });
  })();
  return getRecycleEntry(database, id) as RecycleEntry;
}

export function purgeRecycleEntry(
  database: Database.Database,
  id: string,
  actor: RecycleActor,
  now = new Date()
): RecycleEntry {
  if (actor.role !== "admin") throw new Error("ADMIN_REQUIRED");
  const entry = getRecycleEntry(database, id);
  if (!entry || !["active", "expired"].includes(entry.state)) {
    throw new Error("RECYCLE_ENTRY_NOT_PURGEABLE");
  }
  database.transaction(() => {
    database
      .prepare(
        "UPDATE recycle_entries SET purged_at = ?, purged_by = ? WHERE id = ?"
      )
      .run(now.toISOString(), actor.id, id);
    recordActivity(database, {
      actorUserId: actor.id,
      actorType: "user",
      action: "recycle_purge",
      paths: [entry.originalPath],
      operationId: entry.operationId,
      outcome: "success",
      occurredAt: now,
    });
  })();
  return getRecycleEntry(database, id) as RecycleEntry;
}

export function expireRecycleEntries(
  database: Database.Database,
  now = new Date()
): RecycleEntry[] {
  const rows = database
    .prepare(
      `SELECT * FROM recycle_entries
    WHERE restored_at IS NULL AND expired_at IS NULL AND purged_at IS NULL AND expires_at <= ?`
    )
    .all(now.toISOString()) as RecycleRow[];
  const expired: RecycleEntry[] = [];
  database.transaction(() => {
    for (const row of rows) {
      const entry = toEntry(row);
      database
        .prepare("UPDATE recycle_entries SET expired_at = ? WHERE id = ?")
        .run(now.toISOString(), entry.id);
      recordActivity(database, {
        actorType: "system",
        action: "recycle_expire",
        paths: [entry.originalPath],
        operationId: entry.operationId,
        outcome: "success",
        occurredAt: now,
      });
      expired.push(getRecycleEntry(database, entry.id) as RecycleEntry);
    }
  })();
  return expired;
}
