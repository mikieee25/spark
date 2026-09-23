import { getCurrentUser } from "@/features/auth/request-auth";
import { getDatabase } from "@/lib/db/runtime";
import { loadConfig } from "@/lib/config/load-config";
import { createFileService } from "./file-service";
import { createStorageAdapter } from "./storage-adapter";
import { runRecycleMaintenance } from "@/features/recycle/retention-service";
import { runIndexMaintenance } from "@/features/discovery/indexer";
import { getIndexState } from "@/features/discovery/discovery-repository";
import { getRetentionDays } from "@/features/admin/settings-repository";
import { waitForFolderReadQuietPeriod } from "@/features/discovery/folder-read-priority";

let maintenanceStarted = false;
let storageRuntime: Readonly<{ filesRoot: string; dataDirectory: string; storage: ReturnType<typeof createStorageAdapter> }> | null = null;

export function getFileStorage() {
  const config = loadConfig();
  if (storageRuntime?.filesRoot === config.filesRoot && storageRuntime.dataDirectory === config.dataDirectory) return storageRuntime.storage;
  const storage = createStorageAdapter({ filesRoot: config.filesRoot, dataDirectory: config.dataDirectory });
  storageRuntime = { filesRoot: config.filesRoot, dataDirectory: config.dataDirectory, storage };
  return storage;
}

export function getFileService() {
  const database = getDatabase();
  const storage = getFileStorage();
  if (!maintenanceStarted) {
    maintenanceStarted = true;
    void runRecycleMaintenance(database, storage).catch((error) => console.error("SPARK recycle maintenance failed", error));
    void continueIndexMaintenance(database, storage);
  }
  return createFileService({ database, storage, retentionDays: getRetentionDays(database) });
}

async function continueIndexMaintenance(database: ReturnType<typeof getDatabase>, storage: ReturnType<typeof getFileStorage>): Promise<void> {
  await waitForFolderReadQuietPeriod(2_000);
  for (;;) {
    try {
      const result = await runIndexMaintenance({ database, storage, maxEntries: 100 });
      if (result.completed) return;
      const state = getIndexState(database);
      if (state.status === "error") {
        console.error("SPARK index maintenance failed", state.error);
        return;
      }
      await waitForFolderReadQuietPeriod(250);
    } catch (error) {
      console.error("SPARK index maintenance failed", error);
      return;
    }
  }
}

export { getCurrentUser };
