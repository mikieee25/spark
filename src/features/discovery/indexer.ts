import type Database from "better-sqlite3";
import { getIndexEntry, MAX_INDEXED_TEXT_BYTES, replaceIndexEntry, replaceIndexText, updateIndexState } from "./discovery-repository";
import { classifyContent } from "./content-classifier";
import type { StorageAdapter, StorageEntry } from "@/features/files/storage-adapter";
import { waitForFolderReadsToFinish } from "./folder-read-priority";

type IndexerOptions = Readonly<{ database: Database.Database; storage: StorageAdapter; maxEntries?: number }>;
type IndexRun = Readonly<{ processed: number; completed: boolean }>;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function nextEntries(storage: StorageAdapter, cursor: string | null, limit: number): Promise<{ entries: StorageEntry[]; complete: boolean }> {
  const entries: StorageEntry[] = [];
  async function visit(parentPath: string): Promise<boolean> {
    await waitForFolderReadsToFinish();
    const children = (await storage.list(parentPath, { cache: false })).sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
    for (const entry of children) {
      if (entries.length >= limit) return false;
      const beforeCursor = cursor && entry.logicalPath < cursor;
      const atCursor = cursor && entry.logicalPath === cursor;
      const inCursorSubtree = cursor && entry.kind === "folder" && cursor.startsWith(`${entry.logicalPath}/`);
      if (!beforeCursor && !atCursor) entries.push(entry);
      if (entry.kind === "folder" && (inCursorSubtree || !cursor || atCursor || !beforeCursor)) {
        if (!(await visit(entry.logicalPath))) return false;
      }
    }
    return true;
  }
  return { entries, complete: await visit("") };
}

export async function runIndexMaintenance({ database, storage, maxEntries = 100 }: IndexerOptions): Promise<IndexRun> {
  const limit = Math.max(1, Math.floor(maxEntries));
  const row = database.prepare("SELECT generation, cursor, status FROM file_index_state WHERE id = 1").get() as { generation: number; cursor: string | null; status: string };
  const generation = row.status === "idle" ? row.generation + 1 : row.generation;
  const cursor = row.status === "idle" ? null : row.cursor;
  let checkpoint = cursor;
  updateIndexState(database, { generation, cursor, status: "running", error: null });

  try {
    await waitForFolderReadsToFinish();
    const { entries: pending, complete } = await nextEntries(storage, cursor, limit);
    for (const entry of pending) {
      await waitForFolderReadsToFinish();
      // Index updates use synchronous SQLite statements. Yield before each
      // entry so HTTP requests can enter the event loop between writes instead
      // of waiting for an entire batch to finish.
      await yieldToEventLoop();
      const classification = classifyContent(entry.name);
      const indexedAt = new Date().toISOString();
      const parentPath = entry.logicalPath.includes("/") ? entry.logicalPath.slice(0, entry.logicalPath.lastIndexOf("/")) : "";
      const textIndexed = entry.kind === "file" && classification.text && entry.sizeBytes <= MAX_INDEXED_TEXT_BYTES;
      const previous = getIndexEntry(database, entry.logicalPath);
      const contentUnchanged = previous?.kind === entry.kind
        && previous.sizeBytes === entry.sizeBytes
        && previous.modifiedAt === entry.modifiedAt
        && previous.extension === classification.extension
        && previous.mimeType === classification.mimeType
        && previous.textIndexed === textIndexed;
      replaceIndexEntry(database, {
        logicalPath: entry.logicalPath, parentPath, name: entry.name, kind: entry.kind,
        sizeBytes: entry.sizeBytes, modifiedAt: entry.modifiedAt, extension: classification.extension,
        mimeType: classification.mimeType, textIndexed, generation, indexedAt,
      });
      if (textIndexed && !contentUnchanged) {
        await waitForFolderReadsToFinish();
        const text = (await storage.readFile(entry.logicalPath)).subarray(0, MAX_INDEXED_TEXT_BYTES).toString("utf8");
        replaceIndexText(database, entry.logicalPath, text);
      }
      checkpoint = entry.logicalPath;
      updateIndexState(database, { generation, cursor: checkpoint, status: "running", error: null });
    }

    if (complete) {
      database.transaction(() => {
        database.prepare("DELETE FROM file_index_entries WHERE generation <> ?").run(generation);
        database.prepare("DELETE FROM file_index_fts WHERE logical_path NOT IN (SELECT logical_path FROM file_index_entries)").run();
        updateIndexState(database, { generation, cursor: null, status: "idle", error: null });
      })();
      return { processed: pending.length, completed: true };
    }
    return { processed: pending.length, completed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateIndexState(database, { generation, cursor: checkpoint ?? (row.status === "idle" ? null : row.cursor), status: "error", error: message });
    return { processed: 0, completed: false };
  }
}
