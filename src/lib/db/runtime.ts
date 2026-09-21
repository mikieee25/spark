import type Database from "better-sqlite3";
import { loadConfig } from "@/lib/config/load-config";
import { openDatabase } from "./database";
import { migrate } from "./migrations";

let instance: Database.Database | undefined;

export function getDatabase(): Database.Database {
  if (!instance) {
    const config = loadConfig();
    instance = openDatabase(config.databasePath);
    migrate(instance);
  }
  return instance;
}
