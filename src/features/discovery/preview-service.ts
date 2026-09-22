import path from "node:path";
import type { ReadStream } from "node:fs";
import { classifyContent } from "./content-classifier";
import { listArchiveEntries, MAX_ARCHIVE_BYTES, type ArchiveEntry } from "./archive-preview";
import type { StorageAdapter } from "@/features/files/storage-adapter";
import { MAX_STORAGE_RANGE_BYTES } from "@/features/files/storage-adapter";
import { MAX_INDEXED_TEXT_BYTES } from "./discovery-repository";

export const MAX_PREVIEW_TEXT_BYTES = MAX_INDEXED_TEXT_BYTES;
export const MAX_INLINE_MEDIA_BYTES = 32 * 1024 * 1024;

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  ".avi": "video/x-msvideo", ".bmp": "image/bmp", ".flac": "audio/flac", ".m4a": "audio/mp4",
  ".m4v": "video/x-m4v", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  ".mpeg": "video/mpeg", ".oga": "audio/ogg", ".ogg": "audio/ogg", ".pdf": "application/pdf",
  ".wav": "audio/wav", ".webm": "video/webm", ".webp": "image/webp",
};
const MEDIA_MIME = new Set(["application/pdf", "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/tiff", "image/webp", "audio/flac", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "video/mp4", "video/mpeg", "video/quicktime", "video/webm", "video/x-m4v", "video/x-msvideo"]);
const ARCHIVE_FORMAT: Record<string, "zip" | "tar"> = { ".tar": "tar", ".zip": "zip" };

export type PreviewResult =
  | Readonly<{ kind: "text"; logicalPath: string; mimeType: string; content: string; truncated: boolean; sizeBytes: number; modifiedAt: string }>
  | Readonly<{ kind: "archive"; logicalPath: string; mimeType: string; entries: ArchiveEntry[]; sizeBytes: number; modifiedAt: string }>
  | Readonly<{ kind: "media"; logicalPath: string; mimeType: string; body?: Buffer; stream?: ReadStream; start: number; end: number; totalBytes: number; partial: boolean }>;

function mediaType(name: string, classification: ReturnType<typeof classifyContent>): string {
  return MEDIA_MIME_BY_EXTENSION[path.extname(name).toLowerCase()] ?? classification.mimeType;
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) throw new Error("INVALID_RANGE");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size) throw new Error("RANGE_NOT_SATISFIABLE");
  const end = Math.min(requestedEnd, size - 1);
  if (end < start) throw new Error("RANGE_NOT_SATISFIABLE");
  if (end - start + 1 > MAX_STORAGE_RANGE_BYTES) throw new Error("RANGE_TOO_LARGE");
  return { start, end };
}

async function readBounded(storage: StorageAdapter, logicalPath: string, size: number): Promise<Buffer> {
  if (!size) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for (let start = 0; start < size; start += MAX_STORAGE_RANGE_BYTES) {
    const end = Math.min(size - 1, start + MAX_STORAGE_RANGE_BYTES - 1);
    chunks.push(await storage.readRange(logicalPath, start, end));
  }
  return Buffer.concat(chunks, size);
}

export function createPreviewService(storage: StorageAdapter) {
  return {
    async preview(logicalPath: string, rangeHeader?: string): Promise<PreviewResult> {
      const item = await storage.stat(logicalPath);
      if (item.kind !== "file") throw new Error("NOT_A_FILE");
      const classification = classifyContent(item.name);
      const extension = classification.extension;
      const archiveFormat = ARCHIVE_FORMAT[extension];
      if (archiveFormat) {
        if (item.sizeBytes > MAX_ARCHIVE_BYTES) throw new Error("PREVIEW_TOO_LARGE");
        const body = await readBounded(storage, logicalPath, item.sizeBytes);
        return { kind: "archive", logicalPath: item.logicalPath, mimeType: archiveFormat === "zip" ? "application/zip" : "application/x-tar", entries: listArchiveEntries(body, archiveFormat), sizeBytes: item.sizeBytes, modifiedAt: item.modifiedAt };
      }
      const mimeType = mediaType(item.name, classification);
      if (classification.text) {
        const length = Math.min(item.sizeBytes, MAX_PREVIEW_TEXT_BYTES);
        const body = length ? await storage.readRange(logicalPath, 0, length - 1) : Buffer.alloc(0);
        return { kind: "text", logicalPath: item.logicalPath, mimeType, content: body.toString("utf8"), truncated: item.sizeBytes > length, sizeBytes: item.sizeBytes, modifiedAt: item.modifiedAt };
      }
      if (!MEDIA_MIME.has(mimeType)) throw new Error("UNSUPPORTED_PREVIEW");
      const range = parseRange(rangeHeader, item.sizeBytes);
      if (item.sizeBytes > MAX_INLINE_MEDIA_BYTES && !range) throw new Error("PREVIEW_TOO_LARGE");
      if (!item.sizeBytes) return { kind: "media", logicalPath: item.logicalPath, mimeType, body: Buffer.alloc(0), start: 0, end: -1, totalBytes: 0, partial: false };
      if (range) return { kind: "media", logicalPath: item.logicalPath, mimeType, body: await storage.readRange(logicalPath, range.start, range.end), start: range.start, end: range.end, totalBytes: item.sizeBytes, partial: true };
      return { kind: "media", logicalPath: item.logicalPath, mimeType, stream: await storage.openReadStream(logicalPath), start: 0, end: item.sizeBytes - 1, totalBytes: item.sizeBytes, partial: false };
    },
  };
}
