import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDatabase(databasePath: string): Database.Database {
  try {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    return database;
  } catch (error) {
    throw new Error(`Unable to open SPARK database at ${databasePath}`, { cause: error });
  }
}
