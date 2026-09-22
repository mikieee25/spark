// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createStorageAdapter } from "@/features/files/storage-adapter";
import { createThumbnailService } from "./thumbnail-service";

let root: string;
let data: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "spark-thumb-files-")); data = await fs.mkdtemp(path.join(os.tmpdir(), "spark-thumb-data-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(data, { recursive: true, force: true }); });

describe("thumbnail service", () => {
  it("caches by logical path and current size/mtime", async () => {
    await fs.writeFile(path.join(root, "photo.png"), await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer());
    const service = createThumbnailService({ storage: createStorageAdapter({ filesRoot: root, dataDirectory: data }), dataDirectory: data });
    const first = await service.getThumbnail("photo.png");
    const second = await service.getThumbnail("photo.png");
    expect(first.buffer).toEqual(second.buffer);
    await fs.writeFile(path.join(root, "photo.png"), await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer());
    const changed = await service.getThumbnail("photo.png");
    expect(changed.buffer).not.toEqual(first.buffer);
    expect((await fs.readdir(path.join(data, "thumbnails"))).length).toBeGreaterThanOrEqual(2);
  });
});
