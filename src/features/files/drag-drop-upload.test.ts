import { describe, expect, it } from "vitest";
import { filesFromDropItems } from "./drag-drop-upload";

describe("filesFromDropItems", () => {
  it("keeps file paths when dropping nested directories", async () => {
    const file = new File(["DOE"], "brief.txt");
    const dropped = {
      kind: "file",
      isFile: true,
      isDirectory: false,
      name: "brief.txt",
      fullPath: "/Reports/2026/brief.txt",
      file: (resolve: (file: File) => void) => resolve(file),
    };
    let read = false;
    const reader = {
      readEntries: (resolve: (entries: (typeof dropped)[]) => void) => {
        resolve(read ? [] : [dropped]);
        read = true;
      },
    };
    const directory = {
      kind: "file",
      getAsFile: () => null,
      webkitGetAsEntry: () => ({
        isFile: false,
        isDirectory: true,
        name: "Reports",
        fullPath: "/Reports",
        createReader: () => reader,
      }),
    } as unknown as DataTransferItem;

    await expect(filesFromDropItems([directory])).resolves.toEqual([
      { file, relativePath: "Reports/2026/brief.txt" },
    ]);
  });

  it("falls back to ordinary dropped files when directory entries are unavailable", async () => {
    const file = new File(["DOE"], "brief.txt");
    const item = {
      kind: "file",
      getAsFile: () => file,
    } as unknown as DataTransferItem;

    await expect(filesFromDropItems([item])).resolves.toEqual([
      { file, relativePath: "brief.txt" },
    ]);
  });
});
