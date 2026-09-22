import fs from "node:fs";
import { mkdir, lstat, open, readdir, readFile, realpath, rename, rm, stat as statAsync, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isContained, normalizeLogicalPath, validateName } from "./path-policy";

export type StorageAdapterConfig = Readonly<{ filesRoot: string; dataDirectory: string }>;
export type StorageEntry = Readonly<{ name: string; logicalPath: string; kind: "file" | "folder"; sizeBytes: number; modifiedAt: string }>;
export type StorageStat = StorageEntry;
export type StagedUpload = Readonly<{ key: string; name: string; sizeBytes: number }>;
export const MAX_STORAGE_RANGE_BYTES = 8 * 1024 * 1024;

export type StorageAdapter = Readonly<{
  list(path: string): Promise<StorageEntry[]>;
  stat(path: string): Promise<StorageStat>;
  exists(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  stageUpload(name: string, bytes: Uint8Array): Promise<StagedUpload>;
  commitStagedFile(staged: StagedUpload, destination: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  moveToPrivate(source: string, privateKey: string): Promise<void>;
  moveToVersion(source: string, privateKey: string): Promise<void>;
  restoreFromPrivate(privateKey: string, destination: string): Promise<void>;
  removePrivate(privateKey: string): Promise<void>;
  privateExists(privateKey: string): Promise<boolean>;
  readFile(path: string): Promise<Buffer>;
  readRange(path: string, start: number, end: number): Promise<Buffer>;
  openReadStream(path: string): Promise<fs.ReadStream>;
}>;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function privateKeyPath(dataDirectory: string, area: "staging" | "recycle" | "versions", key: string): string {
  const normalized = key.replaceAll("\\", "/");
  if (!normalized || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("INVALID_PRIVATE_KEY");
  }
  const result = path.resolve(dataDirectory, area, ...normalized.split("/"));
  if (!isContained(path.resolve(dataDirectory, area), result)) throw new Error("INVALID_PRIVATE_KEY");
  return result;
}

export function createStorageAdapter(config: StorageAdapterConfig): StorageAdapter {
  const root = path.resolve(config.filesRoot);
  const dataDirectory = path.resolve(config.dataDirectory);
  function resolveLogical(logicalPath: string): string {
    const normalized = normalizeLogicalPath(logicalPath);
    const candidate = path.resolve(root, ...normalized ? normalized.split("/") : []);
    if (!isContained(root, candidate)) throw new Error("INVALID_PATH");
    return candidate;
  }

  async function assertNoSymlinks(candidate: string): Promise<void> {
    const relative = path.relative(root, candidate);
    const segments = relative ? relative.split(path.sep) : [];
    let current = root;
    const rootStat = await lstat(root);
    if (rootStat.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
    for (const segment of segments) {
      current = path.join(current, segment);
      try {
        const currentStat = await lstat(current);
        if (currentStat.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
      } catch (error) {
        if (isMissing(error)) break;
        throw error;
      }
    }
  }

  async function resolveExisting(logicalPath: string): Promise<string> {
    const candidate = resolveLogical(logicalPath);
    await assertNoSymlinks(candidate);
    return candidate;
  }

  async function openRegular(logicalPath: string): Promise<fs.promises.FileHandle> {
    const target = await resolveExisting(logicalPath);
    const constants = fs.constants as typeof fs.constants & { O_NOFOLLOW?: number };
    const noFollow = constants.O_NOFOLLOW;
    let handle: fs.promises.FileHandle;
    try {
      handle = await open(target, fs.constants.O_RDONLY | (noFollow ?? 0));
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ELOOP") throw new Error("SYMLINK_NOT_ALLOWED");
      throw error;
    }
    try {
      if (!(await handle.stat()).isFile()) throw new Error("UNSUPPORTED_ENTRY");
      if (noFollow === undefined) {
        const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(root), realpath(target)]);
        if (!isContained(canonicalRoot, canonicalTarget)) throw new Error("SYMLINK_NOT_ALLOWED");
      }
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async function ensurePrivate(area: "staging" | "recycle" | "versions", key: string): Promise<string> {
    const target = privateKeyPath(dataDirectory, area, key);
    await mkdir(path.dirname(target), { recursive: true });
    return target;
  }

  async function calculateFolderSizes(logicalPath: string): Promise<Map<string, number>> {
    const totals = new Map<string, number>();

    async function visit(currentLogicalPath: string, currentDirectory?: string): Promise<number> {
      const directory = currentDirectory ?? await resolveExisting(currentLogicalPath);
      const directoryStat = await lstat(directory);
      if (!directoryStat.isDirectory()) throw new Error("NOT_A_DIRECTORY");

      let total = 0;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
        const childPath = path.join(directory, entry.name);
        const childStat = await lstat(childPath);
        if (childStat.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
        const childLogicalPath = normalizeLogicalPath(currentLogicalPath ? `${currentLogicalPath}/${entry.name}` : entry.name);
        if (childStat.isFile()) total += childStat.size;
        else if (childStat.isDirectory()) total += await visit(childLogicalPath, childPath);
      }

      totals.set(normalizeLogicalPath(currentLogicalPath), total);
      return total;
    }

    await visit(logicalPath);
    return totals;
  }

  return {
    async list(logicalPath) {
      const directory = await resolveExisting(logicalPath);
      const directoryStat = await statAsync(directory);
      if (!directoryStat.isDirectory()) throw new Error("NOT_A_DIRECTORY");
      const folderSizes = await calculateFolderSizes(logicalPath);
      const entries = await readdir(directory, { withFileTypes: true });
      const result: StorageEntry[] = [];
      for (const entry of entries) {
        const childPath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
        const childStat = await lstat(childPath);
        if (childStat.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
        if (!childStat.isFile() && !childStat.isDirectory()) continue;
        const childLogical = normalizeLogicalPath(logicalPath ? `${logicalPath}/${entry.name}` : entry.name);
        result.push({
          name: entry.name,
          logicalPath: childLogical,
          kind: childStat.isDirectory() ? "folder" : "file",
          sizeBytes: childStat.isFile() ? childStat.size : folderSizes.get(childLogical) ?? 0,
          modifiedAt: childStat.mtime.toISOString(),
        });
      }
      return result.sort((left, right) => Number(right.kind === "folder") - Number(left.kind === "folder") || left.name.localeCompare(right.name));
    },
    async stat(logicalPath) {
      const target = await resolveExisting(logicalPath);
      const item = await statAsync(target);
      if (!item.isFile() && !item.isDirectory()) throw new Error("UNSUPPORTED_ENTRY");
      const folderSizes = item.isDirectory() ? await calculateFolderSizes(logicalPath) : undefined;
      const normalizedPath = normalizeLogicalPath(logicalPath);
      return {
        name: path.basename(target),
        logicalPath: normalizedPath,
        kind: item.isDirectory() ? "folder" : "file",
        sizeBytes: item.isFile() ? item.size : folderSizes?.get(normalizedPath) ?? 0,
        modifiedAt: item.mtime.toISOString(),
      };
    },
    async exists(logicalPath) {
      try {
        await statAsync(await resolveExisting(logicalPath));
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    async createDirectory(logicalPath) {
      const target = resolveLogical(logicalPath);
      await assertNoSymlinks(path.dirname(target));
      await mkdir(target);
    },
    async stageUpload(name, bytes) {
      validateName(name);
      const key = `${randomUUID()}.upload`;
      const target = await ensurePrivate("staging", key);
      await writeFile(target, bytes, { flag: "wx" });
      return { key, name, sizeBytes: bytes.byteLength };
    },
    async commitStagedFile(staged, destination) {
      const source = privateKeyPath(dataDirectory, "staging", staged.key);
      const target = resolveLogical(destination);
      await assertNoSymlinks(path.dirname(target));
      try {
        await lstat(target);
        throw new Error("CONFLICT");
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await rename(source, target);
    },
    async move(source, destination) {
      const sourcePath = await resolveExisting(source);
      const target = resolveLogical(destination);
      await assertNoSymlinks(path.dirname(target));
      try {
        await lstat(target);
        throw new Error("CONFLICT");
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await rename(sourcePath, target);
    },
    async moveToPrivate(source, privateKey) {
      const sourcePath = await resolveExisting(source);
      const target = await ensurePrivate("recycle", privateKey);
      await rename(sourcePath, target);
    },
    async moveToVersion(source, privateKey) {
      const sourcePath = await resolveExisting(source);
      const target = await ensurePrivate("versions", privateKey);
      await rename(sourcePath, target);
    },
    async restoreFromPrivate(privateKey, destination) {
      const source = privateKeyPath(dataDirectory, "recycle", privateKey);
      const target = resolveLogical(destination);
      await assertNoSymlinks(path.dirname(target));
      try {
        await lstat(target);
        throw new Error("CONFLICT");
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await rename(source, target);
    },
    async removePrivate(privateKey) {
      for (const area of ["recycle", "versions", "staging"] as const) {
        const target = privateKeyPath(dataDirectory, area, privateKey);
        try {
          await rm(target, { recursive: true, force: false });
          return;
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      throw new Error("PRIVATE_ENTRY_NOT_FOUND");
    },
    async privateExists(privateKey) {
      for (const area of ["recycle", "versions", "staging"] as const) {
        try {
          await lstat(privateKeyPath(dataDirectory, area, privateKey));
          return true;
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      return false;
    },
    readFile: async (logicalPath) => readFile(await resolveExisting(logicalPath)),
    async readRange(logicalPath, start, end) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) throw new Error("INVALID_RANGE");
      if (end - start + 1 > MAX_STORAGE_RANGE_BYTES) throw new Error("RANGE_TOO_LARGE");
      const handle = await openRegular(logicalPath);
      try {
        const size = (await handle.stat()).size;
        if (end >= size) throw new Error("RANGE_NOT_SATISFIABLE");
        const output = Buffer.allocUnsafe(end - start + 1);
        let offset = 0;
        while (offset < output.length) {
          const result = await handle.read(output, offset, output.length - offset, start + offset);
          if (!result.bytesRead) throw new Error("RANGE_READ_FAILED");
          offset += result.bytesRead;
        }
        return output;
      } finally {
        await handle.close();
      }
    },
    async openReadStream(logicalPath) {
      const handle = await openRegular(logicalPath);
      return handle.createReadStream();
    },
  };
}
