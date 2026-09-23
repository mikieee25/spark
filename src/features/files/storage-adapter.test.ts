// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStorageAdapter } from "./storage-adapter";

let root: string;
let data: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "spark-files-"));
  data = await fs.mkdtemp(path.join(os.tmpdir(), "spark-data-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(data, { recursive: true, force: true });
});

describe("storage adapter", () => {
  it("lists contained entries and stages an upload", async () => {
    const adapter = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    await adapter.createDirectory("Reports");
    const staged = await adapter.stageUpload("note.txt", Buffer.from("DOE"));
    await adapter.commitStagedFile(staged, "Reports/note.txt");

    expect((await adapter.list(""))[0]).toEqual(expect.objectContaining({ name: "Reports", kind: "folder" }));
    expect(await fs.readFile(path.join(root, "Reports", "note.txt"), "utf8")).toBe("DOE");
  });

  it("keeps listings fast while retaining recursive sizes for explicit stats", async () => {
    await fs.mkdir(path.join(root, "Reports", "2026"), { recursive: true });
    await fs.writeFile(path.join(root, "Reports", "brief.txt"), "DOE");
    await fs.writeFile(path.join(root, "Reports", "2026", "budget.bin"), Buffer.alloc(5));
    const adapter = createStorageAdapter({ filesRoot: root, dataDirectory: data });

    await expect(adapter.list("")).resolves.toEqual([
      expect.objectContaining({ name: "Reports", kind: "folder", sizeBytes: 0 }),
    ]);
    await expect(adapter.list("Reports")).resolves.toEqual([
      expect.objectContaining({ name: "2026", kind: "folder", sizeBytes: 0 }),
      expect.objectContaining({ name: "brief.txt", kind: "file", sizeBytes: 3 }),
    ]);
    await expect(adapter.stat("Reports")).resolves.toEqual(expect.objectContaining({ kind: "folder", sizeBytes: 8 }));
  });

  it("deduplicates concurrent cached listings for the same folder", async () => {
    await fs.writeFile(path.join(root, "note.txt"), "note");
    const storage = createStorageAdapter({ filesRoot: root, dataDirectory: data });

    const [first, second] = await Promise.all([storage.list(""), storage.list("")]);

    expect(first).toBe(second);
  });

  it("rejects symlinks even when the lexical path is contained", async () => {
    const outside = path.join(data, "outside.txt");
    await fs.writeFile(outside, "private");
    await fs.symlink(outside, path.join(root, "linked.txt"));
    const adapter = createStorageAdapter({ filesRoot: root, dataDirectory: data });

    await expect(adapter.stat("linked.txt")).rejects.toThrow("SYMLINK_NOT_ALLOWED");
    await expect(adapter.readRange("linked.txt", 0, 1)).rejects.toThrow("SYMLINK_NOT_ALLOWED");
    await expect(adapter.openReadStream("linked.txt")).rejects.toThrow("SYMLINK_NOT_ALLOWED");
  });

  it("rejects directories as ranged or streamed files", async () => {
    await fs.mkdir(path.join(root, "folder"));
    const adapter = createStorageAdapter({ filesRoot: root, dataDirectory: data });
    await expect(adapter.readRange("folder", 0, 0)).rejects.toThrow("UNSUPPORTED_ENTRY");
    await expect(adapter.openReadStream("folder")).rejects.toThrow("UNSUPPORTED_ENTRY");
  });

  it("reads a bounded byte range without following symlinks", async () => {
    await fs.writeFile(path.join(root, "range.txt"), "0123456789");
    const adapter = createStorageAdapter({ filesRoot: root, dataDirectory: data });

    await expect(adapter.readRange("range.txt", 2, 5)).resolves.toEqual(Buffer.from("2345"));
    await expect(adapter.readRange("range.txt", 9, 9)).resolves.toEqual(Buffer.from("9"));
  });
});
