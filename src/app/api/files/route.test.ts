// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  service: vi.fn(),
  database: vi.fn(),
  recent: vi.fn(),
}));

vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/files/file-runtime", () => ({ getFileService: mocks.service }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/discovery-repository", () => ({ addRecentItem: mocks.recent }));

import { DELETE, GET, PATCH } from "./route";

beforeEach(() => {
  mocks.user.mockReset();
  mocks.service.mockReset();
  mocks.database.mockReset();
  mocks.recent.mockReset();
});

describe("file routes", () => {
  it("rejects unauthenticated listing with private cache headers", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(new Request("http://spark.test/api/files"));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns a bounded listing for the current user", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.database.mockReturnValue({});
    const list = vi.fn().mockImplementation(async (_path: string, options?: { onTiming?: (timing: Record<string, unknown>) => void }) => {
      options?.onTiming?.({ pathValidationMs: 1, symlinkCheck: { rootLstatMs: 0.5, segmentLstatsMs: 0.25, segmentCount: 2, slowestSegmentLstatMs: 0.2, slowestSegmentIndex: 1 }, directoryStatMs: 2, cache: "miss", readdirMs: 3, metadataMs: 4, sortMs: 5, entryCount: 1 });
      return [{ name: "note.txt", kind: "file" }];
    });
    mocks.service.mockReturnValue({ list });
    const response = await GET(new Request("http://spark.test/api/files?path=Reports"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: "Reports", entries: [{ name: "note.txt", kind: "file" }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^auth;dur=\d+(?:\.\d+)?, path;dur=1\.0, root-lstat;dur=0\.5, segment-lstats;dur=0\.3, segment-count;desc="2", slowest-segment-lstat;dur=0\.2, slowest-segment-index;desc="1", directory;dur=2\.0, readdir;dur=3\.0, metadata;dur=4\.0, sort;dur=5\.0, list;dur=\d+(?:\.\d+)?, recent;dur=\d+(?:\.\d+)?, total;dur=\d+(?:\.\d+)?$/);
    expect(list).toHaveBeenCalledWith("Reports", expect.objectContaining({ onTiming: expect.any(Function) }));
    expect(mocks.recent).toHaveBeenCalledWith({}, "user-1", "Reports");
  });

  it("rejects a mutation without a valid origin", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    const response = await PATCH(new Request("http://spark.test/api/files", { method: "PATCH", body: "{}" }));
    expect(response.status).toBe(403);
  });

  it("returns unauthenticated delete without invoking storage", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await DELETE(new Request("http://spark.test/api/files?path=note.txt", { method: "DELETE", headers: { origin: "http://localhost:3000" } }));
    expect(response.status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
