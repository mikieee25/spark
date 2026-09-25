import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "@/lib/db/database";

type BackupConfig = Readonly<{ dataDirectory: string; databasePath: string }>;
type Manifest = Readonly<{
  format: 1;
  createdAt: string;
  files: Array<{ path: string; sha256: string }>;
}>;

async function digest(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

async function optionalCopy(source: string, target: string): Promise<void> {
  try {
    await fs.cp(source, target, { recursive: true });
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ))
      throw error;
  }
}

export async function createBackup(
  config: BackupConfig,
  destinationRoot: string,
  now = new Date()
): Promise<string> {
  const sourceData = path.resolve(config.dataDirectory);
  const destination = path.join(
    path.resolve(destinationRoot),
    now.toISOString().replaceAll(/[:.]/g, "-")
  );
  const relative = path.relative(sourceData, destination);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
    throw new Error("BACKUP_MUST_BE_OUTSIDE_DATA");
  await fs.mkdir(destination, { recursive: true });

  const database = openDatabase(config.databasePath);
  database.pragma("wal_checkpoint(TRUNCATE)");
  database.close();
  await fs.copyFile(config.databasePath, path.join(destination, "spark.db"));
  await optionalCopy(
    path.join(sourceData, "recycle"),
    path.join(destination, "recycle")
  );
  await optionalCopy(
    path.join(sourceData, "versions"),
    path.join(destination, "versions")
  );

  const files: Array<{ path: string; sha256: string }> = [];
  async function collect(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await collect(absolute);
      else
        files.push({
          path: path.relative(destination, absolute).replaceAll(path.sep, "/"),
          sha256: await digest(absolute),
        });
    }
  }
  await collect(destination);
  const manifest: Manifest = { format: 1, createdAt: now.toISOString(), files };
  await fs.writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  return destination;
}

export async function verifyBackup(
  backupPath: string
): Promise<{ valid: boolean; files: number }> {
  const manifest = JSON.parse(
    await fs.readFile(path.join(backupPath, "manifest.json"), "utf8")
  ) as Manifest;
  if (manifest.format !== 1 || !Array.isArray(manifest.files))
    throw new Error("INVALID_BACKUP_MANIFEST");
  for (const entry of manifest.files) {
    const absolute = path.resolve(backupPath, ...entry.path.split("/"));
    const relative = path.relative(path.resolve(backupPath), absolute);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      (await digest(absolute)) !== entry.sha256
    )
      return { valid: false, files: manifest.files.length };
  }
  return { valid: true, files: manifest.files.length };
}

export async function restoreBackup(
  backupPath: string,
  targetDataDirectory: string,
  confirmed = false
): Promise<void> {
  if (!confirmed) throw new Error("RESTORE_CONFIRMATION_REQUIRED");
  const verification = await verifyBackup(backupPath);
  if (!verification.valid) throw new Error("INVALID_BACKUP");
  const source = path.resolve(backupPath);
  const target = path.resolve(targetDataDirectory);
  const relative = path.relative(source, target);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
    throw new Error("RESTORE_TARGET_MUST_BE_OUTSIDE_BACKUP");
  await fs.mkdir(target, { recursive: true });
  await fs.copyFile(
    path.join(source, "spark.db"),
    path.join(target, "spark.db")
  );
  for (const area of ["recycle", "versions"] as const) {
    await fs.rm(path.join(target, area), { recursive: true, force: true });
    await optionalCopy(path.join(source, area), path.join(target, area));
  }
}
