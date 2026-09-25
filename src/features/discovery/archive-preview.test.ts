// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listArchiveEntries } from "./archive-preview";

function zipEntry(name: string, size = 0): Buffer {
  const nameBytes = Buffer.from(name);
  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  nameBytes.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([central, eocd]);
}

function tarEntry(name: string, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  Buffer.from(name).copy(header, 0, 0, Math.min(name.length, 100));
  Buffer.from("00000000010\0").copy(header, 100);
  Buffer.from("00000000000\0").copy(header, 124);
  Buffer.from("00000000000\0").copy(header, 136);
  Buffer.from(type).copy(header, 156);
  Buffer.from("        ").copy(header, 148);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  Buffer.from(`${checksum.toString(8).padStart(6, "0")} \0`).copy(header, 148);
  return Buffer.concat([header, Buffer.alloc(1024)]);
}

describe("archive preview", () => {
  it("lists safe zip metadata", () => {
    expect(listArchiveEntries(zipEntry("safe.txt", 4), "zip")).toEqual([
      { name: "safe.txt", kind: "file", sizeBytes: 4 },
    ]);
  });

  it("lists bounded zip metadata and rejects traversal names", () => {
    expect(() => listArchiveEntries(zipEntry("../secret.txt"), "zip")).toThrow(
      "ARCHIVE_UNSAFE_ENTRY"
    );
  });

  it("does not expose tar symlink entries", () => {
    expect(listArchiveEntries(tarEntry("safe.txt"), "tar")).toEqual([
      { name: "safe.txt", kind: "file", sizeBytes: 0 },
    ]);
    expect(() => listArchiveEntries(tarEntry("link", "2"), "tar")).toThrow(
      "ARCHIVE_UNSAFE_ENTRY"
    );
  });

  it("rejects invalid tar checksums, numeric fields, extension records, and termination", () => {
    const invalidChecksum = tarEntry("safe.txt");
    invalidChecksum[0] ^= 1;
    expect(() => listArchiveEntries(invalidChecksum, "tar")).toThrow(
      "INVALID_ARCHIVE"
    );

    const invalidNumber = tarEntry("safe.txt");
    Buffer.from("99999999999\0").copy(invalidNumber, 124);
    expect(() => listArchiveEntries(invalidNumber, "tar")).toThrow(
      "INVALID_ARCHIVE"
    );

    const extension = tarEntry("long-name", "L");
    expect(() => listArchiveEntries(extension, "tar")).toThrow(
      "UNSUPPORTED_ARCHIVE"
    );
    expect(() =>
      listArchiveEntries(tarEntry("safe.txt").subarray(0, 512), "tar")
    ).toThrow("INVALID_ARCHIVE");
  });
});
