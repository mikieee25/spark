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
