import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFolder } from "./file-api";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

describe("uploadFolder", () => {
  it("creates nested directories and asks for an explicit conflict policy", async () => {
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Reports/brief.txt" });
    const conflict = vi.fn().mockResolvedValue("rename");
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "CONFLICT" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: {} }), { status: 200 }));
    await expect(uploadFolder({ directory: "", files: [file], onConflict: conflict })).resolves.toEqual({ uploaded: 1, skipped: 0 });
    expect(conflict).toHaveBeenCalledWith(expect.objectContaining({ logicalPath: "Reports/brief.txt", file }));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops before sending when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    await expect(uploadFolder({ directory: "", files: [file], signal: controller.signal })).rejects.toMatchObject({ code: "UPLOAD_CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
