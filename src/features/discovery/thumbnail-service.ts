import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { classifyContent } from "./content-classifier";
import type { StorageAdapter } from "@/features/files/storage-adapter";
import { MAX_STORAGE_RANGE_BYTES } from "@/features/files/storage-adapter";

export const MAX_THUMBNAIL_SOURCE_BYTES = 16 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/tiff", "image/webp"]);

async function readBounded(storage: StorageAdapter, logicalPath: string, size: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (let start = 0; start < size; start += MAX_STORAGE_RANGE_BYTES) chunks.push(await storage.readRange(logicalPath, start, Math.min(size - 1, start + MAX_STORAGE_RANGE_BYTES - 1)));
  return Buffer.concat(chunks, size);
}

export function createThumbnailService(options: Readonly<{ storage: StorageAdapter; dataDirectory: string }>) {
  const cacheDirectory = path.resolve(options.dataDirectory, "thumbnails");
  return {
    async getThumbnail(logicalPath: string): Promise<Readonly<{ buffer: Buffer; mimeType: "image/webp"; fromCache: boolean }>> {
      const item = await options.storage.stat(logicalPath);
      if (item.kind !== "file") throw new Error("NOT_A_FILE");
      if (item.sizeBytes > MAX_THUMBNAIL_SOURCE_BYTES) throw new Error("THUMBNAIL_TOO_LARGE");
      const classification = classifyContent(item.name);
      if (!IMAGE_MIMES.has(classification.mimeType)) throw new Error("UNSUPPORTED_THUMBNAIL");
      const key = createHash("sha256").update(`${item.logicalPath}\0${item.sizeBytes}\0${item.modifiedAt}`).digest("hex");
      const target = path.join(cacheDirectory, `${key}.webp`);
      try {
        return { buffer: await readFile(target), mimeType: "image/webp", fromCache: true };
      } catch (error) {
        if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) throw error;
      }
      const source = await readBounded(options.storage, logicalPath, item.sizeBytes);
      const buffer = await sharp(source, { limitInputPixels: 40_000_000 }).resize(320, 320, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await mkdir(cacheDirectory, { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, buffer, { flag: "wx" });
        await rename(temporary, target).catch((error: unknown) => {
          if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST")) throw error;
        });
      } finally {
        await rm(temporary, { force: true });
      }
      return { buffer, mimeType: "image/webp", fromCache: false };
    },
  };
}
