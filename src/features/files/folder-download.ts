import path from "node:path";
import { zipSync } from "fflate";
import { normalizeLogicalPath } from "./path-policy";
import type { StorageAdapter } from "./storage-adapter";

export const MAX_FOLDER_ARCHIVE_FILES = 10_000;
export const MAX_FOLDER_ARCHIVE_BYTES = 256 * 1024 * 1024;

function relativeArchivePath(root: string, logicalPath: string): string {
  if (root && logicalPath !== root && !logicalPath.startsWith(`${root}/`)) throw new Error("INVALID_ARCHIVE_PATH");
  const relative = root ? (logicalPath === root ? "" : logicalPath.slice(root.length + 1)) : logicalPath;
  if (!relative || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("INVALID_ARCHIVE_PATH");
  return relative;
}

export async function createFolderArchive(storage: StorageAdapter, logicalPath: string): Promise<{ body: Buffer; filename: string }> {
  const root = normalizeLogicalPath(logicalPath);
  const rootStat = await storage.stat(root);
  if (rootStat.kind !== "folder") throw new Error("NOT_A_DIRECTORY");
  const files = Object.create(null) as Record<string, Uint8Array>;
  let totalBytes = 0;

  async function collect(directory: string): Promise<void> {
    for (const entry of await storage.list(directory)) {
      if (entry.kind === "folder") {
        await collect(entry.logicalPath);
        continue;
      }
      if (Object.keys(files).length >= MAX_FOLDER_ARCHIVE_FILES) throw new Error("ARCHIVE_TOO_LARGE");
      totalBytes += entry.sizeBytes;
      if (totalBytes > MAX_FOLDER_ARCHIVE_BYTES) throw new Error("ARCHIVE_TOO_LARGE");
      files[relativeArchivePath(root, entry.logicalPath)] = await storage.readFile(entry.logicalPath);
    }
  }

  await collect(root);
  const name = root ? `${path.posix.basename(root)}.zip` : "spark-files.zip";
  return { body: Buffer.from(zipSync(files, { level: 0 })), filename: name };
}

export async function createSelectionArchive(storage: StorageAdapter, logicalPaths: readonly string[]): Promise<{ body: Buffer; filename: string }> {
  const paths = logicalPaths.map(normalizeLogicalPath).sort();
  const selected = new Set(paths);
  const overlaps = selected.size !== paths.length || paths.some((logicalPath) => {
    let separator = logicalPath.lastIndexOf("/");
    while (separator >= 0) {
      if (selected.has(logicalPath.slice(0, separator))) return true;
      separator = logicalPath.lastIndexOf("/", separator - 1);
    }
    return false;
  });
  if (!paths.length || paths.some((logicalPath) => !logicalPath) || overlaps) {
    throw new Error("INVALID_SELECTION");
  }

  const files = Object.create(null) as Record<string, Uint8Array>;
  let totalBytes = 0;

  async function addFile(logicalPath: string, archivePath: string): Promise<void> {
    if (Object.keys(files).length >= MAX_FOLDER_ARCHIVE_FILES) throw new Error("ARCHIVE_TOO_LARGE");
    const bytes = await storage.readFile(logicalPath);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_FOLDER_ARCHIVE_BYTES) throw new Error("ARCHIVE_TOO_LARGE");
    files[archivePath] = bytes;
  }

  async function addFolder(root: string, archiveRoot: string): Promise<void> {
    for (const entry of await storage.list(root)) {
      const relative = relativeArchivePath(root, entry.logicalPath);
      const archivePath = `${archiveRoot}/${relative}`;
      if (entry.kind === "folder") await addFolder(entry.logicalPath, archivePath);
      else await addFile(entry.logicalPath, archivePath);
    }
  }

  for (const logicalPath of paths) {
    const item = await storage.stat(logicalPath);
    const archiveRoot = path.posix.basename(logicalPath);
    if (item.kind === "folder") await addFolder(logicalPath, archiveRoot);
    else await addFile(logicalPath, archiveRoot);
  }

  return { body: Buffer.from(zipSync(files, { level: 0 })), filename: "spark-selected-files.zip" };
}
