// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  database: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/discovery-repository", () => ({
  listRecentItems: mocks.list,
}));
import { GET } from "./route";
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});
describe("recent route", () => {
  it("requires auth and returns bounded private recent items", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.database.mockReturnValue({});
    mocks.list.mockReturnValue([
      { userId: "u1", logicalPath: "docs/a.txt", accessedAt: "now" },
    ]);
    const response = await GET(
      new Request("http://spark.test/api/discovery/recent?limit=50")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      items: [{ userId: "u1", logicalPath: "docs/a.txt", accessedAt: "now" }],
    });
    expect(mocks.list).toHaveBeenCalledWith({}, "u1", 50);
  });
  it("rejects an invalid limit", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    const response = await GET(
      new Request("http://spark.test/api/discovery/recent?limit=0")
    );
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
