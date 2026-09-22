import type Database from "better-sqlite3";
import { loadConfig } from "@/lib/config/load-config";
import { openDatabase } from "./database";
import { migrate } from "./migrations";
import { reconcileStorageOperations } from "@/features/files/recovery-service";

let instance: Database.Database | undefined;

export function getDatabase(): Database.Database {
  if (!instance) {
    const config = loadConfig();
    instance = openDatabase(config.databasePath);
    migrate(instance);
    reconcileStorageOperations(instance);
  }
  return instance;
}
