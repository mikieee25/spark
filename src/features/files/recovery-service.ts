import type Database from "better-sqlite3";
import { recordActivity } from "@/features/activity/activity-repository";
import { listIncompleteOperations } from "./operation-repository";

export function reconcileStorageOperations(database: Database.Database): {
  flaggedOperationIds: string[];
} {
  const pending = listIncompleteOperations(database);
  const flaggedOperationIds = pending.map((operation) => operation.id);
  database.transaction(() => {
    database.prepare("DELETE FROM operation_path_locks").run();
    database
      .prepare(
        `UPDATE file_operations
      SET state = 'recovery_required', completed_at = ?, error_code = 'RESTART_RECOVERY_REQUIRED'
      WHERE state = 'pending'`
      )
      .run(new Date().toISOString());
    for (const operation of pending) {
      recordActivity(database, {
        actorType: "system",
        action: "operation_recovery_required",
        paths: operation.paths,
        operationId: operation.id,
        outcome: "failure",
        errorCode: "RESTART_RECOVERY_REQUIRED",
      });
    }
  })();
  return { flaggedOperationIds };
}
