import type Database from "better-sqlite3";
import type {
  Favorite,
  IndexEntry,
  IndexState,
  IndexStateStatus,
  RecentItem,
} from "./types";

type Row = Record<string, unknown>;
export const MAX_INDEXED_TEXT_BYTES = 256 * 1024;

function toFavorite(row: Row): Favorite {
  return {
    userId: row.user_id as string,
    logicalPath: row.logical_path as string,
    createdAt: row.created_at as string,
  };
}

function toRecent(row: Row): RecentItem {
  return {
    userId: row.user_id as string,
    logicalPath: row.logical_path as string,
    accessedAt: row.accessed_at as string,
  };
}

const entryColumns = `logical_path, parent_path, name, kind, size_bytes, modified_at,
  extension, mime_type, text_indexed, generation, indexed_at`;

function toEntry(row: Row): IndexEntry {
  return {
    logicalPath: row.logical_path as string,
    parentPath: row.parent_path as string,
    name: row.name as string,
    kind: row.kind as IndexEntry["kind"],
    sizeBytes: row.size_bytes as number,
    modifiedAt: row.modified_at as string,
    extension: row.extension as string,
    mimeType: row.mime_type as string,
    textIndexed: Boolean(row.text_indexed),
    generation: row.generation as number,
    indexedAt: row.indexed_at as string,
  };
}

export function replaceIndexEntry(
  database: Database.Database,
  entry: IndexEntry
): IndexEntry {
  const indexed = database
    .prepare("SELECT text_content FROM file_index_fts WHERE logical_path = ?")
    .get(entry.logicalPath) as { text_content: string } | undefined;
  database
    .prepare(
      `INSERT INTO file_index_entries (${entryColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(logical_path) DO UPDATE SET parent_path=excluded.parent_path, name=excluded.name,
      kind=excluded.kind, size_bytes=excluded.size_bytes, modified_at=excluded.modified_at,
      extension=excluded.extension, mime_type=excluded.mime_type, text_indexed=excluded.text_indexed,
      generation=excluded.generation, indexed_at=excluded.indexed_at`
    )
    .run(
      entry.logicalPath,
      entry.parentPath,
      entry.name,
      entry.kind,
      entry.sizeBytes,
      entry.modifiedAt,
      entry.extension,
      entry.mimeType,
      entry.textIndexed ? 1 : 0,
      entry.generation,
      entry.indexedAt
    );
  database
    .prepare("DELETE FROM file_index_fts WHERE logical_path = ?")
    .run(entry.logicalPath);
  database
    .prepare(
      "INSERT INTO file_index_fts(logical_path, name, text_content) VALUES (?, ?, ?)"
    )
    .run(
      entry.logicalPath,
      entry.name,
      entry.textIndexed ? (indexed?.text_content ?? "") : ""
    );
  return entry;
}

export function getIndexEntry(
  database: Database.Database,
  logicalPath: string
): IndexEntry | null {
  const row = database
    .prepare(
      `SELECT ${entryColumns} FROM file_index_entries WHERE logical_path = ?`
    )
    .get(logicalPath) as Row | undefined;
  return row ? toEntry(row) : null;
}

export function deleteIndexEntry(
  database: Database.Database,
  logicalPath: string
): void {
  database
    .prepare("DELETE FROM file_index_entries WHERE logical_path = ?")
    .run(logicalPath);
  database
    .prepare("DELETE FROM file_index_fts WHERE logical_path = ?")
    .run(logicalPath);
}

export function replaceIndexText(
  database: Database.Database,
  logicalPath: string,
  textContent: string
): void {
  const entry = getIndexEntry(database, logicalPath);
  if (!entry) throw new Error(`INDEX_ENTRY_NOT_FOUND: ${logicalPath}`);
  if (Buffer.byteLength(textContent, "utf8") > MAX_INDEXED_TEXT_BYTES)
    throw new Error("INDEX_TEXT_TOO_LARGE");
  database
    .prepare("DELETE FROM file_index_fts WHERE logical_path = ?")
    .run(logicalPath);
  database
    .prepare(
      "INSERT INTO file_index_fts(logical_path, name, text_content) VALUES (?, ?, ?)"
    )
    .run(logicalPath, entry.name, textContent);
}

export function getIndexState(database: Database.Database): IndexState {
  const row = database
    .prepare(
      "SELECT generation, cursor, status, error, updated_at FROM file_index_state WHERE id = 1"
    )
    .get() as Row;
  return {
    generation: row.generation as number,
    cursor: row.cursor as string | null,
    status: row.status as IndexStateStatus,
    error: row.error as string | null,
    updatedAt: row.updated_at as string,
  };
}

export function updateIndexState(
  database: Database.Database,
  state: Pick<IndexState, "generation" | "cursor" | "status" | "error">
): IndexState {
  database
    .prepare(
      "UPDATE file_index_state SET generation = ?, cursor = ?, status = ?, error = ?, updated_at = ? WHERE id = 1"
    )
    .run(
      state.generation,
      state.cursor,
      state.status,
      state.error,
      new Date().toISOString()
    );
  return getIndexState(database);
}

export function addFavorite(
  database: Database.Database,
  userId: string,
  logicalPath: string,
  createdAt = new Date().toISOString()
): Favorite {
  database
    .prepare(
      "INSERT INTO user_favorites(user_id, logical_path, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, logical_path) DO NOTHING"
    )
    .run(userId, logicalPath, createdAt);
  return toFavorite(
    database
      .prepare(
        "SELECT user_id, logical_path, created_at FROM user_favorites WHERE user_id = ? AND logical_path = ?"
      )
      .get(userId, logicalPath) as Row
  );
}

export function removeFavorite(
  database: Database.Database,
  userId: string,
  logicalPath: string
): void {
  database
    .prepare(
      "DELETE FROM user_favorites WHERE user_id = ? AND logical_path = ?"
    )
    .run(userId, logicalPath);
}

export function listFavorites(
  database: Database.Database,
  userId: string
): Favorite[] {
  return (
    database
      .prepare(
        "SELECT user_id, logical_path, created_at FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC, logical_path ASC"
      )
      .all(userId) as Row[]
  ).map(toFavorite);
}

export function addRecentItem(
  database: Database.Database,
  userId: string,
  logicalPath: string,
  accessedAt = new Date().toISOString()
): RecentItem | null {
  if (!logicalPath) return null;
  database
    .prepare(
      "INSERT INTO user_recent_items(user_id, logical_path, accessed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, logical_path) DO UPDATE SET accessed_at = excluded.accessed_at"
    )
    .run(userId, logicalPath, accessedAt);
  database
    .prepare(
      `DELETE FROM user_recent_items
    WHERE user_id = ? AND logical_path NOT IN (
      SELECT logical_path FROM user_recent_items WHERE user_id = ?
      ORDER BY accessed_at DESC, logical_path ASC LIMIT 50
    )`
    )
    .run(userId, userId);
  return toRecent(
    database
      .prepare(
        "SELECT user_id, logical_path, accessed_at FROM user_recent_items WHERE user_id = ? AND logical_path = ?"
      )
      .get(userId, logicalPath) as Row
  );
}

export function listRecentItems(
  database: Database.Database,
  userId: string,
  limit = 50
): RecentItem[] {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return (
    database
      .prepare(
        "SELECT user_id, logical_path, accessed_at FROM user_recent_items WHERE user_id = ? AND logical_path <> '' ORDER BY accessed_at DESC, logical_path ASC LIMIT ?"
      )
      .all(userId, boundedLimit) as Row[]
  ).map(toRecent);
}
