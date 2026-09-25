import path from "node:path";

export const MAX_ARCHIVE_ENTRIES = 1_000;
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export type ArchiveEntry = Readonly<{
  name: string;
  kind: "file" | "folder";
  sizeBytes: number;
}>;

function safeName(value: string): boolean {
  if (
    !value ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/")
  )
    return false;
  const candidate = value.endsWith("/") ? value.slice(0, -1) : value;
  const normalized = path.posix.normalize(candidate);
  return (
    normalized === candidate &&
    !normalized
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") &&
    !path.posix.isAbsolute(normalized)
  );
}

function archiveEntry(
  name: string,
  sizeBytes: number,
  kind: "file" | "folder" = "file"
): ArchiveEntry {
  if (!safeName(name)) throw new Error("ARCHIVE_UNSAFE_ENTRY");
  return { name, kind, sizeBytes };
}

function listZip(bytes: Buffer): ArchiveEntry[] {
  if (bytes.length < 22) throw new Error("INVALID_ARCHIVE");
  const start = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= start; index -= 1)
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  if (eocd < 0 || eocd + 22 > bytes.length) throw new Error("INVALID_ARCHIVE");
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (
    entries > MAX_ARCHIVE_ENTRIES ||
    centralOffset + centralSize > eocd ||
    bytes.readUInt16LE(eocd + 4) !== 0
  )
    throw new Error("ARCHIVE_TOO_LARGE");
  const result: ArchiveEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("INVALID_ARCHIVE");
    const flags = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const sizeBytes = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length || (flags & 1) !== 0)
      throw new Error("UNSUPPORTED_ARCHIVE");
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    const mode = bytes.readUInt32LE(offset + 38) >>> 16;
    if ((mode & 0xf000) === 0xa000 || !safeName(name))
      throw new Error("ARCHIVE_UNSAFE_ENTRY");
    result.push(
      archiveEntry(
        name,
        name.endsWith("/") ? 0 : sizeBytes,
        name.endsWith("/") ? "folder" : "file"
      )
    );
    if (compressedSize > MAX_ARCHIVE_BYTES || sizeBytes > MAX_ARCHIVE_BYTES)
      throw new Error("ARCHIVE_TOO_LARGE");
    offset = end;
  }
  return result;
}

function octal(bytes: Buffer, start: number, length: number): number {
  const value = bytes
    .subarray(start, start + length)
    .toString("ascii")
    .replace(/\0.*$/, "")
    .trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) throw new Error("INVALID_ARCHIVE");
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error("INVALID_ARCHIVE");
  return number;
}

function listTar(bytes: Buffer): ArchiveEntry[] {
  const result: ArchiveEntry[] = [];
  let terminated = false;
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (
        offset + 1024 > bytes.length ||
        bytes
          .subarray(offset + 512, offset + 1024)
          .some((byte) => byte !== 0) ||
        bytes.subarray(offset + 1024).some((byte) => byte !== 0)
      )
        throw new Error("INVALID_ARCHIVE");
      terminated = true;
      break;
    }
    const expectedChecksum = octal(header, 148, 8);
    let actualChecksum = 0;
    for (let index = 0; index < header.length; index += 1)
      actualChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
    if (expectedChecksum !== actualChecksum) throw new Error("INVALID_ARCHIVE");
    octal(header, 100, 8);
    octal(header, 108, 8);
    octal(header, 116, 8);
    const sizeBytes = octal(header, 124, 12);
    octal(header, 136, 12);
    octal(header, 329, 8);
    octal(header, 337, 8);
    const rawName = header
      .subarray(0, 100)
      .toString("utf8")
      .replace(/\0.*$/, "");
    const prefix = header
      .subarray(345, 500)
      .toString("utf8")
      .replace(/\0.*$/, "");
    const name = prefix && rawName ? `${prefix}/${rawName}` : prefix || rawName;
    const type = String.fromCharCode(header[156] || 48);
    if (["L", "K", "x", "g", "A", "E", "I"].includes(type))
      throw new Error("UNSUPPORTED_ARCHIVE");
    if (
      ["1", "2", "3", "4", "6", "7"].includes(type) ||
      !["0", "5"].includes(type)
    )
      throw new Error("ARCHIVE_UNSAFE_ENTRY");
    if (!safeName(name)) throw new Error("ARCHIVE_UNSAFE_ENTRY");
    result.push(
      archiveEntry(
        name,
        type === "5" ? 0 : sizeBytes,
        type === "5" ? "folder" : "file"
      )
    );
    if (result.length > MAX_ARCHIVE_ENTRIES || sizeBytes > MAX_ARCHIVE_BYTES)
      throw new Error("ARCHIVE_TOO_LARGE");
    const dataEnd = offset + 512 + Math.ceil(sizeBytes / 512) * 512;
    if (dataEnd > bytes.length) throw new Error("INVALID_ARCHIVE");
    offset = dataEnd;
  }
  if (!terminated) throw new Error("INVALID_ARCHIVE");
  return result;
}

export function listArchiveEntries(
  bytes: Uint8Array,
  format?: "zip" | "tar"
): ArchiveEntry[] {
  const input = Buffer.from(bytes);
  if (input.length > MAX_ARCHIVE_BYTES) throw new Error("ARCHIVE_TOO_LARGE");
  if (input.length < 4) throw new Error("INVALID_ARCHIVE");
  const kind =
    format ??
    (input.readUInt32LE(0) === 0x04034b50 ||
    input.readUInt32LE(0) === 0x02014b50
      ? "zip"
      : "tar");
  return kind === "zip" ? listZip(input) : listTar(input);
}
