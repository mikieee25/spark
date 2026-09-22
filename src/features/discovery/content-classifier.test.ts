import { describe, expect, it } from "vitest";
import { MAX_INDEXED_TEXT_BYTES } from "./discovery-repository";
import { classifyContent } from "./content-classifier";

describe("content classifier", () => {
  it("classifies allowlisted text and code extensions only", () => {
    expect(classifyContent("README.md")).toEqual({ extension: ".md", mimeType: "text/markdown", text: true });
    expect(classifyContent("src/app.ts")).toEqual({ extension: ".ts", mimeType: "text/typescript", text: true });
    expect(classifyContent("photo.png")).toEqual({ extension: ".png", mimeType: "image/png", text: false });
    expect(classifyContent("unknown.bin")).toEqual({ extension: ".bin", mimeType: "application/octet-stream", text: false });
  });

  it("exposes the bounded indexed text ceiling", () => {
    expect(MAX_INDEXED_TEXT_BYTES).toBe(256 * 1024);
  });
});
