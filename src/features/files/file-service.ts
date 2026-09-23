import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { recordActivity } from "@/features/activity/activity-repository";
import {
  createRecycleEntry,
  getRecycleEntry,
  purgeRecycleEntry,
  restoreRecycleEntry,
} from "@/features/recycle/recycle-repository";
import { listRecycleEntries } from "@/features/recycle/recycle-repository";
import { runRecycleMaintenance } from "@/features/recycle/retention-service";
import { beginOperation, completeOperation, failOperation, withPathLocks, type FileOperation } from "./operation-repository";
import { normalizeLogicalPath, validateName } from "./path-policy";
import type { StorageAdapter, StorageEntry, StorageListOptions } from "./storage-adapter";
import { beginFolderRead } from "@/features/discovery/folder-read-priority";

export type FileActor = Readonly<{ id: string; role: "user" | "admin" }>;
export type ConflictPolicy = "fail" | "replace" | "rename" | "skip";
type Dependencies = Readonly<{ database: Database.Database; storage: StorageAdapter; retentionDays?: number }>;
type UploadInput = { directory: string; name: string; bytes: Uint8Array; conflict?: ConflictPolicy };

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "FILESYSTEM_ERROR";
}

function parseExtension(name: string): { stem: string; extension: string } {
  const extension = path.extname(name);
  return { stem: extension ? name.slice(0, -extension.length) : name, extension };
}

async function withConflict(
  storage: StorageAdapter,
  destination: string,
  policy: ConflictPolicy = "fail",
): Promise<string | null> {
  if (!(await storage.exists(destination))) return destination;
  if (policy === "fail") throw new Error("CONFLICT");
  if (policy === "skip") return null;
  if (policy === "replace") return destination;
  const name = path.posix.basename(destination);
  const directory = path.posix.dirname(destination);
  const { stem, extension } = parseExtension(name);
  for (let index = 1; index < 10_000; index += 1) {
    const candidateName = `${stem} (${index})${extension}`;
    const candidate = directory === "." ? candidateName : `${directory}/${candidateName}`;
    if (!(await storage.exists(candidate))) return candidate;
  }
  throw new Error("CONFLICT_LIMIT");
}

export function listFileVersions(database: Database.Database, originalPath: string): Array<{ id: string; originalPath: string; storageKey: string; sizeBytes: number; createdAt: string }> {
  const rows = database.prepare(`SELECT id, original_path, storage_key, size_bytes, created_at
    FROM file_versions WHERE original_path = ? ORDER BY created_at DESC, id DESC`).all(originalPath) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.id as string,
    originalPath: row.original_path as string,
    storageKey: row.storage_key as string,
    sizeBytes: row.size_bytes as number,
    createdAt: row.created_at as string,
  }));
}

