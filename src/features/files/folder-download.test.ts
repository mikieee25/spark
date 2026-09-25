// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import type { StorageAdapter } from "./storage-adapter";
import { createFolderArchive, createSelectionArchive } from "./folder-download";

function storageFixture(): StorageAdapter {
  const files = new Map([
    ["Reports/2026/brief.txt", Buffer.from("DOE brief")],
    ["Reports/readme.md", Buffer.from("read me")],
    ["Other.txt", Buffer.from("other")],
  ]);
  return {
    list: async (logicalPath: string) => {
      const entries =
        logicalPath === "Reports"
          ? [
              {
                name: "2026",
                logicalPath: "Reports/2026",
                kind: "folder" as const,
                sizeBytes: 0,
                modifiedAt: "2026-09-22T00:00:00.000Z",
              },
              {
                name: "readme.md",
                logicalPath: "Reports/readme.md",
                kind: "file" as const,
                sizeBytes: 7,
                modifiedAt: "2026-09-22T00:00:00.000Z",
              },
            ]
          : [
              {
                name: "brief.txt",
                logicalPath: "Reports/2026/brief.txt",
                kind: "file" as const,
                sizeBytes: 9,
                modifiedAt: "2026-09-22T00:00:00.000Z",
              },
            ];
      return entries;
    },
    stat: async (logicalPath: string) =>
      logicalPath === "Reports"
        ? {
            name: "Reports",
            logicalPath,
            kind: "folder",
            sizeBytes: 0,
            modifiedAt: "2026-09-22T00:00:00.000Z",
          }
        : (() => {
            const bytes = files.get(logicalPath);
            if (!bytes) throw new Error("NOT_FOUND");
            return {
              name: logicalPath.split("/").at(-1)!,
              logicalPath,
              kind: "file" as const,
              sizeBytes: bytes.byteLength,
              modifiedAt: "2026-09-22T00:00:00.000Z",
            };
          })(),
    readFile: async (logicalPath: string) =>
      files.get(logicalPath) ??
      (() => {
        throw new Error("NOT_FOUND");
      })(),
  } as unknown as StorageAdapter;
}

describe("folder download", () => {
  it("creates a ZIP containing nested files relative to the selected folder", async () => {
    const result = await createFolderArchive(storageFixture(), "Reports");
    const archive = unzipSync(result.body);
    expect(result.filename).toBe("Reports.zip");
    expect(Buffer.from(archive["2026/brief.txt"]).toString()).toBe("DOE brief");
    expect(Buffer.from(archive["readme.md"]).toString()).toBe("read me");
  });

  it("rejects a file as a folder archive source", async () => {
    const storage = storageFixture();
    await expect(
      createFolderArchive(storage, "Reports/readme.md")
    ).rejects.toThrow("NOT_A_DIRECTORY");
  });

  it("propagates a missing folder and rejects unsafe archive entries", async () => {
    const missing = storageFixture();
    await expect(
      createFolderArchive(
        {
          ...missing,
          stat: async () => {
            throw new Error("NOT_FOUND");
          },
        } as StorageAdapter,
        "Missing"
      )
    ).rejects.toThrow("NOT_FOUND");
    const unsafe = {
      ...storageFixture(),
      list: async () => [
        {
          name: "evil.txt",
          logicalPath: "Reports/../evil.txt",
          kind: "file" as const,
          sizeBytes: 1,
          modifiedAt: "2026-09-22T00:00:00.000Z",
        },
      ],
    } as unknown as StorageAdapter;
    await expect(createFolderArchive(unsafe, "Reports")).rejects.toThrow(
      "INVALID_ARCHIVE_PATH"
    );
  });

  it("keeps root-level paths intact when archiving the files root", async () => {
    const base = storageFixture();
    const rootStorage = {
      ...base,
      stat: async (logicalPath: string) =>
        logicalPath === ""
          ? {
              name: "",
              logicalPath: "",
              kind: "folder" as const,
              sizeBytes: 0,
              modifiedAt: "2026-09-22T00:00:00.000Z",
            }
          : base.stat(logicalPath),
      list: async (logicalPath: string) =>
        logicalPath === ""
          ? [
              {
                name: "Reports",
                logicalPath: "Reports",
                kind: "folder" as const,
                sizeBytes: 0,
                modifiedAt: "2026-09-22T00:00:00.000Z",
              },
            ]
          : base.list(logicalPath),
    } as unknown as StorageAdapter;
    const archive = unzipSync(
      (await createFolderArchive(rootStorage, "")).body
    );
    expect(Object.keys(archive)).toContain("Reports/2026/brief.txt");
  });
});

describe("batch download", () => {
  it("creates one ZIP containing selected files and folders", async () => {
    const result = await createSelectionArchive(storageFixture(), [
      "Reports",
      "Other.txt",
    ]);
    const archive = unzipSync(result.body);
    expect(result.filename).toBe("spark-selected-files.zip");
    expect(Buffer.from(archive["Reports/2026/brief.txt"]).toString()).toBe(
      "DOE brief"
    );
    expect(Buffer.from(archive["Reports/readme.md"]).toString()).toBe(
      "read me"
    );
    expect(Buffer.from(archive["Other.txt"]).toString()).toBe("other");
  });

  it("rejects empty and overlapping selections", async () => {
    await expect(createSelectionArchive(storageFixture(), [])).rejects.toThrow(
      "INVALID_SELECTION"
    );
    await expect(
      createSelectionArchive(storageFixture(), ["Reports", "Reports/readme.md"])
    ).rejects.toThrow("INVALID_SELECTION");
  });
});
