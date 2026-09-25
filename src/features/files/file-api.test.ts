import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadSelection,
  recycleSelection,
  restoreRecycleItem,
  uploadFolder,
} from "./file-api";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

describe("uploadFolder", () => {
  it("creates nested directories and asks for an explicit conflict policy", async () => {
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "Reports/brief.txt",
    });
    const conflict = vi.fn().mockResolvedValue("rename");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: {} }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "CONFLICT" }), { status: 409 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: {} }), { status: 200 })
      );
    await expect(
      uploadFolder({ directory: "", files: [file], onConflict: conflict })
    ).resolves.toEqual({ uploaded: 1, skipped: 0 });
    expect(conflict).toHaveBeenCalledWith(
      expect.objectContaining({ logicalPath: "Reports/brief.txt", file })
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops before sending when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    await expect(
      uploadFolder({ directory: "", files: [file], signal: controller.signal })
    ).rejects.toMatchObject({ code: "UPLOAD_CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("batch file actions", () => {
  it("downloads selected paths as a ZIP request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("zip", {
        status: 200,
        headers: { "Content-Type": "application/zip" },
      })
    );

    await expect(
      downloadSelection(["Reports", "note.txt"])
    ).resolves.toBeInstanceOf(Blob);

    expect(fetch).toHaveBeenCalledWith(
      "/api/files/batch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "download",
          paths: ["Reports", "note.txt"],
        }),
      })
    );
  });

  it("returns per-item recycle outcomes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          succeeded: ["note.txt"],
          failed: [],
          undo: [{ id: "recycle-1", path: "note.txt" }],
        }),
        { status: 200 }
      )
    );

    await expect(recycleSelection(["note.txt"])).resolves.toEqual({
      succeeded: ["note.txt"],
      failed: [],
      undo: [{ id: "recycle-1", path: "note.txt" }],
    });
  });

  it("restores one recycle entry without replacing an existing destination", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ entry: { id: "recycle-1" } }), {
        status: 200,
      })
    );

    await expect(restoreRecycleItem("recycle-1")).resolves.toEqual({
      entry: { id: "recycle-1" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/recycle/recycle-1/restore",
      expect.objectContaining({ method: "POST", body: "{}" })
    );
  });
});
