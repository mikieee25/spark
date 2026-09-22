import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type OperationState = "pending" | "completed" | "failed" | "recovery_required";
export type FileOperation = Readonly<{
  id: string;
  type: string;
  state: OperationState;
  actorUserId: string | null;
  paths: string[];
  createdAt: string;
  completedAt: string | null;
  errorCode: string | null;
}>;

type OperationInput = { actorUserId: string; type: string; paths: readonly string[]; now?: Date };
type OperationRow = Record<string, unknown>;

function toOperation(row: OperationRow): FileOperation {
  return {
    id: row.id as string,
    type: row.type as string,
    state: row.state as OperationState,
    actorUserId: row.actor_user_id as string | null,
    paths: JSON.parse(row.paths_json as string) as string[],
    createdAt: row.created_at as string,
    completedAt: row.completed_at as string | null,
    errorCode: row.error_code as string | null,
  };
}

export function beginOperation(database: Database.Database, input: OperationInput): FileOperation {
  const operation = {
    id: randomUUID(),
    createdAt: (input.now ?? new Date()).toISOString(),
  };
  database.prepare(`INSERT INTO file_operations
    (id, type, state, actor_user_id, paths_json, created_at)
    VALUES (?, ?, 'pending', ?, ?, ?)`)
    .run(operation.id, input.type, input.actorUserId, JSON.stringify([...input.paths]), operation.createdAt);
  return getOperation(database, operation.id) as FileOperation;
}

export function getOperation(database: Database.Database, id: string): FileOperation | null {
  const row = database.prepare("SELECT * FROM file_operations WHERE id = ?").get(id) as OperationRow | undefined;
  return row ? toOperation(row) : null;
}

export function completeOperation(database: Database.Database, id: string, now = new Date()): void {
  database.prepare("UPDATE file_operations SET state = 'completed', completed_at = ?, error_code = NULL WHERE id = ? AND state = 'pending'")
    .run(now.toISOString(), id);
}

export function failOperation(database: Database.Database, id: string, errorCode: string, now = new Date()): void {
  database.prepare("UPDATE file_operations SET state = 'failed', completed_at = ?, error_code = ? WHERE id = ? AND state = 'pending'")
    .run(now.toISOString(), errorCode, id);
}

export function listIncompleteOperations(database: Database.Database): FileOperation[] {
  return (database.prepare("SELECT * FROM file_operations WHERE state = 'pending' ORDER BY created_at, id").all() as OperationRow[]).map(toOperation);
}

export async function withPathLocks<T>(
  database: Database.Database,
  operation: FileOperation,
  paths: readonly string[],
  callback: () => Promise<T>,
): Promise<T> {
  const ordered = [...new Set(paths)].sort();
  try {
    database.transaction(() => {
      const statement = database.prepare("INSERT INTO operation_path_locks(path, operation_id, created_at) VALUES (?, ?, ?)");
      const now = new Date().toISOString();
      for (const path of ordered) statement.run(path, operation.id, now);
    })();
  } catch (error) {
    throw new Error("PATH_LOCKED", { cause: error });
  }
  try {
    return await callback();
  } finally {
    database.prepare("DELETE FROM operation_path_locks WHERE operation_id = ?").run(operation.id);
  }
}
