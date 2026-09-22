// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStorageAdapter } from "@/features/files/storage-adapter";
import { createPreviewService, MAX_PREVIEW_TEXT_BYTES } from "./preview-service";

let root: string;
let data: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "spark-preview-files-"));
  data = await fs.mkdtemp(path.join(os.tmpdir(), "spark-preview-data-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(data, { recursive: true, force: true });
});

describe("preview service", () => {
  it("returns capped text/code JSON previews", async () => {
    await fs.writeFile(path.join(root, "code.ts"), "x".repeat(MAX_PREVIEW_TEXT_BYTES + 10));
    const result = await createPreviewService(createStorageAdapter({ filesRoot: root, dataDirectory: data })).preview("code.ts");
    expect(result).toMatchObject({ kind: "text", mimeType: "text/typescript", truncated: true });
    expect((result as { content: string }).content).toHaveLength(MAX_PREVIEW_TEXT_BYTES);
  });

  it("returns safe inline media metadata and bounded ranges", async () => {
    await fs.writeFile(path.join(root, "clip.mp4"), Buffer.from("0123456789"));
    const service = createPreviewService(createStorageAdapter({ filesRoot: root, dataDirectory: data }));
    await expect(service.preview("clip.mp4", "bytes=2-5")).resolves.toMatchObject({ kind: "media", mimeType: "video/mp4", start: 2, end: 5, totalBytes: 10, body: Buffer.from("2345") });
  });

  it("rejects SVG inline previews", async () => {
    await fs.writeFile(path.join(root, "unsafe.svg"), "<svg></svg>");
    await expect(createPreviewService(createStorageAdapter({ filesRoot: root, dataDirectory: data })).preview("unsafe.svg")).rejects.toThrow("UNSUPPORTED_PREVIEW");
  });

  it("streams a full media preview larger than one bounded range", async () => {
    await fs.writeFile(path.join(root, "large.mp4"), Buffer.alloc(8 * 1024 * 1024 + 1, 7));
    const result = await createPreviewService(createStorageAdapter({ filesRoot: root, dataDirectory: data })).preview("large.mp4");
    expect(result).toMatchObject({ kind: "media", totalBytes: 8 * 1024 * 1024 + 1, partial: false });
    expect("stream" in result && result.stream).toBeTruthy();
  });

  it("rejects unsupported and oversized files explicitly", async () => {
    await fs.writeFile(path.join(root, "unknown.bin"), Buffer.from("binary"));
    await expect(createPreviewService(createStorageAdapter({ filesRoot: root, dataDirectory: data })).preview("unknown.bin")).rejects.toThrow("UNSUPPORTED_PREVIEW");
  });
});
