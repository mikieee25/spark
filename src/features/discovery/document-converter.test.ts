import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentConverter } from "./document-converter";

afterEach(() => vi.unstubAllGlobals());

describe("document converter", () => {
  it("uploads a document and returns bounded PDF bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(Buffer.from("%PDF-1.7"), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createDocumentConverter(
      new URL("http://converter.test/convert")
    ).convert("report.pptx", Buffer.from("source"));
    expect(result).toEqual(Buffer.from("%PDF-1.7"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://converter.test/convert"
    );
  });

  it("rejects non-PDF or oversized converter responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("not pdf", {
            status: 200,
            headers: { "content-type": "text/plain" },
          })
        )
    );
    await expect(
      createDocumentConverter(new URL("http://converter.test/convert")).convert(
        "report.pptx",
        Buffer.from("source")
      )
    ).rejects.toThrow("PREVIEW_CONVERTER_INVALID_RESPONSE");
  });
});
