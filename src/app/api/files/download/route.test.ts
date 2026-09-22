// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), storage: vi.fn(), database: vi.fn(), recent: vi.fn(), archive: vi.fn(), activity: vi.fn() }));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/files/file-runtime", () => ({ getFileStorage: mocks.storage }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/discovery-repository", () => ({ addRecentItem: mocks.recent }));
vi.mock("@/features/files/folder-download", () => ({ createFolderArchive: mocks.archive }));
vi.mock("@/features/activity/activity-repository", () => ({ recordActivity: mocks.activity }));
import { GET } from "./route";
beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.database.mockReturnValue({}); });
describe("download route", () => {
  it("records a recent item only after a successful authenticated download", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.storage.mockReturnValue({ stat: vi.fn().mockResolvedValue({ kind: "file" }), readFile: vi.fn().mockResolvedValue(Buffer.from("data")) });
    const response = await GET(new Request("http://spark.test/api/files/download?path=docs/a.txt"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.recent).toHaveBeenCalledWith({}, "u1", "docs/a.txt");
  });
  it("does not record failed downloads", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.storage.mockReturnValue({ stat: vi.fn().mockRejectedValue(new Error("NOT_FOUND")) });
    const response = await GET(new Request("http://spark.test/api/files/download?path=docs/a.txt"));
    expect(response.status).toBe(404); expect(mocks.recent).not.toHaveBeenCalled();
  });
  it("does not record a recent item when reading the file fails", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.storage.mockReturnValue({ stat: vi.fn().mockResolvedValue({ kind: "file" }), readFile: vi.fn().mockRejectedValue(new Error("READ_FAILED")) });
    const response = await GET(new Request("http://spark.test/api/files/download?path=docs/a.txt"));
    expect(response.status).toBe(400);
    expect(mocks.recent).not.toHaveBeenCalled();
  });

  it("downloads a folder as a ZIP and records the recent item", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.storage.mockReturnValue({ stat: vi.fn().mockResolvedValue({ kind: "folder" }) });
    mocks.archive.mockResolvedValue({ body: Buffer.from("zip"), filename: "Reports.zip" });
    const response = await GET(new Request("http://spark.test/api/files/download?path=Reports"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("Reports.zip");
    expect(mocks.archive).toHaveBeenCalledWith(mocks.storage(), "Reports");
    expect(mocks.recent).toHaveBeenCalledWith({}, "u1", "Reports");
  });
});