export function createFileService({ database, storage, retentionDays = 30 }: Dependencies) {
  async function captureVersion(operation: FileOperation, actor: FileActor, originalPath: string): Promise<void> {
    const current = await storage.stat(originalPath);
    const storageKey = `${operation.id}-${randomUUID()}`;
    await storage.moveToVersion(originalPath, storageKey);
    database.prepare(`INSERT INTO file_versions
      (id, original_path, storage_key, size_bytes, created_at, created_by, operation_id, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), originalPath, storageKey, current.sizeBytes, new Date().toISOString(), actor.id, operation.id, "{}");
  }

  async function run<T>(actor: FileActor, type: string, paths: string[], callback: (operation: FileOperation) => Promise<T>): Promise<T> {
    const operation = beginOperation(database, { actorUserId: actor.id, type, paths });
    try {
      return await withPathLocks(database, operation, paths, async () => {
        const result = await callback(operation);
        completeOperation(database, operation.id);
        return result;
      });
    } catch (error) {
      failOperation(database, operation.id, errorCode(error));
      recordActivity(database, {
        actorUserId: actor.id,
        actorType: "user",
        action: type,
        paths,
        operationId: operation.id,
        outcome: "failure",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }

  return {
    async createFolder(actor: FileActor, input: { path: string }) {
      const target = normalizeLogicalPath(input.path);
      return run(actor, "folder_create", [target], async (operation) => {
        if (await storage.exists(target)) throw new Error("CONFLICT");
        await storage.createDirectory(target);
        const item = await storage.stat(target);
        recordActivity(database, { actorUserId: actor.id, actorType: "user", action: "folder_create", paths: [target], operationId: operation.id, outcome: "success" });
        return { operationId: operation.id, item };
      });
    },
    async uploadFile(actor: FileActor, input: UploadInput) {
      const directory = normalizeLogicalPath(input.directory);
      validateName(input.name);
      const initial = directory ? `${directory}/${input.name}` : input.name;
      return run(actor, "file_upload", [initial], async (operation) => {
        const parent = await storage.stat(directory);
        if (parent.kind !== "folder") throw new Error("NOT_A_DIRECTORY");
        const destination = await withConflict(storage, initial, input.conflict);
        if (!destination) return { operationId: operation.id, skipped: true } as const;
        if (destination === initial && input.conflict === "replace") await captureVersion(operation, actor, destination);
        const staged = await storage.stageUpload(input.name, input.bytes);
        await storage.commitStagedFile(staged, destination);
        const item = await storage.stat(destination);
        recordActivity(database, { actorUserId: actor.id, actorType: "user", action: "file_upload", paths: [destination], operationId: operation.id, outcome: "success" });
        return { operationId: operation.id, item };
      });
    },
    async moveFile(actor: FileActor, input: { source: string; destination: string; conflict?: ConflictPolicy }) {
      const source = normalizeLogicalPath(input.source);
      const requestedDestination = normalizeLogicalPath(input.destination);
      return run(actor, "file_move", [source, requestedDestination], async (operation) => {
        const sourceItem = await storage.stat(source);
        if (source === requestedDestination || (sourceItem.kind === "folder" && requestedDestination.startsWith(`${source}/`))) {
          throw new Error("INVALID_DESTINATION");
        }
        const destination = await withConflict(storage, requestedDestination, input.conflict);
        if (!destination) return { operationId: operation.id, skipped: true } as const;
        if (destination === requestedDestination && input.conflict === "replace") await captureVersion(operation, actor, destination);
        const parent = path.posix.dirname(destination);
        const parentItem = await storage.stat(parent === "." ? "" : parent);
        if (parentItem.kind !== "folder") throw new Error("NOT_A_DIRECTORY");
        await storage.move(source, destination);
        const item = await storage.stat(destination);
        recordActivity(database, { actorUserId: actor.id, actorType: "user", action: "file_move", paths: [source, destination], operationId: operation.id, outcome: "success" });
        return { operationId: operation.id, item, source: sourceItem };
      });
    },
    async deleteToRecycle(actor: FileActor, input: { path: string }) {
      const originalPath = normalizeLogicalPath(input.path);
      return run(actor, "file_delete", [originalPath], async (operation) => {
        const item = await storage.stat(originalPath);
        const storageKey = `${randomUUID()}`;
        await storage.moveToPrivate(originalPath, storageKey);
        const entry = createRecycleEntry(database, {
          originalPath,
          storageKey,
          itemType: item.kind,
          sizeBytes: item.sizeBytes,
          deletedBy: actor.id,
          operationId: operation.id,
          expiresAt: new Date(Date.now() + retentionDays * 86_400_000),
        });
        recordActivity(database, { actorUserId: actor.id, actorType: "user", action: "file_delete", paths: [originalPath], operationId: operation.id, outcome: "success" });
        return entry;
      });
    },
    async restoreFromRecycle(actor: FileActor, input: { id: string; conflict?: ConflictPolicy }) {
      const entry = getRecycleEntry(database, input.id);
      if (!entry || entry.state !== "active") throw new Error("RECYCLE_ENTRY_NOT_ACTIVE");
      const destination = await withConflict(storage, entry.originalPath, input.conflict);
      if (!destination) return { operationId: null, skipped: true } as const;
      return run(actor, "file_restore", [entry.originalPath], async (operation) => {
        if (destination === entry.originalPath && input.conflict === "replace") await captureVersion(operation, actor, destination);
        await storage.restoreFromPrivate(entry.storageKey, destination);
        const restored = restoreRecycleEntry(database, entry.id, actor.id);
        recordActivity(database, { actorUserId: actor.id, actorType: "user", action: "file_restore", paths: [destination], operationId: operation.id, outcome: "success" });
        return { operationId: operation.id, entry: restored };
      });
    },
    async purgeRecycleContent(actor: FileActor, id: string) {
      if (actor.role !== "admin") throw new Error("ADMIN_REQUIRED");
      const entry = getRecycleEntry(database, id);
      if (!entry || !["active", "expired"].includes(entry.state)) throw new Error("RECYCLE_ENTRY_NOT_PURGEABLE");
      return run(actor, "recycle_purge", [entry.originalPath], async (operation) => {
        await storage.removePrivate(entry.storageKey);
        const purged = purgeRecycleEntry(database, entry.id, actor);
        return { operationId: operation.id, entry: purged };
      });
    },
    listRecycleEntries() {
      return listRecycleEntries(database);
    },
    runMaintenance() {
      return runRecycleMaintenance(database, storage);
    },
    async list(pathName: string, options?: StorageListOptions): Promise<StorageEntry[]> {
      const release = beginFolderRead();
      try { return await storage.list(normalizeLogicalPath(pathName), options); }
      finally { release(); }
    },
  };
}
