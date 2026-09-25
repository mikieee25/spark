// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), origin: vi.fn(), storage: vi.fn(), service: vi.fn(), database: vi.fn(),
  recent: vi.fn(), activity: vi.fn(), archive: vi.fn(), deleteToRecycle: vi.fn(),
}));

vi.mock("@/features/access/access-policy", () => ({ authorizeCapability: mocks.authorize }));
vi.mock("@/features/auth/origin", () => ({ hasValidMutationOrigin: mocks.origin }));
vi.mock("@/features/files/file-runtime", () => ({ getFileStorage: mocks.storage, getFileService: mocks.service }));
vi.mock("@/features/discovery/discovery-repository", () => ({ addRecentItem: mocks.recent }));
vi.mock("@/features/activity/activity-repository", () => ({ recordActivity: mocks.activity }));
vi.mock("@/features/files/folder-download", () => ({ createSelectionArchive: mocks.archive }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://spark.test/api/files/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://spark.test" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.authorize.mockResolvedValue({ user: { id: "u1", role: "user" }, actorType: "user" });
  mocks.origin.mockReturnValue(true);
  mocks.database.mockReturnValue({});
  mocks.storage.mockReturnValue({});
  mocks.service.mockReturnValue({ deleteToRecycle: mocks.deleteToRecycle });
});

describe("batch file route", () => {
  it("downloads a selected file/folder set as a private ZIP", async () => {
    mocks.archive.mockResolvedValue({ body: Buffer.from("zip"), filename: "spark-selected-files.zip" });

    const response = await POST(request({ action: "download", paths: ["Reports", "note.txt"] }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.archive).toHaveBeenCalledWith({}, ["Reports", "note.txt"]);
    expect(mocks.activity).toHaveBeenCalledWith({}, expect.objectContaining({ action: "file_download", paths: ["Reports", "note.txt"] }));
  });

  it("requires a valid origin before recycling selected items", async () => {
    mocks.origin.mockReturnValue(false);

    const response = await POST(request({ action: "recycle", paths: ["note.txt"] }));

    expect(response.status).toBe(403);
    expect(mocks.deleteToRecycle).not.toHaveBeenCalled();
  });

  it("returns per-item recycle successes and failures", async () => {
    mocks.deleteToRecycle.mockImplementation(async (_user: unknown, { path }: { path: string }) => {
      if (path === "bad.txt") throw new Error("NOT_FOUND");
      return { id: `recycle-${path}` };
    });

    const response = await POST(request({ action: "recycle", paths: ["good.txt", "bad.txt"] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ succeeded: ["good.txt"], failed: [{ path: "bad.txt", error: "NOT_FOUND" }], undo: [{ id: "recycle-good.txt", path: "good.txt" }] });
  });

  it("rejects duplicate paths", async () => {
    const response = await POST(request({ action: "download", paths: ["note.txt", "note.txt"] }));

    expect(response.status).toBe(400);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("rejects overlapping paths even when another sibling sorts between them", async () => {
    const response = await POST(request({ action: "download", paths: ["A", "A-b.txt", "A/file.txt"] }));

    expect(response.status).toBe(400);
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});
