import type Database from "better-sqlite3";
import { recordActivity } from "@/features/activity/activity-repository";
import { expireRecycleEntries, listRecycleEntries } from "./recycle-repository";

type PrivateStorage = Readonly<{
  removePrivate(privateKey: string): Promise<void>;
}>;

export async function runRecycleMaintenance(
  database: Database.Database,
  storage: PrivateStorage,
  now = new Date()
): Promise<number> {
  expireRecycleEntries(database, now);
  const expired = listRecycleEntries(database, {
    includeFinalized: true,
  }).filter((entry) => entry.state === "expired");
  for (const entry of expired) {
    try {
      await storage.removePrivate(entry.storageKey);
      database.transaction(() => {
        database
          .prepare(
            "UPDATE recycle_entries SET purged_at = ? WHERE id = ? AND purged_at IS NULL"
          )
          .run(now.toISOString(), entry.id);
        recordActivity(database, {
          actorType: "system",
          action: "recycle_retention_purge",
          paths: [entry.originalPath],
          operationId: entry.operationId,
          outcome: "success",
          occurredAt: now,
        });
      })();
    } catch (error) {
      recordActivity(database, {
        actorType: "system",
        action: "recycle_retention_purge",
        paths: [entry.originalPath],
        operationId: entry.operationId,
        outcome: "failure",
        errorCode: "RETENTION_PURGE_FAILED",
        metadata: {
          message: error instanceof Error ? error.message : "unknown",
        },
        occurredAt: now,
      });
    }
  }
  return listRecycleEntries(database, { includeFinalized: true }).filter(
    (entry) => entry.purgedAt === now.toISOString()
  ).length;
}
