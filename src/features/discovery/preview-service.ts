import path from "node:path";
import type { ReadStream } from "node:fs";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import * as XLSX from "xlsx";
import { classifyContent } from "./content-classifier";
import { listArchiveEntries, MAX_ARCHIVE_BYTES, type ArchiveEntry } from "./archive-preview";
import type { StorageAdapter } from "@/features/files/storage-adapter";
import { MAX_STORAGE_RANGE_BYTES } from "@/features/files/storage-adapter";
import { MAX_INDEXED_TEXT_BYTES } from "./discovery-repository";
import type { DocumentConverter } from "./document-converter";
import { createArtifactCache } from "./artifact-cache";

export const MAX_PREVIEW_TEXT_BYTES = MAX_INDEXED_TEXT_BYTES;
export const MAX_INLINE_MEDIA_BYTES = 32 * 1024 * 1024;
export const MAX_DOCUMENT_PREVIEW_BYTES = 16 * 1024 * 1024;
export const MAX_SPREADSHEET_PREVIEW_ROWS = 200;
export const MAX_SPREADSHEET_PREVIEW_COLUMNS = 30;
export const MAX_SPREADSHEET_PREVIEW_SHEETS = 12;
export const MAX_SPREADSHEET_CELL_CHARS = 2_000;

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  ".avi": "video/x-msvideo", ".bmp": "image/bmp", ".flac": "audio/flac", ".m4a": "audio/mp4",
  ".m4v": "video/x-m4v", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  ".mpeg": "video/mpeg", ".oga": "audio/ogg", ".ogg": "audio/ogg", ".pdf": "application/pdf",
  ".wav": "audio/wav", ".webm": "video/webm", ".webp": "image/webp",
};
const MEDIA_MIME = new Set(["application/pdf", "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/tiff", "image/webp", "audio/flac", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "video/mp4", "video/mpeg", "video/quicktime", "video/webm", "video/x-m4v", "video/x-msvideo"]);
const ARCHIVE_FORMAT: Record<string, "zip" | "tar"> = { ".tar": "tar", ".zip": "zip" };
const DOCUMENT_FORMAT: Record<string, "docx"> = { ".docx": "docx" };
const SPREADSHEET_FORMAT: Record<string, "csv" | "xls" | "xlsx" | "xlsb" | "xlsm" | "ods"> = {
  ".csv": "csv", ".ods": "ods", ".xls": "xls", ".xlsb": "xlsb", ".xlsm": "xlsm", ".xlsx": "xlsx",
};
const CONVERTIBLE_FORMAT = new Set([".doc", ".docm", ".odt", ".odp", ".ppt", ".pptm", ".pptx", ".rtf"]);
const CONVERTED_PREVIEW_CACHE_VERSION = "gotenberg-pdf-v1";

export type PreviewResult =
  | Readonly<{ kind: "text"; logicalPath: string; mimeType: string; content: string; truncated: boolean; sizeBytes: number; modifiedAt: string }>
  | Readonly<{ kind: "document"; format: "docx"; logicalPath: string; mimeType: string; html: string; sizeBytes: number; modifiedAt: string }>
  | Readonly<{ kind: "spreadsheet"; format: "csv" | "xls" | "xlsx" | "xlsb" | "xlsm" | "ods"; logicalPath: string; mimeType: string; sheets: Array<{ name: string; rows: string[][]; truncated: boolean }>; sizeBytes: number; modifiedAt: string }>
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

function sanitizeDocumentHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ["a", "br", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"],
    allowedAttributes: { a: ["href", "title"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

function spreadsheetRows(sheet: XLSX.WorkSheet): { rows: string[][]; truncated: boolean } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  const truncated = raw.length > MAX_SPREADSHEET_PREVIEW_ROWS || raw.some((row) => row.length > MAX_SPREADSHEET_PREVIEW_COLUMNS);
  return {
    rows: raw.slice(0, MAX_SPREADSHEET_PREVIEW_ROWS).map((row) => row.slice(0, MAX_SPREADSHEET_PREVIEW_COLUMNS).map((cell) => String(cell).slice(0, MAX_SPREADSHEET_CELL_CHARS))),
    truncated,
  };
}

export function createPreviewService(storage: StorageAdapter, options: Readonly<{ converter?: DocumentConverter; dataDirectory?: string }> = {}) {
  const convertedCache = options.dataDirectory ? createArtifactCache(options.dataDirectory, "converted-previews") : null;
  async function convert(logicalPath: string): Promise<Extract<PreviewResult, { kind: "media" }>> {
    const item = await storage.stat(logicalPath);
    if (item.kind !== "file") throw new Error("NOT_A_FILE");
    if (!CONVERTIBLE_FORMAT.has(path.extname(item.name).toLowerCase())) throw new Error("UNSUPPORTED_PREVIEW");
    if (!options.converter) throw new Error("PREVIEW_CONVERTER_DISABLED");
    if (item.sizeBytes > MAX_DOCUMENT_PREVIEW_BYTES) throw new Error("PREVIEW_TOO_LARGE");
    const source = await readBounded(storage, logicalPath, item.sizeBytes);
    const key = `${CONVERTED_PREVIEW_CACHE_VERSION}\0pdf\0${item.logicalPath}\0${item.sizeBytes}\0${item.modifiedAt}`;
    const body = convertedCache
      ? await convertedCache.get(key, () => options.converter!.convert(item.name, source))
      : await options.converter.convert(item.name, source);
    return { kind: "media", logicalPath: item.logicalPath, mimeType: "application/pdf", body, start: 0, end: Math.max(0, body.byteLength - 1), totalBytes: body.byteLength, partial: false };
  }

  return {
    convert,
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
      const documentFormat = DOCUMENT_FORMAT[extension];
      if (documentFormat) {
        if (item.sizeBytes > MAX_DOCUMENT_PREVIEW_BYTES) throw new Error("PREVIEW_TOO_LARGE");
        try {
          const body = await readBounded(storage, logicalPath, item.sizeBytes);
          const converted = await mammoth.convertToHtml({ buffer: body });
          return { kind: "document", format: documentFormat, logicalPath: item.logicalPath, mimeType, html: sanitizeDocumentHtml(converted.value), sizeBytes: item.sizeBytes, modifiedAt: item.modifiedAt };
        } catch {
          throw new Error("INVALID_DOCUMENT_PREVIEW");
        }
      }
      const spreadsheetFormat = SPREADSHEET_FORMAT[extension];
      if (spreadsheetFormat) {
        if (item.sizeBytes > MAX_DOCUMENT_PREVIEW_BYTES) throw new Error("PREVIEW_TOO_LARGE");
        try {
          const workbook = XLSX.read(await readBounded(storage, logicalPath, item.sizeBytes), { type: "buffer", cellDates: false, dense: true });
          const sheets = workbook.SheetNames.slice(0, MAX_SPREADSHEET_PREVIEW_SHEETS).map((name) => ({ name, ...spreadsheetRows(workbook.Sheets[name]) }));
          return { kind: "spreadsheet", format: spreadsheetFormat, logicalPath: item.logicalPath, mimeType, sheets, sizeBytes: item.sizeBytes, modifiedAt: item.modifiedAt };
        } catch {
          throw new Error("INVALID_SPREADSHEET_PREVIEW");
        }
      }
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
