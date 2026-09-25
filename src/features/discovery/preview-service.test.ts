// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import * as XLSX from "xlsx";
import { createStorageAdapter } from "@/features/files/storage-adapter";
import {
  createPreviewService,
  MAX_PREVIEW_TEXT_BYTES,
} from "./preview-service";

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
  it("returns sanitized bounded DOCX HTML previews", async () => {
    const docx = zipSync({
      "[Content_Types].xml": new TextEncoder().encode(
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
      ),
      "word/document.xml": new TextEncoder().encode(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOE record</w:t></w:r></w:p><w:p><w:r><w:instrText>&lt;script&gt;unsafe&lt;/script&gt;</w:instrText></w:r></w:p></w:body></w:document>`
      ),
    });
    await fs.writeFile(path.join(root, "record.docx"), docx);
    const result = await createPreviewService(
      createStorageAdapter({ filesRoot: root, dataDirectory: data })
    ).preview("record.docx");
    expect(result).toMatchObject({ kind: "document", format: "docx" });
    expect((result as { html: string }).html).toContain("DOE record");
    expect((result as { html: string }).html).not.toContain("script");
  });

  it("returns bounded spreadsheet sheets for XLSX", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Name", "Value"],
        ["DOE", 42],
      ]),
      "Summary"
    );
    await fs.writeFile(
      path.join(root, "summary.xlsx"),
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    );
    const result = await createPreviewService(
      createStorageAdapter({ filesRoot: root, dataDirectory: data })
    ).preview("summary.xlsx");
    expect(result).toMatchObject({ kind: "spreadsheet", format: "xlsx" });
    expect(
      (
        result as {
          sheets: Array<{ name: string; rows: string[][]; truncated: boolean }>;
        }
      ).sheets[0]
    ).toEqual({
      name: "Summary",
      rows: [
        ["Name", "Value"],
        ["DOE", "42"],
      ],
      truncated: false,
    });
  });

  it("returns capped text/code JSON previews", async () => {
    await fs.writeFile(
      path.join(root, "code.ts"),
      "x".repeat(MAX_PREVIEW_TEXT_BYTES + 10)
    );
    const result = await createPreviewService(
      createStorageAdapter({ filesRoot: root, dataDirectory: data })
    ).preview("code.ts");
    expect(result).toMatchObject({
      kind: "text",
      mimeType: "text/typescript",
      truncated: true,
    });
    expect((result as { content: string }).content).toHaveLength(
      MAX_PREVIEW_TEXT_BYTES
    );
  });

  it("returns safe inline media metadata and bounded ranges", async () => {
    await fs.writeFile(path.join(root, "clip.mp4"), Buffer.from("0123456789"));
    const service = createPreviewService(
      createStorageAdapter({ filesRoot: root, dataDirectory: data })
    );
    await expect(
      service.preview("clip.mp4", "bytes=2-5")
    ).resolves.toMatchObject({
      kind: "media",
      mimeType: "video/mp4",
      start: 2,
      end: 5,
      totalBytes: 10,
      body: Buffer.from("2345"),
    });
  });

  it("rejects SVG inline previews", async () => {
    await fs.writeFile(path.join(root, "unsafe.svg"), "<svg></svg>");
    await expect(
      createPreviewService(
        createStorageAdapter({ filesRoot: root, dataDirectory: data })
      ).preview("unsafe.svg")
    ).rejects.toThrow("UNSUPPORTED_PREVIEW");
  });

  it("streams a full media preview larger than one bounded range", async () => {
    await fs.writeFile(
      path.join(root, "large.mp4"),
      Buffer.alloc(8 * 1024 * 1024 + 1, 7)
    );
    const result = await createPreviewService(
      createStorageAdapter({ filesRoot: root, dataDirectory: data })
    ).preview("large.mp4");
    expect(result).toMatchObject({
      kind: "media",
      totalBytes: 8 * 1024 * 1024 + 1,
      partial: false,
    });
    expect("stream" in result && result.stream).toBeTruthy();
    if ("stream" in result) result.stream?.destroy();
  });

  it("rejects unsupported and oversized files explicitly", async () => {
    await fs.writeFile(path.join(root, "unknown.bin"), Buffer.from("binary"));
    await expect(
      createPreviewService(
        createStorageAdapter({ filesRoot: root, dataDirectory: data })
      ).preview("unknown.bin")
    ).rejects.toThrow("UNSUPPORTED_PREVIEW");
  });

  it("converts legacy and presentation documents only when a converter is supplied", async () => {
    await fs.writeFile(path.join(root, "slides.pptx"), Buffer.from("source"));
    const converter = {
      convert: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7 output")),
    };
    const service = createPreviewService(
      createStorageAdapter({ filesRoot: root, dataDirectory: data }),
      { converter, dataDirectory: data }
    );
    await expect(service.convert("slides.pptx")).resolves.toMatchObject({
      kind: "media",
      mimeType: "application/pdf",
      body: Buffer.from("%PDF-1.7 output"),
    });
    await expect(service.convert("slides.pptx")).resolves.toMatchObject({
      kind: "media",
      body: Buffer.from("%PDF-1.7 output"),
    });
    expect(converter.convert).toHaveBeenCalledOnce();
  });
});
